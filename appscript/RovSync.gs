// RovSync.gs — ROV Club spreadsheet utilities
//
// INSTALLATION
// 1. In your Google Sheet: Extensions > Apps Script
// 2. Paste this file, save (Ctrl+S)
// 3. Run "setupSheet" from the function dropdown and authorize when prompted
// 4. Reload the spreadsheet — you will see the ROV menu
//
// COLUMNS (A–K)
//   A: Event type  (class | service | competition | workday | fieldtrip | mentors | presentation | other)
//   B: Cancelled   (checkbox — checked = cancelled)
//   C: Date
//   D: Start Time
//   E: End Time
//   F: Description (event type shown on website when blank)
//   G: Summary
//   H: Picture URL
//   I: Comments
//   J: Location    (optional — used in Google Calendar sync)
//   K: Calendar Event ID  ← auto-managed, do not edit

const SHEET_NAME  = 'Calendar';  // Change to match your tab name exactly
const CALENDAR_ID = 'c_148f1519506e3d16ae70587c9b7790fc5aa331e2cfd689a0e73fe707a72e0ecb@group.calendar.google.com'; // 'primary' = your main Google Calendar
                                // Run ROV > Calendar Sync Help to use a different calendar

// Column numbers (1-based, for Sheets API)
const C_TYPE  = 1;
const C_CANC  = 2;
const C_DATE  = 3;
const C_START = 4;
const C_END   = 5;
const C_DESC  = 6;
const C_SUM   = 7;
const C_PIC   = 8;
const C_COMM  = 9;
const C_LOC   = 10;
const C_CALID = 11;

const HEADERS = [
  'Event Type', 'Cancelled', 'Date', 'Start Time', 'End Time',
  'Description', 'Summary', 'Picture URL', 'Comments', 'Location', 'Calendar Event ID'
];

const EVENT_TYPES = ['class', 'service', 'competition', 'workday', 'fieldtrip', 'mentors', 'presentation', 'other'];

const TYPE_COLORS = {
  'class':        '#c7d7fb',  // light blue
  'service':      '#fed7aa',  // light orange
  'competition':  '#bbf7d0',  // light green
  'workday':      '#fef9c3',  // light yellow
  'fieldtrip':    '#e9d5ff',  // light purple
  'mentors':      '#fce7f3',  // light pink
  'presentation': '#ccfbf1',  // light teal
  'other':        '#f3f4f6',  // light gray
};
const CANCELLED_BG = '#e5e7eb';
const CANCELLED_FG = '#888888';
const HEADER_BG    = '#1a3a6b';
const HEADER_FG    = '#ffffff';

// ── Menu ──────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ROV')
    .addItem('Set Up Sheet',            'setupSheet')
    .addItem('Format All Rows',         'formatSheet')
    .addSeparator()
    .addItem('Sync to Google Calendar', 'syncToCalendar')
    .addItem('Remove Synced Events',    'clearCalendarSync')
    .addSeparator()
    .addItem('Website Setup Guide',     'showPublishHelp')
    .addItem('Calendar Sync Help',      'showCalendarHelp')
    .addSeparator()
    .addItem('Install Edit Trigger',    'installTriggers')
    .addToUi();
}

// ── Sheet setup ────────────────────────────────────────────────────────────

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
}

function setupSheet() {
  // Always use whichever tab is currently visible
  const sheet = SpreadsheetApp.getActiveSheet();

  // Write headers only if A1 is blank
  if (!sheet.getRange(1, 1).getValue()) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }

  // Style header row
  const numCols = Math.max(sheet.getLastColumn(), HEADERS.length);
  sheet.getRange(1, 1, 1, numCols)
    .setBackground(HEADER_BG)
    .setFontColor(HEADER_FG)
    .setFontWeight('bold');

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(C_CALID, 160);
  sheet.getRange(1, C_CALID).setNote('Auto-managed by script — do not edit.');
  sheet.getRange(1, C_LOC).setNote('Optional: used as the location in Google Calendar events.');

  // Add dropdowns and checkboxes
  addValidation_(sheet);

  const name = sheet.getName();
  const mismatch = name !== SHEET_NAME
    ? `\n\nNote: your tab is named "${name}" but SHEET_NAME = "${SHEET_NAME}".\n` +
      `Update the SHEET_NAME constant at the top of the script to "${name}" so the edit trigger works.`
    : '';
  SpreadsheetApp.getUi().alert(`✓ Sheet "${name}" is set up!${mismatch}`);
}

function addValidation_(sheet) {
  // Cover 500 rows so dropdowns and checkboxes are ready for new entries.
  const numRows = Math.max(sheet.getLastRow() - 1, 500);

  sheet.getRange(2, C_TYPE, numRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(EVENT_TYPES, true)
      .setAllowInvalid(false)
      .build()
  );

  sheet.getRange(2, C_CANC, numRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireCheckbox()
      .build()
  );
}

// ── Row coloring ───────────────────────────────────────────────────────────

function isCancelledVal_(val) {
  return val === true || String(val == null ? '' : val).toLowerCase().trim() === 'true';
}

