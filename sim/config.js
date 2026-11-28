// config.js — the page's settings, read from the address (?controls=h&rings=2&poollength=2 ...). No DOM, so it is tested in Node.
// `?config` opens a panel (configui.js) that edits these and makes the link; every setting also works on its own in the address.
// Anything missing or invalid falls back to the default, and numbers are rounded and kept inside their limits.
//
//   controls     all | h | h-hidden   all keys | H-circuit only (just the three switches; the default, for the scouts) | H-circuit only and every other control hidden
//   fish         on | off             the coy fish (default on)
//   rings        0 .. 5               pick-up rings in the pool (default 3)
//   poollength   1 | 2                the main pool is 6 m x this long (default 1)
//   poolwidth    1 | 2 | 3            the main pool is 3 m x this wide (default 1)
//   pooldepth    2 | 3 | 4 | 6        the main pool is this many metres deep (default 2); the shallow end stays 1 m
//   speed        0.25 .. 4            power of the red and green thrusters, 1 = normal (itself half of the old full power); 2 decimals (default 1)
//   crabs        0 .. 5               green crabs crawling on the floor of the shallow end (default 1; the 2026 task has two)
//   current      on | off             two water outlets in the shallow end's side wall make a current across the pool (default off)
//   flow         bubbles | streaks | rings | mix   how the running water is drawn (default mix: rings and a few bubbles; J cycles)
//   thrusters    3 | 4 | 6 | 8         how many thrusters: 3 (one up/down), 4 (the original), 6 (four on the posts + two up/down), 8 (one tilted thruster at each of the 8 corners) (default 4)
//   mission      none | scout2026 | rings2026   a mission instead of free driving: scout2026 = the 2026 SCOUT competition props, with a score board and a 10 minute clock; rings2026 = the pool-rings game (5 points a ring taken to the stairs, 5 minutes) (default rings2026; none = free driving with no mission at all)
//   labels       on | off              (a mission) plaques on the pool floor beside each prop: the task, what to do, the real-world thing (default off; the P key and the Labels button change it)
//   scenery      on | off             quiet scenery far from the pool: grass beyond the deck and a koi pond (default on)
//   camera       on | off             the ROV has a camera: its housing on the model, the camera window, and the fish coming to look at it (default off)
// (With no `controls` the page starts in H-circuit only mode, but the H key still switches.) When `controls` is given, it is LOCKED: the H key and the badge no longer switch modes (the link decides, not the student).
export const POOL_DEPTHS = [2, 3, 4, 6];               // how deep the main pool can be (m); same list as sim/physics.js
export const MISSIONS = ["none", "rings2026", "scout2026"];
export const MISSION_NAMES = { none: "None (free driving)", rings2026: "Pool Rings 2026", scout2026: "Scout 2026" };             // what the pool is for: free driving, or a competition mission (web/missions/)
export const DEFAULTS = { mission: "rings2026", labels: false, scenery: true, controls: "h", fish: true, rings: 3, poollength: 1, poolwidth: 1, pooldepth: 2, camera: false, speed: 1, crabs: 1, current: false, flow: "mix", thrusters: 4 };
export const LIMITS = { rings: [0, 5], poollength: [1, 2], poolwidth: [1, 3], speed: [0.25, 4], crabs: [0, 5] };
export const MAX_RINGS = 10;      // the most rings the pool can hold, counting the ones dropped with the N key (rov_props.py MAX_RINGS is the same number)
export const CONTROL_MODES = ["all", "h", "h-hidden"];
export const THRUSTER_MODES = [3, 4, 6, 8];               // how many thrusters the ROV has (see THRUSTER_LAYOUTS in sim/physics.js)
export const FLOW_LOOKS = ["bubbles", "streaks", "rings", "mix"];       // how the water from the outlets is drawn (the J key cycles them)
export const CONFIG_KEYS = Object.keys(DEFAULTS);

