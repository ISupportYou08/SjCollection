const CONFIG = {
  googleSheet: {
    id: "1CylHVMtpNjrE3-rv5FituTLvLvFti1CHiggrkH6dp3o",
    categoriesGid: "2093699902",
    moviesGid: "1462183924",
    seasonsGid: "1808615656",
    episodesGid: "1914245340",
    refreshMs: 10000
  }
};

const state = {
  categories: [],
  movies: [],
  seasons: [],
  episodes: [],
  currentView: "categories",
  selectedCategory: null,
  selectedMovie: null,
  selectedSeason: null,
  searchTerm: "",
  categoryFilter: "all",
  sort: "title-asc",
  refreshTimer: null,
  dataSource: "google-sheet"
};

const elements = {
  catalogGrid: document.querySelector("#catalogGrid"),
  categoryCardTemplate: document.querySelector("#categoryCardTemplate"),
  movieCardTemplate: document.querySelector("#movieCardTemplate"),
  seasonCardTemplate: document.querySelector("#seasonCardTemplate"),
  episodeCardTemplate: document.querySelector("#episodeCardTemplate"),
  emptyState: document.querySelector("#emptyState"),
  errorMessage: document.querySelector("#errorMessage"),
  errorState: document.querySelector("#errorState"),
  categoryFilter: document.querySelector("#categoryFilter"),
  loadingState: document.querySelector("#loadingState"),
  retryButton: document.querySelector("#retryButton"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  statusSummary: document.querySelector("#statusSummary"),
  totalCount: document.querySelector("#totalCount"),
  breadcrumbNav: document.querySelector("#breadcrumbNav"),
  backToCategories: document.querySelector("#backToCategories"),
  backToMovies: document.querySelector("#backToMovies"),
  backToSeasons: document.querySelector("#backToSeasons"),
  videoModal: document.querySelector("#videoModal"),
  videoModalTitle: document.querySelector("#videoModalTitle"),
  videoModalBody: document.querySelector("#videoModalBody"),
  videoModalClose: document.querySelector("#videoModalClose")
};

document.addEventListener("DOMContentLoaded", () => {
  bindControls();
  loadCatalog();
  startAutoRefresh();
});

function bindControls() {
  elements.searchInput.addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim().toLowerCase();
    renderCurrentView();
  });

  elements.categoryFilter.addEventListener("change", (event) => {
    state.categoryFilter = event.target.value;
    renderCurrentView();
  });

  elements.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderCurrentView();
  });

  elements.retryButton.addEventListener("click", () => loadCatalog({ showLoading: true }));

  elements.backToCategories.addEventListener("click", () => navigateTo("categories", { centerFeature: true }));
  elements.backToMovies.addEventListener("click", () => navigateTo("movies", { centerFeature: true }));
  elements.backToSeasons.addEventListener("click", () => navigateTo("seasons", { centerFeature: true }));

  elements.videoModal.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeVideoModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.videoModal.classList.contains("hidden")) {
      closeVideoModal();
    }
  });
}

async function loadCatalog({ showLoading = true } = {}) {
  if (showLoading) {
    setLoading(true);
  }
  setError("");

  try {
    const [categories, movies, seasons, episodes] = await Promise.all([
      fetchSheetData(CONFIG.googleSheet.categoriesGid),
      fetchSheetData(CONFIG.googleSheet.moviesGid),
      fetchSheetData(CONFIG.googleSheet.seasonsGid),
      fetchSheetData(CONFIG.googleSheet.episodesGid)
    ]);

    state.categories = normalizeCategories(categories);
    state.movies = normalizeMovies(movies);
    state.seasons = normalizeSeasons(seasons);
    state.episodes = normalizeEpisodes(episodes);

    buildCategoryOptions();
    renderCurrentView();
  } catch (error) {
    setError(error.message || "Something went wrong while loading the catalog.");
  } finally {
    if (showLoading) {
      setLoading(false);
    }
  }
}