function colorRow_(sheet, rowNum, numCols, eventType, cancelled) {
  const r = sheet.getRange(rowNum, 1, 1, numCols);
  if (cancelled) {
    r.setBackground(CANCELLED_BG).setFontColor(CANCELLED_FG);
  } else {
    r.setBackground(TYPE_COLORS[eventType] || '#ffffff').setFontColor('#000000');
  }
}

function formatSheet() {
  const sheet   = getSheet_();
  const data    = sheet.getDataRange().getValues();
  const numCols = Math.max(data[0] ? data[0].length : 0, HEADERS.length);

  sheet.getRange(1, 1, 1, numCols)
    .setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');

  for (let i = 1; i < data.length; i++) {
    colorRow_(sheet, i + 1, numCols,
      String(data[i][C_TYPE - 1] || '').toLowerCase().trim(),
      isCancelledVal_(data[i][C_CANC - 1]));
  }

  SpreadsheetApp.getUi().alert('✓ Sheet formatted!');
}

// ── Edit trigger (auto-colors rows as you type) ────────────────────────────

function onEditTrigger(e) {
  const sheet = e.source.getSheetByName(SHEET_NAME);
  if (!sheet || e.range.getSheet().getName() !== SHEET_NAME) return;
  const row = e.range.getRow();
  if (row < 2) return;

  const vals = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];

  // If Event Type is blank on a new row, carry it down from the row above.
  if (!vals[C_TYPE - 1] && row > 2) {
    const prevType = String(sheet.getRange(row - 1, C_TYPE).getValue() || '').trim();
    if (prevType) {
      sheet.getRange(row, C_TYPE).setValue(prevType);
      vals[C_TYPE - 1] = prevType;
    }
  }

  colorRow_(sheet, row, HEADERS.length,
    String(vals[C_TYPE - 1] || '').toLowerCase().trim(),
    isCancelledVal_(vals[C_CANC - 1]));
}

function installTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onEditTrigger')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onEditTrigger').forSpreadsheet(ss).onEdit().create();
  SpreadsheetApp.getUi().alert('✓ Edit trigger installed — rows will auto-color as you type.');
}

// ── Date / time parsing (Sheets returns Date objects for date/time cells) ──

function dateOnly_(val) {
  if (val instanceof Date) return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  const m = String(val).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(+m[3], +m[1] - 1, +m[2]) : null;
}

function timeHM_(val) {
  if (!val && val !== 0) return null;
  // Sheets time-value cells arrive as Date objects anchored to Dec 30 1899
  if (val instanceof Date) return { h: val.getHours(), m: val.getMinutes() };
  const s  = String(val);
  const ap = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ap) {
    let h = +ap[1];
    if (ap[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (ap[3].toUpperCase() === 'AM' && h === 12)  h = 0;
    return { h, m: +ap[2] };
  }
  const hm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return hm ? { h: +hm[1], m: +hm[2] } : null;
}

function buildDt_(dateVal, timeVal) {
  const d = dateOnly_(dateVal);
  if (!d) return null;
  const t = timeHM_(timeVal);
  return t
    ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.m)
    : d;
}

// ── Google Calendar sync ───────────────────────────────────────────────────

function getCal_() {
  const cal = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) throw new Error(
    `Calendar "${CALENDAR_ID}" not found.\nRun ROV > Calendar Sync Help for instructions.`
  );
  return cal;
}

function syncToCalendar() {
  let cal;
  try { cal = getCal_(); }
  catch (e) { SpreadsheetApp.getUi().alert(e.message); return; }

  const sheet = getSheet_();
  const data  = sheet.getDataRange().getValues();
  let created = 0, updated = 0, deleted = 0, skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row       = data[i];
    const eventType = String(row[C_TYPE  - 1] || '').trim();
    const cancelled = isCancelledVal_(row[C_CANC  - 1]);
    const dateVal   = row[C_DATE  - 1];
    const startVal  = row[C_START - 1];
    const endVal    = row[C_END   - 1];
    const desc      = String(row[C_DESC  - 1] || eventType).trim();
    const summary   = String(row[C_SUM   - 1] || '').trim();
    const comments  = String(row[C_COMM  - 1] || '').trim();
    const location  = String(row[C_LOC   - 1] || '').trim();
    let   calId     = String(row[C_CALID - 1] || '').trim();

    if (!eventType && !dateVal) { skipped++; continue; } // blank row

    const startDt = buildDt_(dateVal, startVal);
    if (!startDt) { skipped++; continue; }

    // Remove cancelled events from calendar
    if (cancelled) {
      if (calId) {
        try { const ev = cal.getEventById(calId); if (ev) { ev.deleteEvent(); deleted++; } } catch(e) {}
        sheet.getRange(i + 1, C_CALID).setValue('');
      }
      continue;
    }

    const title    = eventType ? `[${eventType}] ${desc}` : desc;
    const details  = [summary, comments].filter(Boolean).join('\n\n');
    const opts     = { description: details };
    const endDt    = endVal ? buildDt_(dateVal, endVal) : null;
    const isAllDay = !startVal;
    const fallbackEnd = new Date(startDt.getTime() + 3600000); // +1 h

    if (location) opts.location = location;

    // Update existing event
    if (calId) {
      try {
        const ev = cal.getEventById(calId);
        if (ev) {
          ev.setTitle(title);
          if (!isAllDay) ev.setTime(startDt, endDt || fallbackEnd);
          ev.setDescription(details);
          if (location) ev.setLocation(location);
          updated++;
          continue;
        }
      } catch(e) { /* manually deleted — fall through to re-create */ }
    }

    // Create new event
    const newEv = isAllDay
      ? cal.createAllDayEvent(title, startDt, opts)
      : cal.createEvent(title, startDt, endDt || fallbackEnd, opts);
    sheet.getRange(i + 1, C_CALID).setValue(newEv.getId());
    created++;
    Utilities.sleep(100); // stay within API quota
  }

  SpreadsheetApp.getUi().alert(
    `✓ Calendar sync complete!\n\nCreated: ${created}   Updated: ${updated}   Deleted: ${deleted}   Skipped: ${skipped}`
  );
}

