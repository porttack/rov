// backend-local.js — the simulation runs right here in the browser (no server needed). Same shape as backend-net.js.
// A page-load-time loop steps the World and hands state to the page ~30 times a second.
import { World } from "./sim/world.js";
import { Rov, setPool, POOL_WATER, POOL_DEPTHS } from "./sim/physics.js";
import { parseConfig } from "./config.js";
import { DeviceLink } from "./sim/devicelink.js";

export const name = "local sim";
export const config = parseConfig(typeof location !== "undefined" ? location.search : "");   // ?rings= ?fish= ?poollength= ?poolwidth= ?camera= (see config.js)
export const defaultTool = "nose";               // scout ROVs mostly use a nose (hook); T switches to the claw
export const configurable = { controls: true, camera: true, fish: true, rings: true, pool: true, speed: true, crabs: true, current: true };   // what the ?config panel may change here
setPool(config.poollength, config.poolwidth, config.pooldepth);    // the pool first: rings and fish stand on its floor
const rov = new Rov({ tool: defaultTool, thrusters: config.thrusters });
rov.speed_mult = Math.max(0.25, Math.min(4, config.speed));   // ?speed= : the red / green thrusters' power (1 = normal)
let ringsMod = null;
try { ringsMod = await import("./sim/rings.js"); if (config.rings > 0) ringsMod.addTo(rov, config.rings, { intro: true }); } catch (e) { /* optional add-on: no rings without rings.js */ }
let fishAdded = false;
if (config.fish) try {
  (await import("./sim/fishbrain.js")).addTo(rov, 1); fishAdded = true;
  for (const p of rov.props) if (p.type === "fish") p.peeks = config.camera;         // no camera on the ROV: nothing for the fish to come and look into
} catch (e) { /* optional add-on: no fish without fishbrain.js */ }
let crabsAdded = false;
if (config.crabs > 0) try { (await import("./sim/crab.js")).addTo(rov, config.crabs); crabsAdded = true; } catch (e) { /* optional add-on: no crabs without crab.js */ }
let currentMod = null;                           // the optional water current (sim/current.js); the page's Current button can turn it on and off at any time
try { currentMod = await import("./sim/current.js"); currentMod.addTo(rov, config.current); } catch (e) { /* optional add-on: no outlets without current.js */ }      // the outlets are always in the wall; ?current=on makes the water run
let eelMod = null;                               // the optional eel joke (sim/eel.js): the L key calls it out of the lower outlet
try { eelMod = await import("./sim/eel.js"); eelMod.addTo(rov); } catch (e) { /* optional add-on: no eel without eel.js */ }
let missionMod = null;                           // a mission instead of free driving (?mission=scout2026): its props, score board and clock
if (config.mission !== "none") try { missionMod = await import(`./missions/${config.mission}/${config.mission}.js`); missionMod.addTo(rov); } catch (e) { console.warn("mission failed to load:", e); }
export const features = { mission: !!missionMod, eel: !!eelMod, keys: true, joys: false, claw: true, imu: true, rings: !!ringsMod, fish: fishAdded, crabs: crabsAdded, current: !!currentMod, serial: true };
const world = new World(rov);
export { rov, world };                          // (for the tests)
if (ringsMod) world.ringDropper = ringsMod.dropRing;
export const link = new DeviceLink(world);       // a micro:bit / Pico plugged in over USB (see serial.js)
let timer = null;

export function connect(onState) {
  const tick = () => { const now = performance.now(); world.advance(now); link.tick(now); onState(world.state()); };
  timer = setInterval(tick, 1000 / 60);          // (first delivery waits a tick: the page is still finishing its own setup)
  document.addEventListener("visibilitychange", () => { if (document.hidden) world.pause(); });
}
export const cmd = (obj) => world.command(obj);
export const tool = (name) => world.setTool(name);
export const buoyancy = (mode) => world.setBuoyancy(mode);
export const joy = () => {};
/** The L key: an eel comes out of the lower water outlet and goes after the ROV. Returns true if it started. */
export const summonEel = () => (eelMod ? eelMod.summon(rov) : false);
export const reset = () => world.reset();
/** The mission's crew keys: G (take what the ROV carries to the deck) and the inventory (give the ROV something). */
export const missionDeliver = () => (rov.mission ? rov.mission.deliver(rov) : "");
export const missionGive = (id) => (rov.mission ? rov.mission.give(rov, id) : false);
export const dropRing = (x, y) => world.dropRing(x, y);          // the N key
/** The Config dialog's thruster mode: 3, 4, 6 or 8 thrusters (the commands go back to zero). */
export function setThrusters(n) {
  rov.set_layout(n);
  world._prev = {};                                // (the keyboard command the world remembers belongs to the old layout)
}
/** The Config dialog's thruster power: the red and green thrusters' power, 0.25 to 4 (1 = normal). */
export function setSpeed(v) { rov.speed_mult = Math.max(0.25, Math.min(4, Number(v) || 1)); }
/** The Config dialog's pool size: resize the main pool (length 1-2 times 6 m, width 1-3 times 3 m) while the sim runs. Everything that stands in the pool (the ROV,
 *  the rings, the fish, the crabs, the water outlets) is put back in the new pool, like Reset. */
export function setPoolSize(length, width, depth) {
  if (missionMod) return;                          // (a mission's props are placed for its own pool)
  setPool(length, width, depth);
  world.reset();
}
/** The pool keys: make the pool one step bigger in one direction ("length", "width" or "depth") WITHOUT moving the ROV, the rings or the fish (it cannot shrink).
 *  The shallow end stays at the far wall, so the crabs on it move with it; the water outlets move to the new wall; rings that were on the floor sink to the new one.
 *  Returns [length, width, depth] now, or null when it cannot grow that way (already the biggest, or the eel is out). */
export function growPool(what) {
  if (missionMod) return null;
  const eel = rov.props.find((p) => p.type === "eel");
  if (eel && eel.mode !== "idle") return null;
  const [main, shelf] = [POOL_WATER[0], POOL_WATER[1]];
  let L = Math.round((main[1] - main[0]) / 6), W = Math.round((main[3] - main[2]) / 3), D = main[4];
  if (what === "length" && L < 2) L += 1;
  else if (what === "width" && W < 3) W += 1;
  else if (what === "depth" && POOL_DEPTHS.some((d) => d > D)) D = POOL_DEPTHS.find((d) => d > D);
  else return null;
  const [sx, sy] = [shelf[0], shelf[2]];
  setPool(L, W, D);
  const dx = POOL_WATER[1][0] - sx, dy = POOL_WATER[1][2] - sy;
  for (const p of rov.props) {
    if (p.type === "crab") { p.x += dx; p.y += dy; if (p.target) { p.target = [p.target[0] + dx, p.target[1] + dy]; } }
    else if (p.type === "jets") p.reset();                                      // (the outlets go to the new wall; `on` stays as it was)
  }
  return [L, W, D];
}
/** The Config dialog's Current box: make the water run, or stop it. (The outlets stay in the wall either way.) */
export function setCurrent(on) {
  const jets = rov.props.find((p) => p.type === "jets");
  if (jets) jets.on = !!on;
}
