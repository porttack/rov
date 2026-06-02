// Shared utilities for ROV Club website pages (calendar.html, newsletter.html)

// Replace this with your sheet's "Publish to web" CSV URL.
// In your spreadsheet: File → Share → Publish to web → CSV → copy URL.
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT212z-hIqUM_QfOruiWt6kQqdmw_DJ2alT-tOYmyJIRIQGcfpr3zPPIBGkc9Zh3aCEzQtbG92a9ok_/pub?gid=0&single=true&output=csv';

// Column indices (0-based), matching spreadsheet column order:
// A: Event type | B: Cancelled | C: Date | D: Start Time | E: End Time
// F: Description | G: Summary | H: Picture | I: Comments | J: Location
const COL = {
  eventType:   0,
  cancelled:   1,
  date:        2,
  startTime:   3,
  endTime:     4,
  description: 5,
  summary:     6,
  picture:     7,
  comments:    8,
  location:    9,
};

// ── Parsing ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const rows = [];
  let cur = [], field = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i+1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { field += ch; }
    } else {
      if      (ch === '"')  { inQuote = true; }
      else if (ch === ',')  { cur.push(field); field = ''; }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (ch !== '\r') { field += ch; }
    }
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

const fv = (row, col) => (row[col] || '').trim();

const isCancelled = row => {
  const v = fv(row, COL.cancelled).toLowerCase();
  return v === 'true' || v === 'yes' || v === 'x';
};

// Returns the description field, falling back to event type when empty.
const getDesc = row => fv(row, COL.description) || fv(row, COL.eventType);

// ── Date / time helpers ───────────────────────────────────────────────────

// "3/18/2026" or "3/18/26" → "2026-03-18"
function normDateStr(ds) {
  const m = ds.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return ds;
  const year = +m[3] < 100 ? 2000 + +m[3] : +m[3];
  return `${year}-${String(+m[1]).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`;
}

function to24h(t) {
  if (!t) return '00:00:00';
  // Already 24-hour "H:MM:SS" from Sheets time-value export
  const hms = t.match(/^(\d{1,2}):(\d{2}):\d{2}$/);
  if (hms) return `${String(parseInt(hms[1])).padStart(2,'0')}:${hms[2]}:00`;
  // 12-hour "H:MM AM/PM" or "H:MM:SS AM/PM"
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (!m) return t;
  let h = parseInt(m[1]);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12)  h = 0;
  return `${String(h).padStart(2,'0')}:${m[2]}:00`;
}

function parseRowDate(row) {
  const ds = fv(row, COL.date);
  if (!ds) return null;
  const ts  = fv(row, COL.startTime);
  const iso = normDateStr(ds);
  const d   = new Date(ts ? `${iso}T${to24h(ts)}` : `${iso}T00:00:00`);
  return isNaN(d) ? null : d;
}

function abbrevTime(ts) {
  if (!ts) return '';
  let h, min;
  const hms = ts.match(/^(\d{1,2}):(\d{2}):\d{2}$/);
  if (hms) {
    h = parseInt(hms[1]); min = parseInt(hms[2]);
  } else {
    const m = ts.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if (!m) return '';
    h = parseInt(m[1]); min = parseInt(m[2]);
    if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m[3].toUpperCase() === 'AM' && h === 12)  h = 0;
  }
  const h12  = h % 12 || 12;
  const ampm = h >= 12 ? 'p' : 'a';
  return min === 0 ? `${h12}${ampm}` : `${h12}:${String(min).padStart(2,'0')}${ampm}`;
}

// ── HTML helpers ──────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function textToHtml(s) { return esc(s).replace(/\n/g,'<br>'); }

function mapLink(location) {
  if (!location) return '';
  const url = `https://maps.google.com/?q=${encodeURIComponent(location)}`;
  return `<a href="${url}" target="_blank" rel="noopener">${esc(location)}</a>`;
}

// ── Formatting ────────────────────────────────────────────────────────────

const fmt          = (d, opts) => d.toLocaleDateString('en-US', opts);
const fmtLong      = d => fmt(d, {weekday:'long', month:'long', day:'numeric', year:'numeric'});
const fmtShort     = d => fmt(d, {month:'short', day:'numeric'});
const fmtDayDate   = d => fmt(d, {weekday:'short', month:'short', day:'numeric'});
const fmtMonthYear = d => fmt(d, {month:'long', year:'numeric'});
