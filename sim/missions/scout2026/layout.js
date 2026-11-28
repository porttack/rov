// layout.js — where things are in the 2026 SCOUT mission. Positions are WALL-RELATIVE: `u` metres out from the pool wall at the shallow end's side (the wall the stairs are in),
// `v` metres to the left of the pool's middle line when looking out from the wall (sim y = middle + v). The manual only shows "a possible layout": change the numbers here.
import { POOL_WATER } from "../../sim/physics.js";
import { stairsRect } from "../common/stairs.js";

export const ASSIST = 1.5;                                   // props are a little bigger and the targets a little more forgiving than in real life: it is harder to see and steer in a simulation
export const RUN_SECONDS = 600;                              // the manual: a 10 minute performance
export const MISSION_POOL = { poollength: 1, poolwidth: 2, pooldepth: 2 };                // the SCOUT class is done in a 2 m deep pool

/** The main pool's wall geometry now: x of the wall, y of the middle line. */
export function frame() {
  const main = POOL_WATER.reduce((a, b) => (b[4] > a[4] ? b : a));
  return { wallX: main[1], midY: (main[2] + main[3]) / 2, main };
}
/** World [x, y] of a wall-relative spot. */
export function at(u, v) { const f = frame(); return [f.wallX - u, f.midY + v]; }

export { stairsRect };
/** Is the ROV at the stairs (over a step, or just in front of them), near the surface, where the crew can reach it? */
export function atStairs(rov) {
  const r = stairsRect();
  if (!r) return false;
  const m = 0.6;                                               // the ROV may still be on the shelf in front of the first step
  const [x0, x1, y0, y1] = [r[0] - m, r[1] + 0.1, r[2] - 0.2, r[3] + 0.2];
  return rov.x >= x0 && rov.x <= x1 && rov.y >= y0 && rov.y <= y1 && rov.depth < 0.9;
}

/** Where the ROV starts: near the stairs' end of the wall, at the surface, facing out into the pool. */
export function startPose() {
  const [x, y] = at(1.2, 2.0);
  return { x, y, depth: 0.3, yaw: Math.PI };
}

/** The spots on the deck, beside the stairs, where things the crew has taken sit (index 0, 1, 2 ...). Returns [x, y] or null when the pool has no stairs. */
export function deckSlot(i) {
  const r = stairsRect();
  if (!r) return null;
  const cols = 4, col = i % cols, row = Math.floor(i / cols);
  return [r[0] + 0.3 + 0.45 * col, r[3] + 0.5 + 0.4 * row];
}

/** The crew's table: [x0, x1, y0, y1] around all the deck slots, or null. */
export function deckRect() {
  const a = deckSlot(0), b = deckSlot(19);
  if (!a || !b) return null;
  return [a[0] - 0.25, a[0] + 3 * 0.45 + 0.25, a[1] - 0.25, b[1] + 0.25];
}

/** Wall-relative spots of the stations (u out from the wall, v to the left). */
export const SPOTS = {
  edna: [1.3, -1.6],           // the yellow 0.50 m square (the old sensor starts in it)
  observatory: [3.0, -1.6],    // the observatory with its 3" port
  pot: [4.7, -1.6],            // the lobster pot
  stand: [1.4, 1.6],           // the wind farm power-connector stand
  waypoint: [3.0, 1.6],        // the waypoint (four posts)
  oilPort: [4.7, 1.6],         // the oil platform port
};