async function fetchSheetData(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.googleSheet.id}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet data: ${response.status}`);
  }
  
  const csvText = await response.text();
  return csvToRecords(csvText);
}

function csvToRecords(csvText) {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => String(cell).trim()));

  if (rows.length === 0) {
    return [];
  }

  // Skip title row if present (check if first row looks like a title)
  let startIndex = 0;
  if (rows.length > 1 && !rows[0][0].includes('_') && rows[1][0].includes('_')) {
    startIndex = 1; // Skip title row
  }

  const headers = rows[startIndex].map((header) => String(header).trim());
  return rows.slice(startIndex + 1).map((row) => {
    return headers.reduce((record, header, index) => {
      const value = row[index] || "";
      record[header] = value;
      record[header.toLowerCase()] = value;
      record[normalizeHeaderName(header)] = value;
      return record;
    }, {});
  });
}

function normalizeHeaderName(header) {
  return String(header || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getField(record, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    if (value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += char;
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeCategories(categories) {
  return categories
    .map(cat => ({
      categoryId: getField(cat, ["category_id", "categoryid", "id"]),
      categoryName: getField(cat, ["category_name", "categoryname", "category", "name", "genre"]),
      description: getField(cat, ["description", "synopsis"]),
      bannerImageUrl: getField(cat, ["banner_image_url", "banner_url", "banner_image", "category_image_url", "image_url", "cover_image_url", "cover_image", "coverimage"]),
      isActive: String(getField(cat, ["is_active", "active"]) || "TRUE").toUpperCase() === "TRUE"
    }))
    .filter(cat => cat.isActive && cat.categoryId);
}

function normalizeMovies(movies) {
  return movies
    .map(movie => ({
      movieId: getField(movie, ["movie_id", "movieid", "id"]),
      categoryId: getField(movie, ["category_id", "categoryid", "category", "genre"]),
      title: getField(movie, ["title", "movie_title", "movietitle", "name"]),
      description: getField(movie, ["description", "synopsis"]),
      year: Number(movie.year || 0),
      rating: Number(movie.rating || 0),
      posterImageUrl: getField(movie, ["poster_image_url", "poster_url", "poster_image", "posterimage", "image_url", "cover_image_url", "cover_image", "coverimage"]),
      trailerUrl: getField(movie, ["trailer_url", "video_url", "watch_url"]),
      hasSeasons: String(getField(movie, ["has_seasons", "hasseasons"]) || "FALSE").toUpperCase() === "TRUE",
      isActive: String(getField(movie, ["is_active", "active"]) || "TRUE").toUpperCase() === "TRUE"
    }))
    .filter(movie => movie.isActive && movie.movieId);
}

function normalizeSeasons(seasons) {
  return seasons
    .map(season => ({
      seasonId: getField(season, ["season_id", "seasonid", "id"]),
      movieId: getField(season, ["movie_id", "movieid"]),
      seasonNumber: Number(season.season_number || 0),
      seasonTitle: getField(season, ["season_title", "seasontitle", "title", "name"]),
      year: Number(season.year || 0),
      description: getField(season, ["description", "synopsis"]),
      coverImageUrl: getField(season, ["cover_image_url", "cover_url", "cover_image", "coverimage", "poster_image_url", "image_url"])
    }))
    .filter(season => season.seasonId && season.movieId);
}

function normalizeEpisodes(episodes) {
  return episodes
    .map(ep => ({
      episodeId: getField(ep, ["episode_id", "episodeid", "id"]),
      seasonId: getField(ep, ["season_id", "seasonid"]),
      movieId: getField(ep, ["movie_id", "movieid"]),
      episodeNumber: Number(ep.episode_number || 0),
      title: getField(ep, ["title", "episode_title", "episodetitle", "name"]),
      description: getField(ep, ["description", "synopsis"]),
      durationMin: Number(ep.duration_min || 0),
      thumbnailUrl: getField(ep, ["thumbnail_url", "thumbnail", "image_url", "poster_image_url", "cover_image_url"]),
      videoUrl: getField(ep, ["video_url", "watch_url", "trailer_url"])
    }))
    .filter(ep => ep.episodeId);
}

function buildCategoryOptions() {
  const selectedCategory = state.categoryFilter;
  elements.categoryFilter.innerHTML = '<option value="all">All categories</option>';

  state.categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category.categoryId;
    option.textContent = category.categoryName;
    elements.categoryFilter.appendChild(option);
  });

  state.categoryFilter = selectedCategory === "all" || state.categories.find(c => c.categoryId === selectedCategory) ? selectedCategory : "all";
  elements.categoryFilter.value = state.categoryFilter;
}

function navigateTo(view, { centerFeature = false } = {}) {
  state.currentView = view;
  updateBreadcrumbs();
  renderCurrentView();

  if (centerFeature) {
    centerCurrentFeature();
  }
}

function centerCurrentFeature() {
  window.requestAnimationFrame(() => {
    const activeFeature = elements.catalogGrid.querySelector(
      ".movie-watch-card, .episode-card, .season-card, .movie-card, .category-card"
    );

    if (!activeFeature) {
      return;
    }

    activeFeature.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center"
    });
  });
}

function updateBreadcrumbs() {
  elements.breadcrumbNav.classList.toggle("hidden", state.currentView === "categories");
  elements.backToCategories.classList.toggle("hidden", state.currentView === "categories");
  elements.backToMovies.classList.toggle("hidden", state.currentView === "categories" || state.currentView === "movies");
  elements.backToSeasons.classList.toggle("hidden", state.currentView === "categories" || state.currentView === "movies" || state.currentView === "seasons");
}

function renderCurrentView() {
  elements.catalogGrid.innerHTML = "";

  switch (state.currentView) {
    case "categories":
      renderCategories();
      break;
    case "movies":
      renderMovies();
      break;
    case "seasons":
      renderSeasons();
      break;
    case "episodes":
      renderEpisodes();
      break;
  }
}

function renderCategories() {
  const filteredCategories = state.categories.filter(cat => 
    cat.categoryName.toLowerCase().includes(state.searchTerm)
  );

  elements.totalCount.textContent = String(filteredCategories.length);
  elements.statusSummary.textContent = `${filteredCategories.length} categories`;
  elements.emptyState.classList.toggle("hidden", filteredCategories.length > 0);

  filteredCategories.forEach(category => {
    const movieCount = state.movies.filter(m => m.categoryId === category.categoryId).length;
    elements.catalogGrid.appendChild(createCategoryCard(category, movieCount));
  });
}

function renderMovies() {
  let filteredMovies = state.movies.filter(movie => 
    movie.categoryId === state.selectedCategory.categoryId
  );

  if (state.categoryFilter !== "all") {
    filteredMovies = filteredMovies.filter(movie => movie.categoryId === state.categoryFilter);
  }

  filteredMovies = filteredMovies.filter(movie => 
    movie.title.toLowerCase().includes(state.searchTerm)
  );

  filteredMovies = sortItems(filteredMovies, "movie");

  elements.totalCount.textContent = String(filteredMovies.length);
  elements.statusSummary.textContent = `${filteredMovies.length} movies in ${state.selectedCategory.categoryName}`;
  elements.emptyState.classList.toggle("hidden", filteredMovies.length > 0);

  filteredMovies.forEach(movie => {
    elements.catalogGrid.appendChild(createMovieCard(movie));
  });
}

function renderSeasons() {
  const filteredSeasons = state.seasons
    .filter(season => season.movieId === state.selectedMovie.movieId)
    .filter(season => season.seasonTitle.toLowerCase().includes(state.searchTerm))
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  elements.totalCount.textContent = String(filteredSeasons.length);
  elements.statusSummary.textContent = `${filteredSeasons.length} seasons in ${state.selectedMovie.title}`;
  elements.emptyState.classList.toggle("hidden", filteredSeasons.length > 0);

  filteredSeasons.forEach(season => {
    elements.catalogGrid.appendChild(createSeasonCard(season));
  });
}

function renderEpisodes() {
  let filteredEpisodes;

  if (state.selectedSeason) {
    filteredEpisodes = state.episodes.filter(ep => ep.seasonId === state.selectedSeason.seasonId);
  } else {
    filteredEpisodes = state.episodes.filter(ep => ep.movieId === state.selectedMovie.movieId && !ep.seasonId);
  }

  // If movie has no seasons and no episodes, create a single episode from the movie trailer
  if (filteredEpisodes.length === 0 && !state.selectedMovie.hasSeasons && state.selectedMovie.trailerUrl) {
    filteredEpisodes = [{
      episodeId: state.selectedMovie.movieId,
      seasonId: "",
      movieId: state.selectedMovie.movieId,
      episodeNumber: 0,
      title: state.selectedMovie.title,
      description: "",
      durationMin: 0,
      thumbnailUrl: state.selectedMovie.posterImageUrl,
      videoUrl: state.selectedMovie.trailerUrl,
      isSingleMovie: true
    }];
  }

  if (!state.selectedMovie.hasSeasons) {
    filteredEpisodes = filteredEpisodes.map(episode => ({
      ...episode,
      description: "",
      durationMin: 0,
      thumbnailUrl: episode.thumbnailUrl || state.selectedMovie.posterImageUrl,
      isSingleMovie: true
    }));
  }

  filteredEpisodes = filteredEpisodes
    .filter(ep => ep.title.toLowerCase().includes(state.searchTerm))
    .sort((a, b) => a.episodeNumber - b.episodeNumber);

  elements.totalCount.textContent = String(filteredEpisodes.length);
  const context = state.selectedSeason ? `${state.selectedSeason.seasonTitle}` : state.selectedMovie.title;
  elements.statusSummary.textContent = !state.selectedMovie.hasSeasons
    ? `Ready to watch ${context}`
    : `${filteredEpisodes.length} episodes in ${context}`;
  elements.emptyState.classList.toggle("hidden", filteredEpisodes.length > 0);

  filteredEpisodes.forEach(episode => {
    elements.catalogGrid.appendChild(createEpisodeCard(episode));
  });
}

function sortItems(items, type) {
  const [field, direction] = state.sort.split("-");
  const modifier = direction === "desc" ? -1 : 1;

  return items.sort((a, b) => {
    if (field === "title") {
      return a.title.localeCompare(b.title) * modifier;
    }
    if (field === "year") {
      return (a.year - b.year) * modifier;
    }
    if (field === "rating") {
      return (a.rating - b.rating) * modifier;
    }
    return 0;
  });
}

function createCategoryCard(category, movieCount) {
  const card = elements.categoryCardTemplate.content.cloneNode(true);
  const image = card.querySelector(".cover-image");

  setCardImage(image, category.bannerImageUrl, category.categoryName);
  image.alt = `${category.categoryName} banner`;
  card.querySelector(".title").textContent = category.categoryName;
  setOptionalText(card.querySelector(".description"), category.description);
  card.querySelector(".count-badge").textContent = `${movieCount} movies`;

  card.querySelector("article").addEventListener("click", () => {
    state.selectedCategory = category;
    navigateTo("movies", { centerFeature: true });
  });

  return card;
}

function createMovieCard(movie) {
  const card = elements.movieCardTemplate.content.cloneNode(true);
  const image = card.querySelector(".cover-image");

  setCardImage(image, movie.posterImageUrl, movie.title);
  image.alt = `${movie.title} poster`;

  const category = state.categories.find(c => c.categoryId === movie.categoryId);
  card.querySelector(".category").textContent = category ? category.categoryName : "Uncategorized";
  card.querySelector(".title").textContent = movie.title;
  card.querySelector(".year").textContent = movie.year || "N/A";
  card.querySelector(".seasons-badge").textContent = movie.hasSeasons ? "Series" : "Movie";
  card.querySelector(".rating-badge").textContent = movie.rating ? `★ ${movie.rating}` : "";
  setOptionalText(card.querySelector(".description"), movie.description);

  card.querySelector("article").addEventListener("click", () => {
    state.selectedMovie = movie;
    if (movie.hasSeasons) {
      navigateTo("seasons", { centerFeature: true });
    } else {
      state.selectedSeason = null;
      navigateTo("episodes", { centerFeature: true });
    }
  });

  return card;
}

function createSeasonCard(season) {
  const card = elements.seasonCardTemplate.content.cloneNode(true);
  const image = card.querySelector(".cover-image");

  setCardImage(image, season.coverImageUrl, season.seasonTitle);
  image.alt = `${season.seasonTitle} cover`;

  card.querySelector(".title").textContent = season.seasonTitle;
  card.querySelector(".season-number").textContent = `Season ${season.seasonNumber}`;
  card.querySelector(".year").textContent = season.year || "N/A";
  setOptionalText(card.querySelector(".description"), season.description);

  card.querySelector("article").addEventListener("click", () => {
    state.selectedSeason = season;
    navigateTo("episodes", { centerFeature: true });
  });

  return card;
}

function createEpisodeCard(episode) {
  const card = elements.episodeCardTemplate.content.cloneNode(true);
  const article = card.querySelector("article");
  const episodeInfo = card.querySelector(".episode-info");
  const episodeNumber = card.querySelector(".episode-number");
  const title = card.querySelector(".title");
  const description = card.querySelector(".description");
  const duration = card.querySelector(".duration");
  const metaRow = card.querySelector(".meta-row");
  const thumbnail = card.querySelector(".episode-thumb");
  const watchBtn = card.querySelector(".watch-btn");

  if (episode.isSingleMovie) {
    article.classList.add("movie-watch-card");
    episodeNumber.remove();
    metaRow.remove();
    description.remove();
  } else {
    const episodeKicker = document.createElement("div");
    episodeKicker.className = "episode-kicker";
    episodeNumber.textContent = `EP ${episode.episodeNumber}`;
    episodeKicker.append(episodeNumber, metaRow);
    episodeInfo.prepend(episodeKicker);
  }

  title.textContent = episode.title;
  setCardImage(thumbnail, episode.thumbnailUrl || state.selectedMovie?.posterImageUrl, episode.title);
  thumbnail.alt = `${episode.title} thumbnail`;
  if (!episode.isSingleMovie) {
    setOptionalText(description, episode.description);
    setOptionalText(duration, episode.durationMin ? `${episode.durationMin} min` : "");
    metaRow.classList.toggle("hidden", !duration.textContent);
  }

  if (episode.videoUrl) {
    watchBtn.setAttribute("aria-label", `Play ${episode.title}`);
    watchBtn.addEventListener("click", () => {
      openVideoModal(episode.videoUrl, episode.title);
    });
  } else {
    watchBtn.style.display = "none";
  }

  return card;
}

function setOptionalText(element, value) {
  const text = cleanDisplayText(value);
  element.textContent = text;
  element.classList.toggle("hidden", !text);
}

function cleanDisplayText(value) {
  const text = String(value || "").trim();
  return isEmptySheetValue(text) ? "" : text;
}

function isEmptySheetValue(value) {
  return !value || /^n\/?a$/i.test(value) || /^none$/i.test(value) || /^null$/i.test(value);
}

function setCardImage(image, rawUrl, title) {
  image.onerror = null;
  image.src = getDisplayImageUrl(rawUrl) || getPlaceholderImage(title);
  image.onerror = () => {
    image.onerror = null;
    image.src = getPlaceholderImage(title);
  };
}

function getPlaceholderImage(text) {
  const label = escapeSvgText(text || "Poster");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#202434"/>
          <stop offset="0.55" stop-color="#171926"/>
          <stop offset="1" stop-color="#10131d"/>
        </linearGradient>
      </defs>
      <rect width="600" height="750" fill="url(#bg)"/>
      <rect x="44" y="44" width="512" height="662" rx="24" fill="none" stroke="#34394d" stroke-width="3"/>
      <circle cx="300" cy="280" r="76" fill="#252b3d"/>
      <path d="M270 240v80l76-40z" fill="#f7f8ff"/>
      <text x="300" y="450" fill="#f7f8ff" font-family="Arial, sans-serif" font-size="34" font-weight="700" text-anchor="middle">
        <tspan x="300">${label}</tspan>
      </text>
      <text x="300" y="510" fill="#aeb4c8" font-family="Arial, sans-serif" font-size="22" text-anchor="middle">Add a direct image URL</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getDisplayImageUrl(url) {
  if (!url) return "";

  const cleanedUrl = extractImageUrl(String(url).trim());
  if (!cleanedUrl) return "";
  
  // Handle Google Drive URLs
  const driveFileId = getGoogleDriveFileId(cleanedUrl);
  if (driveFileId) {
    return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1000`;
  }

  // Direct local files and common direct image URLs.
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".avif"];
  const lowerUrl = cleanedUrl.toLowerCase();
  if (imageExtensions.some(ext => lowerUrl.includes(ext))) {
    return encodeURI(cleanedUrl);
  }

  // Many CDN image links do not include a file extension. Let the browser try them;
  // the card onerror fallback will still handle true non-image pages.
  if (/^https?:\/\//i.test(cleanedUrl)) {
    if (isKnownPageUrl(cleanedUrl)) {
      return "";
    }
    return cleanedUrl;
  }
  
  return "";
}