function clearCalendarSync() {
  const ui  = SpreadsheetApp.getUi();
  const res = ui.alert('Remove all synced events?',
    'This deletes ROV events from Google Calendar and clears the Calendar Event ID column. Continue?',
    ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;

  let cal;
  try { cal = getCal_(); } catch(e) { ui.alert(e.message); return; }

  const sheet = getSheet_();
  const data  = sheet.getDataRange().getValues();
  let deleted = 0;

  for (let i = 1; i < data.length; i++) {
    const calId = String(data[i][C_CALID - 1] || '').trim();
    if (!calId) continue;
    try { const ev = cal.getEventById(calId); if (ev) { ev.deleteEvent(); deleted++; } } catch(e) {}
    sheet.getRange(i + 1, C_CALID).setValue('');
    Utilities.sleep(50);
  }

  ui.alert(`✓ Removed ${deleted} calendar event(s).`);
}

// ── Help dialogs ───────────────────────────────────────────────────────────

function showCalendarHelp() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 10px 16px; }
      h3   { margin-top: 0; color: #17458F; }
      code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-size: 11px; word-break: break-all; }
      ol   { padding-left: 1.3em; }
      li   { margin-bottom: 0.5em; }
    </style>
    <h3>Google Calendar Sync Setup</h3>
    <p>By default the script syncs to <code>CALENDAR_ID = 'primary'</code> (your main Google Calendar).
       To use a different calendar:</p>
    <ol>
      <li>Go to <a href="https://calendar.google.com" target="_blank">calendar.google.com</a></li>
      <li>Click <b>⋮</b> next to the target calendar → <b>Settings and sharing</b></li>
      <li>Scroll to <b>Integrate calendar</b> → copy the <b>Calendar ID</b><br>
          (looks like <code>abc123@group.calendar.google.com</code>)</li>
      <li>In the Apps Script editor, change:<br>
          <code>const CALENDAR_ID = 'primary';</code><br>to:<br>
          <code>const CALENDAR_ID = 'your-id@group.calendar.google.com';</code></li>
      <li>Save, then run <b>ROV → Sync to Google Calendar</b></li>
    </ol>
    <p><b>First sync:</b> Apps Script will ask permission to access your calendar — click <b>Allow</b>.</p>
    <p><b>How it works:</b> Each synced event gets an ID stored in column K.
       Run Sync again after edits to push changes. Cancelled events are removed from the calendar automatically.
       Fill in column J (Location) to set a location on the calendar event.</p>
  `).setWidth(500).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, 'Calendar Sync Help');
}

function showPublishHelp() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 10px 16px; }
      h3   { margin-top: 0; color: #17458F; }
      code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-size: 11px; word-break: break-all; }
      ol   { padding-left: 1.3em; }
      li   { margin-bottom: 0.55em; }
    </style>
    <h3>Website Setup Guide</h3>
    <p><b>Step 1 — Publish the sheet as CSV</b></p>
    <ol>
      <li>Click <b>File → Share → Publish to web</b></li>
      <li>Set: <b>Entire document</b> / <b>Comma-separated values (.csv)</b></li>
      <li>Click <b>Publish</b> and confirm</li>
      <li>Copy the URL — it starts with<br>
          <code>https://docs.google.com/spreadsheets/d/e/2PACX-…</code></li>
    </ol>
    <p><b>Step 2 — Connect to GitHub</b></p>
    <ol>
      <li>Open <code>assets/js/rov-common.js</code> in the GitHub repo</li>
      <li>Replace <code>PASTE_YOUR_PUBLISHED_CSV_URL_HERE</code> with the URL</li>
      <li>Commit and push — the site rebuilds in about a minute</li>
    </ol>
    <p>The sheet auto-republishes as you edit, so the website always shows current data.</p>
  `).setWidth(500).setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html, 'Website Setup Guide');
}
