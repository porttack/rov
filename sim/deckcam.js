// deckcam.js — where the person standing at the pool's edge puts their eyes, for the Deck view. No DOM, no three.js (it is tested in Node).
// Standing outside a wall they cannot see a ROV that is deep and close to that wall: the wall hides it. So they lean out over the water exactly as far as it takes for the line of
// sight to clear the top of the wall: the closer to the wall and the deeper, the further out over the water (and the lower, bending down) the eyes go.
export const STAND_OUT = 1.2, STAND_HEIGHT = 1.8, LEAN_HEIGHT = 1.4, CLEARANCE = 0.2, MAX_LEAN_OUT = 0.8;
/** rect {x0, x1, z0, z1}: the water's edges where the ROV is (three.js x and z). side: 0 west, 1 east, 2 north, 3 south (which edge they stand at). pos: the ROV {x, y (negative = down), z}.
 *  Returns { eye: [x, y, z], outside, height }: `outside` is how far beyond the wall the eyes are (negative: over the water). */
export function deckEye(rect, side, pos) {
  const w = [pos.x - rect.x0, rect.x1 - pos.x, pos.z - rect.z0, rect.z1 - pos.z][side];                  // the ROV's distance from that wall, into the pool
  const depth = Math.max(0, -pos.y) + 0.3;                                                                 // down to the bottom of its frame
  const lean = Math.max(0, Math.min(1, (-pos.y - 0.3) / 0.9));
  const H = STAND_HEIGHT + (LEAN_HEIGHT - STAND_HEIGHT) * lean;                                            // bending down as they lean
  const q = (H - 0.1) / (H + depth);                                                                       // sight line from the eyes to the ROV crosses the wall at least 10 cm above the water if outside <= q w / (1 - q)
  const outside = Math.max(-MAX_LEAN_OUT, Math.min(STAND_OUT, (q * Math.max(w, 0)) / (1 - q) - CLEARANCE));
  const along = (a, lo, hi) => Math.max(lo + 0.3, Math.min(hi - 0.3, a));
  const eye = side === 0 ? [rect.x0 - outside, H, along(pos.z, rect.z0, rect.z1)]
    : side === 1 ? [rect.x1 + outside, H, along(pos.z, rect.z0, rect.z1)]
    : side === 2 ? [along(pos.x, rect.x0, rect.x1), H, rect.z0 - outside] : [along(pos.x, rect.x0, rect.x1), H, rect.z1 + outside];
  return { eye, outside, height: H, wall_distance: w };
}
/** The edge nearest the ROV (with some stickiness: stay on `current` unless another is more than `hyst` metres nearer). */
export function nearestSide(rect, pos, current = null, hyst = 1.0) {
  const d = [pos.x - rect.x0, rect.x1 - pos.x, pos.z - rect.z0, rect.z1 - pos.z];
  let best = 0; for (let i = 1; i < 4; i++) if (d[i] < d[best]) best = i;
  return current === null || d[best] < d[current] - hyst ? best : current;
}
/** The height above the water at which the line of sight from the eyes to a point (depth below the water) crosses the wall's plane; null if the eyes are over the water. */
export function crossingHeight(eyeOutside, eyeHeight, wallDistance, depth) {
  if (eyeOutside <= 0) return null;
  return eyeHeight - (eyeHeight + depth) * eyeOutside / (wallDistance + eyeOutside);
}