function extractImageUrl(value) {
  const urlMatch = value.match(/https?:\/\/[^\s"'<>),]+/i);
  if (urlMatch) {
    return urlMatch[0];
  }

  return value;
}

function isKnownPageUrl(url) {
  return /imdb\.com\/title\/[^/]+\/mediaviewer/i.test(url)
    || /imdb\.com\/title\//i.test(url)
    || /\/mediaviewer\//i.test(url);
}

function escapeSvgText(value) {
  const text = String(value || "Poster").trim();
  const shortened = text.length > 24 ? `${text.slice(0, 21)}...` : text;

  return shortened
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getGoogleDriveFileId(url) {
  const filePathMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (filePathMatch) {
    return filePathMatch[1];
  }
  const queryIdMatch = url.match(/[?&]id=([^&]+)/i);
  return queryIdMatch ? queryIdMatch[1] : "";
}

function openVideoModal(rawUrl, title) {
  const url = String(rawUrl || "").trim();
  if (!url) {
    return;
  }

  elements.videoModalTitle.textContent = title || "Now playing";
  elements.videoModalBody.innerHTML = "";
  elements.videoModalBody.appendChild(buildVideoPlayer(url));

  elements.videoModal.classList.remove("hidden");
  elements.videoModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  elements.videoModalClose.focus();
}

function closeVideoModal() {
  elements.videoModal.classList.add("hidden");
  elements.videoModal.setAttribute("aria-hidden", "true");
  elements.videoModalBody.innerHTML = "";
  document.body.style.overflow = "";
}

function buildVideoPlayer(url) {
  const embedUrl = getVideoEmbedUrl(url);

  if (embedUrl) {
    const iframe = document.createElement("iframe");
    iframe.src = embedUrl;
    iframe.title = "Video player";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    return iframe;
  }

  if (isDirectVideoFile(url)) {
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    return video;
  }

  const message = document.createElement("div");
  message.className = "video-modal-message";
  const text = document.createElement("p");
  text.textContent = "This video can't be embedded here.";
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Open the video in a new tab";
  message.append(text, link);
  return message;
}

function getVideoEmbedUrl(url) {
  const driveFileId = getGoogleDriveFileId(url);
  if (driveFileId) {
    return `https://drive.google.com/file/d/${driveFileId}/preview`;
  }

  const youTubeId = getYouTubeId(url);
  if (youTubeId) {
    return `https://www.youtube.com/embed/${youTubeId}?autoplay=1`;
  }

  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
  }

  return "";
}

function getYouTubeId(url) {
  const patterns = [
    /youtu\.be\/([\w-]{11})/i,
    /youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)([\w-]{11})/i,
    /[?&]v=([\w-]{11})/i
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return "";
}

function isDirectVideoFile(url) {
  return /\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i.test(url);
}

function startAutoRefresh() {
  const refreshMs = Number(CONFIG.googleSheet?.refreshMs || 0);

  if (!CONFIG.googleSheet?.id || refreshMs <= 0) {
    return;
  }

  window.clearInterval(state.refreshTimer);
  state.refreshTimer = window.setInterval(() => {
    loadCatalog({ showLoading: false });
  }, refreshMs);
}

function setLoading(isLoading) {
  elements.loadingState.classList.toggle("hidden", !isLoading);
  elements.catalogGrid.classList.toggle("hidden", isLoading);
}

function setError(message) {
  elements.errorState.classList.toggle("hidden", !message);
  elements.errorMessage.textContent = message;
}