const TRUE = new Set(["on", "1", "true", "yes"]), FALSE = new Set(["off", "0", "false", "no"]);
const bool = (v) => (v === null ? undefined : TRUE.has(v.trim().toLowerCase()) ? true : FALSE.has(v.trim().toLowerCase()) ? false : undefined);
const decimal = (v, [lo, hi]) => {                                      // any number, kept inside the limits and rounded to 2 decimals
  if (v === null || v.trim() === "" || !Number.isFinite(Number(v))) return undefined;
  return Math.round(Math.max(lo, Math.min(hi, Number(v))) * 100) / 100;
};
/** What a mission changes in the start-up settings (the address can still override each of them). */
export const MISSION_DEFAULTS = {
  none: {},
  rings2026: { rings: 3, camera: false },                       // the little ring game: the usual pool and three rings
  scout2026: { rings: 0, poollength: 1, poolwidth: 2, pooldepth: 2, camera: false },        // (the fish and the green crab stay)
};
const whole = (v, [lo, hi]) => {
  if (v === null || v.trim() === "" || !Number.isFinite(Number(v))) return undefined;
  return Math.max(lo, Math.min(hi, Math.round(Number(v))));
};

/** Read the settings from a query string ("?a=b&c=d" or "a=b"). `explicit` lists the settings the address really set; `open` says ?config was given. */
export function parseConfig(search = "") {
  const q = new URLSearchParams(search);
  const found = {
    mission: q.has("mission") && MISSIONS.includes(q.get("mission").trim().toLowerCase()) ? q.get("mission").trim().toLowerCase() : undefined,
    controls: q.has("controls") && CONTROL_MODES.includes(q.get("controls").trim().toLowerCase()) ? q.get("controls").trim().toLowerCase() : undefined,
    fish: bool(q.get("fish")),
    rings: whole(q.get("rings"), LIMITS.rings),
    poollength: whole(q.get("poollength"), LIMITS.poollength),
    poolwidth: whole(q.get("poolwidth"), LIMITS.poolwidth),
    pooldepth: q.has("pooldepth") && POOL_DEPTHS.includes(Number(q.get("pooldepth"))) ? Number(q.get("pooldepth")) : undefined,
    camera: bool(q.get("camera")),
    labels: bool(q.get("labels")),
    scenery: bool(q.get("scenery")),
    speed: decimal(q.get("speed"), LIMITS.speed),
    crabs: whole(q.get("crabs"), LIMITS.crabs),
    current: bool(q.get("current")),
    thrusters: q.has("thrusters") && THRUSTER_MODES.includes(Number(q.get("thrusters"))) ? Number(q.get("thrusters")) : undefined,
    flow: q.has("flow") && FLOW_LOOKS.includes(q.get("flow").trim().toLowerCase()) ? q.get("flow").trim().toLowerCase() : undefined,
  };
  const cfg = { ...DEFAULTS }, explicit = new Set();
  for (const k of CONFIG_KEYS) if (found[k] !== undefined) { cfg[k] = found[k]; explicit.add(k); }
  for (const [k, v] of Object.entries(MISSION_DEFAULTS[cfg.mission] || {})) if (!explicit.has(k)) cfg[k] = v;     // a mission sets its own start-up (anything the address names still wins)
  return { ...cfg, explicit, open: q.has("config") };
}

/** The query string (without "?") for these settings: only values that differ from the defaults, plus every OTHER parameter of
 *  `existing` (quality, view, tool ...) so applying the settings does not lose them. `config` itself is dropped. */
export function toQuery(cfg, existing = "") {
  const out = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(existing)) if (k !== "config" && !CONFIG_KEYS.includes(k)) out.append(k, v);
  for (const k of CONFIG_KEYS) {
    if (cfg[k] === DEFAULTS[k]) continue;
    out.set(k, typeof cfg[k] === "boolean" ? (cfg[k] ? "on" : "off") : String(cfg[k]));
  }
  return out.toString();
}

/** The four pool sizes the Config dialog offers [length x6 m, width x3 m, name]. (Any size from poollength / poolwidth in the address is still allowed:
 *  the dialog then shows it as "custom".) */
export const POOL_PRESETS = [[1, 1, "Standard"], [2, 1, "Long"], [1, 2, "Wide"], [2, 2, "Large"], [2, 3, "Huge"]];

/** Short human text for the pool size, e.g. "12 m x 6 m". */
export const poolSizeText = (length, width) => `${6 * length} m × ${3 * width} m`;

/** The camera view the page starts in: ?view=orbit|deck|follow|top (any case), else Deck for the Scout mission (the crew stands on the deck) and Orbit for everything else. (An address-only option, not part of the Config dialog.) */
export const VIEWS = ["orbit", "deck", "follow", "top"];
export function startView(search = "", mission = "none") {
  const v = (new URLSearchParams(search).get("view") || "").trim().toLowerCase();
  return VIEWS.includes(v) ? v : mission === "scout2026" ? "deck" : "orbit";
}
