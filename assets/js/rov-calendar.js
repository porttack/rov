// Shared month-grid calendar logic, used by year.html and ms.md.
// Needs rov-common.js (COL, fv, normDateStr, isCancelled, getDesc, to24h, esc) loaded first.

// Program fill colors; a day with several programs is split in this order.
const PROGRAM_COLORS = { hs: '#93c5fd', charter: '#86efac', ms: '#fdba74' };
const PROGRAMS = Object.keys(PROGRAM_COLORS);
// Event types with their own color (any program): scrimmages and competitions/Worlds are violet, outreach (e.g. Science Night) is pink.
const EVENT_COLORS = { scrimmage: '#c4b5fd', competition: '#c4b5fd', outreach: '#f9a8d4',
                       meeting: '#f97316', mentors: '#f97316' };   // parent/family meetings; mentors reuse the color
const EVENT_LABELS = { scrimmage: 'Scrimmage', competition: 'Competition', outreach: 'Outreach', meeting: 'Meeting', mentors: 'Mentors' };
const isBigEvent = e => e.type in EVENT_COLORS;
// Legend checkbox category for an event: hs | charter | ms | scrimmage | outreach | meeting | holiday.
const EVENT_GROUP = { scrimmage: 'scrimmage', competition: 'scrimmage', outreach: 'outreach', meeting: 'meeting', mentors: 'meeting' };
const categoryOf = e => e.type === 'noschool' ? 'holiday' : (EVENT_GROUP[e.type] || e.program);
const isHiddenEvent = (e, hidden) => hidden.has(categoryOf(e)) || (e.cancelled && hidden.has('cancelled'));
const HOLIDAY_COLOR = '#d1d5db';   // no-school days (gray)

// Every event by ISO date, unfiltered.
function collectEvents(rows) {
  const allByDate = {};
  rows.forEach(row => {
    const dateStr = fv(row, COL.date);
    if (!dateStr) return;
    const iso = normDateStr(dateStr);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const type = fv(row, COL.eventType).toLowerCase() || 'other';
    const cancelled = isCancelled(row);
    if (!allByDate[iso]) allByDate[iso] = [];
    let program = fv(row, COL.program).toLowerCase();
    if (!PROGRAM_COLORS[program]) program = 'hs';   // blank/unknown = HS
    allByDate[iso].push({
      type, cancelled, program,
      startTs: fv(row, COL.startTime), endTs: fv(row, COL.endTime),
      desc: getDesc(row), summary: fv(row, COL.summary), picture: fv(row, COL.picture),
      comments: fv(row, COL.comments), location: fv(row, COL.location),
    });
  });
  return allByDate;
}

// Apply the hidden categories and work out each day's fill: school holidays
// (gray) plus each category with a non-cancelled event; several colors split
// the cell diagonally. Cancelled-only days get the red hatch class.
function resolveDays(allByDate, hidden) {
  const evsByDate = {}, dayCls = {}, dayStyle = {}, tipData = {};
  Object.entries(allByDate).forEach(([iso, all]) => {
    const evs = all.filter(e => !isHiddenEvent(e, hidden));
    if (evs.length) evsByDate[iso] = evs;
  });
  Object.entries(evsByDate).forEach(([iso, evs]) => {
    tipData[iso] = evs.slice().sort((a, b) => to24h(a.startTs).localeCompare(to24h(b.startTs)));
    const active = evs.filter(e => !e.cancelled);
    if (!active.length) { dayCls[iso] = 'ev-cancelled'; return; }
    const real = active.filter(e => e.type !== 'noschool');
    const colors = [];
    if (real.length < active.length) colors.push(HOLIDAY_COLOR);
    [...new Set(real.filter(isBigEvent).map(e => EVENT_COLORS[e.type]))].forEach(c => colors.push(c));
    const regular = real.filter(e => !isBigEvent(e));
    PROGRAMS.forEach(p => { if (regular.some(e => e.program === p)) colors.push(PROGRAM_COLORS[p]); });
    const n = colors.length;
    dayStyle[iso] = n === 1 ? colors[0]
      : 'linear-gradient(135deg,' + colors.map((c, i) =>
          `${c} ${(100 * i / n).toFixed(1)}% ${(100 * (i + 1) / n).toFixed(1)}%`).join(',') + ')';
    dayCls[iso] = '';
  });
  return { evsByDate, dayCls, dayStyle, tipData };
}

// HTML for one month grid. st = resolveDays() result. opts.live (default true)
// adds the today ring, past fading, and data-date hooks for the hover card;
// pass { live: false } for a static (print) calendar.
function monthHtml(ms, st, opts) {
  const live = !opts || opts.live !== false;
  const t = new Date();
  const todayKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const yr       = ms.getFullYear();
  const moIdx    = ms.getMonth();
  const daysInMo = new Date(yr, moIdx + 1, 0).getDate();
  const moLabel  = ms.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const isPastMonth    = live && (yr < t.getFullYear() || (yr === t.getFullYear() && moIdx < t.getMonth()));
  const isCurrentMonth = live && yr === t.getFullYear() && moIdx === t.getMonth();

  let html = `<div class="month-block${isPastMonth ? ' month-past' : ''}">
<div class="month-title">${esc(moLabel)}</div>
<table class="month-cal" role="presentation">
<thead><tr>${DOW.map(d => `<th>${d}</th>`).join('')}</tr></thead>
<tbody>`;

  let dayNum = 1 - ms.getDay();
  while (dayNum <= daysInMo) {
    html += '<tr>';
    for (let dow = 0; dow < 7; dow++, dayNum++) {
      if (dayNum < 1 || dayNum > daysInMo) {
        html += '<td></td>';
      } else {
        const key = `${yr}-${String(moIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        const cls = [st.dayCls[key], live && key === todayKey ? 'today' : '',
                     isCurrentMonth && dayNum < t.getDate() ? 'day-past' : ''].filter(Boolean).join(' ');
        const dd  = live && st.evsByDate[key] ? ` data-date="${key}"` : '';
        const bg  = st.dayStyle[key] ? ` style="background:${st.dayStyle[key]}"` : '';
        html += `<td${cls ? ` class="${cls}"` : ''}${dd}${bg}>${dayNum}</td>`;
      }
    }
    html += '</tr>';
  }
  return html + '</tbody></table></div>';
}
