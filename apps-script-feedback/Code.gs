/**
 * PokéBinder Centrale Feedback Hub — Google Apps Script Backend
 *
 * Staat volledig los van de collectie-spreadsheets (Test / Live / Demo):
 *  - Slaat alle feedback-items op in één centraal tabblad "Feedback"
 *  - Slaat meegeleverde screenshots automatisch op in Google Drive
 *    ("PokéBinder Feedback Screenshots") en retourneert publieke leesbare URLs.
 *
 * Eerste keer activeren (1x uitvoeren door de beheerder in Apps Script Editor):
 *   Selecteer functie `setupFeedbackHub` en klik op Run om Google Sheets & Drive rechten te verlenen.
 */

var APP_KEY = 'pokebinder-feedback-v1';
var FEEDBACK_SHEET_NAME = 'Feedback';
var SCREENSHOT_FOLDER_NAME = 'PokéBinder Feedback Screenshots';
var MAX_SCREENSHOT_BYTES = 1572864; // 1.5 MB
var ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

var FEEDBACK_HEADERS = [
  'ID',
  'Datum',
  'Pagina',
  'Categorie',
  'Titel',
  'Beschrijving',
  'Status',
  'Stemmen',
  'Auteur',
  'Platform',
  'Screenshot URL',
  'Screenshot File ID'
];

/**
 * Draai deze functie 1x handmatig in de Apps Script Editor om de Drive-map
 * en het Feedback-tabblad aan te maken en OAuth-toestemming te verlenen.
 */
