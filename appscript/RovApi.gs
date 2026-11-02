// RovApi.gs — token-protected web API so Claude (or any script) can edit the sheet
//
// SETUP (one time)
// 1. Paste this file into the same Apps Script project as RovSync.gs (File > + > Script).
// 2. Reload the sheet, then run ROV > Set API Token and enter a long random string.
// 3. Deploy > New deployment > type "Web app":
//      Execute as: Me      Who has access: Anyone
//    Copy the /exec URL. (Re-deploy via "Manage deployments" after editing this file.)
// 4. Give the URL and token to Claude in your shell, NOT in the repo:
//      export ROV_API_URL='https://script.google.com/macros/s/.../exec'
//      export ROV_API_TOKEN='...'
//
// Every request is a JSON POST: { token, action, ... }. Every mutating action first
// copies the sheet to a "Backup <timestamp>" tab (delete old backups when you like).
// Mutations are previews unless "confirm": true is sent.
//
//   read        {}                                   → { rows: [{row, values[A–L]}] }
//   appendRows  {rows: [[A..L], ...], confirm}       → adds rows at the bottom
//   updateCells {updates: [{row, col, value}], confirm}   (row/col are 1-based)
//   deleteRows  {rows: [rowNumbers], confirm}        → deletes those sheet rows
//
// Example: curl -sL -X POST "$ROV_API_URL" -d '{"token":"'$ROV_API_TOKEN'","action":"read"}'

const API_TOKEN_PROP = 'ROV_API_TOKEN';
const API_NUM_COLS   = 12;  // A–L

function setApiToken() {
  const ui = SpreadsheetApp.getUi();
  const r  = ui.prompt('Set API token', 'Enter a long random string (20+ characters):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const t = r.getResponseText().trim();
  if (t.length < 20) { ui.alert('Token too short — nothing saved.'); return; }
  PropertiesService.getScriptProperties().setProperty(API_TOKEN_PROP, t);
  ui.alert('API token saved.');
}

function apiOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return apiOut_({ ok: false, error: 'Bad JSON' }); }

  const saved = PropertiesService.getScriptProperties().getProperty(API_TOKEN_PROP) || '';
  const given = String(req.token || '');
  let diff = saved.length ^ given.length;
  for (let i = 0; i < saved.length; i++) diff |= saved.charCodeAt(i) ^ (given.charCodeAt(i) || 0);
  if (!saved || diff !== 0) return apiOut_({ ok: false, error: 'Unauthorized' });

  try {
    const sheet = getSheet_();
    switch (req.action) {
      case 'read':        return apiOut_(apiRead_(sheet));
      case 'appendRows':  return apiOut_(apiAppend_(sheet, req));
      case 'updateCells': return apiOut_(apiUpdate_(sheet, req));
      case 'deleteRows':  return apiOut_(apiDelete_(sheet, req));
      default:            return apiOut_({ ok: false, error: 'Unknown action: ' + req.action });
    }
  } catch (err) {
    return apiOut_({ ok: false, error: String(err) });
  }
}

function apiRead_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true, rows: [] };
  const tz   = Session.getScriptTimeZone();
  const vals = sheet.getRange(2, 1, last - 1, API_NUM_COLS).getValues();
  const rows = vals.map((v, i) => ({
    row: i + 2,
    values: v.map(c => c instanceof Date ? Utilities.formatDate(c, tz, 'M/d/yyyy h:mm a') : c),
  }));
  return { ok: true, rows: rows.filter(r => r.values.some(c => c !== '' && c !== false)) };
}

function apiBackup_(sheet) {
  const name = 'Backup ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const copy = sheet.copyTo(sheet.getParent()).setName(name);
  copy.hideSheet();
  return name;
}

function apiAppend_(sheet, req) {
  const rows = (req.rows || []).map(r => { const x = r.slice(0, API_NUM_COLS); while (x.length < API_NUM_COLS) x.push(''); return x; });
  if (!req.confirm) return { ok: true, preview: true, wouldAppend: rows.length };
  const backup = apiBackup_(sheet);
  const start  = Math.max(sheet.getLastRow(), 1) + 1;
  // Blank Cancelled cell is fine; the checkbox validation already covers 500 rows.
  sheet.getRange(start, 1, rows.length, API_NUM_COLS).setValues(rows);
  formatSheet();
  return { ok: true, backup, appended: rows.length, firstRow: start };
}

function apiUpdate_(sheet, req) {
  const ups = req.updates || [];
  if (!req.confirm) return { ok: true, preview: true, wouldUpdate: ups.length };
  const backup = apiBackup_(sheet);
  ups.forEach(u => sheet.getRange(u.row, u.col).setValue(u.value));
  formatSheet();
  return { ok: true, backup, updated: ups.length };
}

function apiDelete_(sheet, req) {
  const rows = (req.rows || []).map(Number);
  if (rows.some(r => !(r >= 2))) return { ok: false, error: 'Row numbers must be >= 2 (row 1 is the header)' };
  const uniq = Array.from(new Set(rows)).sort((a, b) => b - a);  // bottom-up so numbers stay valid
  if (!req.confirm) return { ok: true, preview: true, wouldDelete: uniq.length };
  const backup = apiBackup_(sheet);
  uniq.forEach(r => sheet.deleteRow(r));
  formatSheet();
  return { ok: true, backup, deleted: uniq.length };
}
