const DATA_FILE_ID = "1xesS9TW7-U0ojIi6Ew6eGfsIDRvHPCLelxn0IKp6MP4";
const PREFERRED_SHEET_NAME = "Anime";

function doGet() {
  try {
    const values = getSourceValues();

    if (values.length < 2) {
      return createJsonResponse([]);
    }

    const headers = values[0].map((header) => normalizeHeader(header));
    const anime = values.slice(1)
      .filter((row) => row.some((cell) => cell !== ""))
      .map((row) => rowToAnime(headers, row));

    return createJsonResponse(anime);
  } catch (error) {
    return createJsonResponse({
      error: error.message || "Unable to load anime data."
    });
  }
}

function getSourceValues() {
  try {
    const spreadsheet = SpreadsheetApp.openById(DATA_FILE_ID);
    const sheet = getAnimeSheet(spreadsheet);

    if (!sheet) {
      throw new Error("No sheet tabs were found in the spreadsheet.");
    }

    return sheet.getDataRange().getValues();
  } catch (error) {
    const file = DriveApp.getFileById(DATA_FILE_ID);
    const csvText = file.getBlob().getDataAsString();
    return Utilities.parseCsv(csvText);
  }
}

function getAnimeSheet(spreadsheet) {
  return spreadsheet.getSheetByName(PREFERRED_SHEET_NAME) || spreadsheet.getSheets()[0];
}

function rowToAnime(headers, row) {
  const record = {};

  headers.forEach((header, index) => {
    record[header] = row[index];
  });

  return {
    title: String(record.title || "").trim(),
    genre: String(record.genre || "").trim(),
    episodes: Number(record.episodes || 0),
    status: formatStatus(record.status),
    synopsis: String(record.synopsis || "").trim(),
    coverImage: String(record.coverimage || record.cover_image || record.image || record.poster || "").trim()
  };
}

function normalizeHeader(header) {
  return String(header)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function formatStatus(status) {
  const rawStatus = String(status || "Ongoing").trim();
  const normalized = rawStatus.toLowerCase();

  if (normalized === "completed") {
    return "Completed";
  }

  if (normalized === "ongoing") {
    return "Ongoing";
  }

  return rawStatus || "Ongoing";
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
