---
layout: page
title: Middle School ROV
permalink: /ms/
---

<link rel="stylesheet" href="{{ '/assets/css/rov-calendar.css' | relative_url }}">
<style>
  .print-only { display: none; }
  .ms-cal { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.8em 1.6em; margin: 0.6em 0 0.4em; }
  @media (max-width: 700px) { .ms-cal { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 420px) { .ms-cal { grid-template-columns: 1fr; } }
  .ms-legend { display: flex; flex-wrap: wrap; gap: 0.3em 1.1em; font: 0.78em Arial, sans-serif; color: #444; }
  .ms-legend span { display: inline-flex; align-items: center; gap: 0.35em; }
  .ms-legend i { width: 11px; height: 11px; border-radius: 2px; border: 1px solid rgba(0,0,0,0.12); display: inline-block; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .flyer-banner, .flyer-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print {
    @page { margin: 0.5in; }
    .site-header, .site-footer, .no-print { display: none !important; }
    .print-only { display: block; }
    body { font-size: 10pt; line-height: 1.35; background: #fff; }
    .wrapper { max-width: none; padding: 0; }
    .page-content { padding: 0; }
    .post-title { font-size: 22pt; margin: 0 0 0.3em; }
    .post-content h2 { font-size: 13pt; font-weight: 600; color: #0b3d6b; margin: 0.7em 0 0.25em; break-after: avoid; }
    p, ul, table { margin-bottom: 0.45em; }
    p { orphans: 2; widows: 2; }
    li { margin-bottom: 0.1em; break-inside: avoid; }
    table { font-size: 9.5pt; }
    table th, table td { padding: 2px 6px; }
    a { color: inherit; text-decoration: none; }
    a[href^="http"][href*="slvusd.org"]::after { content: " (" attr(href) ")"; font-size: 7.5pt; word-break: break-all; }
    a[href^="/year"]::after { content: " (rov.porttack.com/year)"; font-size: 7.5pt; }
    .flyer-banner { font-size: 14pt !important; padding: 0.3em 0.6em !important; margin: 0 0 0.5em !important; }
    .flyer-box { padding: 0.4em 0.8em !important; margin: 0.4em 0 !important; font-size: 9.5pt; }
    h2, .flyer-box, table { break-inside: avoid; }
    #mentors-box { break-before: page; }  /* page 2 starts with the mentors box */
    .ms-cal { gap: 0.4em 1em; }
    .ms-cal, .ms-legend { break-inside: avoid; }
    .month-block { break-inside: avoid; }
  }
</style>

<p class="no-print" style="text-align:right; margin:0 0 0.5em;"><a href="#" onclick="window.print(); return false;">Print flyer (1&ndash;2 pages)</a></p>

**Middle schoolers designing, building, and piloting underwater robots, and explaining them to real engineers.**

The SLV Middle School ROV Team is a hands-on engineering program for students in grades 6–8. Working in small companies of 3 to 6 students, they build a robot from PVC pipe, motors, and wire, learn to drive it underwater, and take it to a regional of the spring [MATE ROV Competition](https://materovcompetition.org/), in the [Scout class](https://materovcompetition.org/scout).

## Why MATE

<div class="flyer-banner" style="background:linear-gradient(135deg,#0b3d6b,#1a7fa8); color:#fff; text-align:center; border-radius:6px; padding:0.45em 0.8em; margin:0 0 0.8em; font-size:1.3em; font-weight:bold; line-height:1.25;">The ocean we need for the future we want</div>

The [MATE ROV Competition](https://materovcompetition.org/) is real-world engineering with an environmental literacy tie-in. It embraces the UN's ["10 Challenges - 10 Years - One Ocean"](https://oceandecade.org/challenges/). For us, the bigger payoff is the team and the skills employers say they need most: collaboration, communication, resilience, and problem solving. ([Why these skills matter](https://porttack.com/2026/07/08/hope-in-the-standards.html).)

<div class="flyer-box" style="background:#eef4fb; border-left:4px solid #1a3a6b; border-radius:4px; padding:0.8em 1.1em; margin:1em 0;" markdown="1">
MATE's philosophy is ours too: the competition is about **student learning**, and mentors teach and inspire rather than build. Even more, it is about students **becoming a team and directing their own learning**. Winning is not the point.
</div>

## What students build

- **An underwater robot (ROV).** A PVC frame, three sealed motors, a tether, and a control box the students wire themselves. No camera and no claw: pilots drive by sight and design their own hooks and tools to complete the missions.
- **A profiling float.** A small single-motor float that dives to the bottom and back while measuring water temperature, just like the ocean-monitoring floats scientists use.
- **A display board and engineering binder.** Students document their design, testing, and failures, then present it all to competition judges.

This year's missions, from the 2027 MATE ROV Competition, include restoring seagrass, trapping invasive green crabs, installing ocean sensors, and an "outer space" twist: replacing a damaged solar panel and docking cargo.

## What students learn

Measuring and cutting, soldering, basic circuits and fuses, buoyancy, waterproofing, testing and redesign, teamwork, and how to stand up and explain their own engineering. The competition rule is simple: **students do all the building.** Adults teach and guide.

## The season

| When | What happens |
|------|--------------|
| December | Safety, tools, buoyancy, and building the frame |
| January | Motors, waterproofing, control box, and the first splash |
| February | Learning to pilot and designing tools |
| March | The temperature float, data, and timed practice runs |
| April | Display board, presentation practice, and competition |

Fridays, 3:00–7:00pm, December through the regional competition (late April or early May). Exact dates are in the season calendar below, and the [online calendar](/year/?hide=hs,charter) stays current. Mandatory family meeting: Friday, January 8.

<div id="mentors-box" class="flyer-box" style="background:#fff4e0; border:2px solid #f97316; border-radius:6px; padding:0.2em 1.1em 0.6em; margin:1.4em 0;" markdown="1">

## We need mentors

This program runs on volunteers. **You don't need to be an engineer.** *(But we also love engineers and contractors if that's you.)* We need adult supervision and some direction. Some mentors bring skills, but many learn right along with the students, and contribute just as much by keeping kids on task (and fed at times).

All adult volunteers complete the [SLVUSD volunteer clearance](https://www.slvusd.org/apps/pages/index.jsp?uREC_ID=1128492&type=d&pREC_ID=1579193). Start early; it takes a few weeks.

</div>

## For families

- Grades 6–8. Space is limited; applications due Friday, November 13.
- $100 season fee, mostly for team food. Scholarship requests: [ebrown@slvusd.org](mailto:ebrown@slvusd.org).
- The biggest ask is participation: every family is encouraged to volunteer at least a few Fridays.

## Get involved

Interested in joining, mentoring, or supporting the team? Email [ebrown@slvusd.org](mailto:ebrown@slvusd.org).

## Season calendar

<div id="ms-cal" class="ms-cal"></div>
<div class="ms-legend">
  <span><i style="background:#fdba74"></i>MS ROV session</span>
  <span><i style="background:#f97316"></i>Parent meeting</span>
  <span><i style="background:#c4b5fd"></i>Scrimmage / competition</span>
  <span><i style="background:#d1d5db"></i>No school</span>
  <span><i style="background:repeating-linear-gradient(135deg,#fecaca 0 3px,#fff 3px 6px)"></i>Canceled</span>
</div>

<script src="{{ '/assets/js/rov-common.js' | relative_url }}"></script>
<script src="{{ '/assets/js/rov-calendar.js' | relative_url }}"></script>
<script>
// December through May of the season; MS-only view (HS, Charter, and outreach hidden).
// Change SEASON_START next year.
const SEASON_START = new Date(2026, 11, 1);
document.addEventListener('DOMContentLoaded', () => {
  loadRows().then(rows => {
    const st = resolveDays(collectEvents(rows), new Set(['hs', 'charter', 'outreach']));
    const box = document.getElementById('ms-cal');
    for (let i = 0; i < 6; i++) {
      box.insertAdjacentHTML('beforeend',
        monthHtml(new Date(SEASON_START.getFullYear(), SEASON_START.getMonth() + i, 1), st, { live: false }));
    }
  }).catch(() => { document.getElementById('ms-cal').textContent = 'Calendar unavailable. See the Year calendar.'; });
});
</script>

<p class="print-only" style="border-top:1px solid #999; padding-top:0.4em; font-size:9pt;">
SLV Middle School ROV &middot; rov.porttack.com/ms &middot; ebrown@slvusd.org
</p>
