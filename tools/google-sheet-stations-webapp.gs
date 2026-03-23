function doGet(e) {
  var sheetName = (e && e.parameter && e.parameter.sheet) || "stations";
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    return jsonOutput_({
      ok: false,
      error: "Sheet not found",
      sheet: sheetName,
      stations: [],
    });
  }

  var values = sheet.getDataRange().getValues();
  if (!values.length) {
    return jsonOutput_({
      ok: true,
      source: "google-sheet",
      sheet: sheetName,
      generatedAt: new Date().toISOString(),
      count: 0,
      stations: [],
    });
  }

  var headers = values[0].map(function(header) {
    return normalizeHeader_(header);
  });

  var stations = values
    .slice(1)
    .map(function(row) {
      return rowToStation_(headers, row);
    })
    .filter(function(row) {
      return row && row.id;
    });

  return jsonOutput_({
    ok: true,
    source: "google-sheet",
    sheet: sheetName,
    generatedAt: new Date().toISOString(),
    count: stations.length,
    stations: stations,
  });
}

function rowToStation_(headers, row) {
  var record = {};
  headers.forEach(function(header, index) {
    record[header] = row[index];
  });

  var id = asString_(record.id || record.stationid || record.station_id);
  if (!id) {
    return null;
  }

  return {
    id: id,
    name: asString_(record.name) || id,
    brand: asString_(record.brand) || "ไม่ทราบแบรนด์",
    area: asString_(record.area) || "ยังไม่ระบุพื้นที่",
    lat: asNumber_(record.lat || record.latitude),
    lng: asNumber_(record.lng || record.lon || record.longitude),
    reportCount: asInteger_(record.reportcount || record.report_count),
    photoUrl: asString_(record.photourl || record.photo_url),
    updatedAt: asIsoDate_(record.updatedat || record.updated_at || record.reporttime || record.report_time || record.createdat || record.created_at),
    createdAt: asIsoDate_(record.createdat || record.created_at || record.updatedat || record.updated_at),
    importSource: asString_(record.importsource || record.import_source || "google-sheet"),
    importProvince: asString_(record.importprovince || record.import_province),
    lastReportId: asString_(record.lastreportid || record.last_report_id),
    lastReporter: asString_(record.lastreporter || record.last_reporter),
    fuelStates: {
      diesel: asFuel_(record.fuel_diesel || record.diesel),
      gas91: asFuel_(record.fuel_gas91 || record.gas91),
      gas95: asFuel_(record.fuel_gas95 || record.gas95),
      e20: asFuel_(record.fuel_e20 || record.e20),
      e85: asFuel_(record.fuel_e85 || record.e85),
      lpg: asFuel_(record.fuel_lpg || record.lpg),
    },
  };
}

function normalizeHeader_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

function asString_(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asNumber_(value) {
  var number = Number(value);
  return isFinite(number) ? number : null;
}

function asInteger_(value) {
  var number = Number(value);
  return isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function asIsoDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return value.toISOString();
  }

  var text = asString_(value);
  if (!text) {
    return "";
  }

  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function asFuel_(value) {
  var normalized = asString_(value).toLowerCase();
  switch (normalized) {
    case "high":
    case "medium":
    case "low":
    case "empty":
      return normalized;
    default:
      return "unknown";
  }
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