function setupFeedbackHub() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureFeedbackSheet_(ss);
  var folder = ensureScreenshotFolder_();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('APP_KEY')) {
    props.setProperty('APP_KEY', APP_KEY);
  }

  var info = {
    spreadsheetUrl: ss.getUrl ? ss.getUrl() : '',
    sheetName: sheet.getName(),
    folderId: folder.getId(),
    folderUrl: folder.getUrl ? folder.getUrl() : 'https://drive.google.com/drive/folders/' + folder.getId()
  };

  if (typeof Logger !== 'undefined' && Logger.log) {
    Logger.log('PokéBinder Feedback Hub klaar: ' + JSON.stringify(info));
  }
  return info;
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (!isAppAuthorized_(params.appKey)) {
      return jsonResponse_({ ok: false, error: 'Ongeldige app-sleutel voor Feedback Hub.' });
    }

    var action = String(params.action || 'list').trim().toLowerCase();
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'ping') {
      return jsonResponse_({
        ok: true,
        spreadsheetName: ss.getName(),
        syncedAt: new Date().toISOString()
      });
    }

    if (action === 'list') {
      return jsonResponse_({
        ok: true,
        items: readFeedbackItems_(ss),
        syncedAt: new Date().toISOString()
      });
    }

    return jsonResponse_({ ok: false, error: 'Onbekende GET-actie: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    var rawBody = (e && e.postData && e.postData.contents) || '{}';
    var body = JSON.parse(rawBody);
    var providedKey = body.appKey || (e && e.parameter && e.parameter.appKey);

    if (!isAppAuthorized_(providedKey)) {
      return jsonResponse_({ ok: false, error: 'Ongeldige app-sleutel voor Feedback Hub.' });
    }

    lock.waitLock(20000);
    acquired = true;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = String(body.action || '').trim();
    var payload = body.payload || {};

    if (action === 'addFeedback') {
      var added = handleAddFeedback_(ss, payload);
      return jsonResponse_({
        ok: true,
        item: added,
        items: readFeedbackItems_(ss),
        syncedAt: new Date().toISOString()
      });
    }

    if (action === 'updateFeedback') {
      handleUpdateFeedback_(ss, payload);
      return jsonResponse_({
        ok: true,
        items: readFeedbackItems_(ss),
        syncedAt: new Date().toISOString()
      });
    }

    if (action === 'deleteFeedback') {
      handleDeleteFeedback_(ss, payload);
      return jsonResponse_({
        ok: true,
        items: readFeedbackItems_(ss),
        syncedAt: new Date().toISOString()
      });
    }

    return jsonResponse_({ ok: false, error: 'Onbekende POST-actie: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (acquired) {
      lock.releaseLock();
    }
  }
}

function isAppAuthorized_(providedKey) {
  var configured = null;
  try {
    configured = PropertiesService.getScriptProperties().getProperty('APP_KEY');
  } catch (e) {
    configured = null;
  }
  var expected = String(configured || APP_KEY).trim();
  return Boolean(providedKey) && String(providedKey).trim() === expected;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ensureFeedbackSheet_(ss) {
  var sheet = ss.getSheetByName(FEEDBACK_SHEET_NAME);
  if (!sheet && ss.getSheets) {
    var sheets = ss.getSheets();
    if (sheets && sheets.length === 1 && sheets[0].getLastRow() === 0) {
      sheet = sheets[0];
      if (sheet.setName) sheet.setName(FEEDBACK_SHEET_NAME);
    }
  }
  if (!sheet) {
    sheet = ss.insertSheet(FEEDBACK_SHEET_NAME);
  }
  var firstCell = sheet.getLastRow() >= 1 ? String(sheet.getRange(1, 1).getValue() || '').trim() : '';
  if (!firstCell) {
    sheet.getRange(1, 1, 1, FEEDBACK_HEADERS.length).setValues([FEEDBACK_HEADERS]);
    if (sheet.setFrozenRows) sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureScreenshotFolder_() {
  var props = PropertiesService.getScriptProperties();
  var savedId = '';
  try {
    savedId = String(props.getProperty('SCREENSHOT_FOLDER_ID') || '').trim();
  } catch (e) {
    savedId = '';
  }

  if (savedId) {
    try {
      var existing = DriveApp.getFolderById(savedId);
      if (existing && (!existing.isTrashed || !existing.isTrashed())) {
        return existing;
      }
    } catch (e) {
      // Maak opnieuw aan als map verwijderd of onbereikbaar is
    }
  }

  var iter = DriveApp.getFoldersByName ? DriveApp.getFoldersByName(SCREENSHOT_FOLDER_NAME) : null;
  var folder = iter && iter.hasNext() ? iter.next() : DriveApp.createFolder(SCREENSHOT_FOLDER_NAME);
  try {
    props.setProperty('SCREENSHOT_FOLDER_ID', folder.getId());
  } catch (e) {
    // Negeer als read-only
  }
  return folder;
}

function uploadScreenshotToDrive_(screenshot, itemId) {
  if (!screenshot || !screenshot.base64) return null;

  var mimeType = String(screenshot.mimeType || '').trim().toLowerCase();
  if (ALLOWED_MIME_TYPES.indexOf(mimeType) === -1) {
    throw new Error('Alleen PNG, JPEG of WebP screenshots worden ondersteund.');
  }

  var rawBase64 = String(screenshot.base64).replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  var bytes = Utilities.base64Decode(rawBase64);
  if (!bytes || bytes.length === 0) {
    throw new Error('Leeg screenshot-bestand ontvangen.');
  }
  if (bytes.length > MAX_SCREENSHOT_BYTES) {
    throw new Error('Screenshot is groter dan 1,5 MB na compressie.');
  }

  var ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  var cleanBaseName = String(screenshot.fileName || itemId || 'screenshot')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 48);
  var fileName = (cleanBaseName || 'screenshot') + '-' + Date.now() + '.' + ext;

  var folder = ensureScreenshotFolder_();
  var blob = Utilities.newBlob(bytes, mimeType, fileName);
  var file = folder.createFile(blob);
  if (file.setSharing && DriveApp.Access && DriveApp.Permission) {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  var fileId = file.getId();
  return {
    fileId: fileId,
    url: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w1600'
  };
}

function trashDriveFileSafe_(fileId) {
  var clean = String(fileId || '').trim();
  if (!clean || typeof DriveApp === 'undefined' || !DriveApp.getFileById) return;
  try {
    DriveApp.getFileById(clean).setTrashed(true);
  } catch (e) {
    // Negeer als bestand al verwijderd of niet toegankelijk is
  }
}

function readFeedbackItems_(ss) {
  var sheet = ss.getSheetByName(FEEDBACK_SHEET_NAME);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var colCount = sheet.getLastColumn ? Math.min(Math.max(sheet.getLastColumn(), 10), 12) : 12;
  var values = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  var items = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] || '').trim();
    var title = String(row[4] || '').trim();
    if (!id && !title) continue;

    var rawStatus = String(row[6] || 'open').trim().toLowerCase();
    var status =
      rawStatus === 'done' || rawStatus === 'afgerond'
        ? 'done'
        : rawStatus === 'in_progress' || rawStatus === 'bezig'
          ? 'in_progress'
          : 'open';

    var rawVotes = parseInt(row[7], 10);
    var votes = isNaN(rawVotes) ? 1 : Math.max(0, rawVotes);

    items.push({
      rowIndex: i + 2,
      id: id || 'hub-' + (i + 2),
      createdAt: formatDateCell_(row[1]),
      page: String(row[2] || 'Algemeen / Hele app').trim(),
      category: String(row[3] || 'Idee').trim(),
      title: title,
      description: String(row[5] || '').trim(),
      status: status,
      votes: votes,
      author: String(row[8] || 'Verzamelaar').trim(),
      platform: String(row[9] || 'Web App').trim(),
      source: 'hub',
      screenshotUrl: colCount >= 11 ? String(row[10] || '').trim() : '',
      screenshotFileId: colCount >= 12 ? String(row[11] || '').trim() : ''
    });
  }

  return items;
}

function handleAddFeedback_(ss, payload) {
  var title = String(payload.title || '').trim().slice(0, 160);
  if (!title) {
    throw new Error('Titel is verplicht voor feedback.');
  }

  var sheet = ensureFeedbackSheet_(ss);
  var targetRow = findFirstEmptyFeedbackRow_(sheet);
  var id = String(payload.id || 'fb-' + new Date().getTime()).trim();
  var createdAt = String(payload.createdAt || new Date().toISOString()).trim();
  var page = String(payload.page || 'Algemeen / Hele app').trim().slice(0, 80);
  var category = String(payload.category || 'Idee').trim().slice(0, 40);
  var description = String(payload.description || '').trim().slice(0, 4000);
  var status = normalizeStatus_(payload.status);
  var votesNum = parseInt(payload.votes, 10);
  var votes = isNaN(votesNum) ? 1 : Math.max(0, votesNum);
  var author = (String(payload.author || '').trim() || 'Verzamelaar').slice(0, 60);
  var platform = String(payload.platform || 'Web App').trim().slice(0, 80);

  var uploaded = payload.screenshot ? uploadScreenshotToDrive_(payload.screenshot, id) : null;
  var screenshotUrl = uploaded ? uploaded.url : '';
  var screenshotFileId = uploaded ? uploaded.fileId : '';

  sheet.getRange(targetRow, 1, 1, 12).setValues([[
    id,
    createdAt,
    page,
    category,
    title,
    description,
    status,
    votes,
    author,
    platform,
    screenshotUrl,
    screenshotFileId
  ]]);

  return {
    rowIndex: targetRow,
    id: id,
    createdAt: createdAt,
    page: page,
    category: category,
    title: title,
    description: description,
    status: status,
    votes: votes,
    author: author,
    platform: platform,
    source: 'hub',
    screenshotUrl: screenshotUrl,
    screenshotFileId: screenshotFileId
  };
}

function handleUpdateFeedback_(ss, payload) {
  var sheet = ss.getSheetByName(FEEDBACK_SHEET_NAME);
  if (!sheet) return { updated: false };
  var rowIdx = findFeedbackRowById_(sheet, payload.id);
  if (rowIdx < 2) return { updated: false };

  if (payload.page !== undefined) {
    sheet.getRange(rowIdx, 3).setValue(String(payload.page).trim().slice(0, 80));
  }
  if (payload.category !== undefined) {
    sheet.getRange(rowIdx, 4).setValue(String(payload.category).trim().slice(0, 40));
  }
  if (payload.title !== undefined) {
    var cleanTitle = String(payload.title).trim().slice(0, 160);
    if (!cleanTitle) throw new Error('Titel mag niet leeg zijn.');
    sheet.getRange(rowIdx, 5).setValue(cleanTitle);
  }
  if (payload.description !== undefined) {
    sheet.getRange(rowIdx, 6).setValue(String(payload.description).trim().slice(0, 4000));
  }
  if (payload.status !== undefined) {
    sheet.getRange(rowIdx, 7).setValue(normalizeStatus_(payload.status));
  }
  if (payload.votes !== undefined) {
    var v = parseInt(payload.votes, 10);
    sheet.getRange(rowIdx, 8).setValue(isNaN(v) ? 1 : Math.max(0, v));
  }
  if (payload.author !== undefined) {
    sheet.getRange(rowIdx, 9).setValue((String(payload.author).trim() || 'Verzamelaar').slice(0, 60));
  }

  var existingFileId = String(sheet.getRange(rowIdx, 12).getValue() || '').trim();
  if (payload.screenshot && payload.screenshot.base64) {
    var nextUpload = uploadScreenshotToDrive_(payload.screenshot, payload.id);
    if (nextUpload) {
      if (existingFileId && existingFileId !== nextUpload.fileId) {
        trashDriveFileSafe_(existingFileId);
      }
      sheet.getRange(rowIdx, 11, 1, 2).setValues([[nextUpload.url, nextUpload.fileId]]);
    }
  } else if (payload.removeScreenshot === true) {
    if (existingFileId) {
      trashDriveFileSafe_(existingFileId);
    }
    sheet.getRange(rowIdx, 11, 1, 2).setValues([['', '']]);
  }

  return { updated: true, rowIndex: rowIdx };
}

function handleDeleteFeedback_(ss, payload) {
  var sheet = ss.getSheetByName(FEEDBACK_SHEET_NAME);
  if (!sheet) return { deleted: false };
  var rowIdx = findFeedbackRowById_(sheet, payload.id);
  if (rowIdx < 2) return { deleted: false };

  var fileId = String(sheet.getRange(rowIdx, 12).getValue() || '').trim();
  if (fileId) {
    trashDriveFileSafe_(fileId);
  }
  sheet.getRange(rowIdx, 1, 1, 12).clearContent();
  return { deleted: true, rowIndex: rowIdx };
}

function findFeedbackRowById_(sheet, id) {
  if (!id) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var target = String(id).trim();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === target) return i + 2;
  }
  return -1;
}

function findFirstEmptyFeedbackRow_(sheet) {
  var lastRow = Math.max(sheet.getLastRow(), 2);
  var vals = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (!String(vals[i][0] || '').trim() && !String(vals[i][4] || '').trim()) {
      return i + 2;
    }
  }
  return lastRow + 1;
}

function normalizeStatus_(raw) {
  var s = String(raw || 'open').trim().toLowerCase();
  if (s === 'done' || s === 'afgerond') return 'done';
  if (s === 'in_progress' || s === 'bezig') return 'in_progress';
  return 'open';
}

function formatDateCell_(val) {
  if (!val) return '';
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return val.toISOString();
  }
  return String(val).trim();
}
