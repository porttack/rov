// current.js — port of ../../rov_current.py: two water outlets in the side wall that make a current across the pool.
// OPTIONAL add-on (the page draws the jets with ../jets.js). Remove: delete this file and the addTo() call in backend-local.js. The core physics
// only knows "a prop may have a flow(x, y, depth) method" (see Rov._water in physics.js).
// Two nozzles in the middle of the pool's +y wall (the side the shallow end is on), at 1/3 and 2/3 of the way down, shoot water straight across
// the pool. Like a round turbulent jet, but wider and stronger: on the axis the speed is min(U0, K / s) at distance s from the nozzle; across the jet it falls
// off as exp(-(r / b)^2) with b = R0 + SPREAD * s. Where the two jets overlap the speeds add. Only the ROV feels it (rings, fish, crabs do not).
import { POOL_REGIONS } from "./physics.js";

// Game-sized: gentle enough to drive against, strong enough to notice. A ROV floating at the SURFACE, well above the nozzles, feels about 0.15 to 0.25 m/s
// across the middle of the pool; at a nozzle's own depth it is stronger (about 0.5 m/s a couple of metres out), and within half a metre of a nozzle it is
// faster than the ROV can swim (its top speed is about 0.84 m/s). Turn all of it up or down with U0 and K together.
export const U0 = 1.0;                    // m/s at the nozzle
export const K = 0.5;                     // axial speed = K / s beyond s = K / U0 (0.5 m)
export const R0 = 0.04, SPREAD = 0.20;    // half-width b(s) = R0 + SPREAD * s

/** The two outlets. They are ALWAYS in the wall (the page draws them whether the water is running or not); `on` says whether water comes out. */
export class Jets {
  constructor(on = true) {
    this.type = "jets";
    this.on = on;
    this.reset();
  }
  reset() {
    const main = POOL_REGIONS.reduce((a, b) => (b[4] > a[4] ? b : a));                    // the deep end
    const shelf = POOL_REGIONS.filter((r) => r !== main && Math.abs(r[2] - main[3]) < 1e-9);
    const wallX1 = shelf.length ? Math.min(...shelf.map((r) => r[0])) : main[1];          // the +y wall runs from the near end to where the shallow end opens off it
    const x = (main[0] + wallX1) / 2;                                                    // the middle of that wall
    this.length = main[3] - main[2];                                                     // the jets cross the pool and stop at the far wall
    this.floor = main[4];                                                                // (the page keeps the stream of bubbles inside the water)
    this.outlets = [1 / 3, 2 / 3].map((f) => ({ x, y: main[3], depth: main[4] * f, dx: 0.0, dy: -1.0 }));
  }
  step() { /* the jets never change */ }

  /** Water speed on the axis of a jet, s metres from its nozzle. */
  static axial(s) { return s * U0 <= K ? U0 : K / s; }

  /** The water's velocity at this point: [world x, world y, down] in m/s: the sum of both jets. */
  flow(x, y, depth) {
    let vx = 0.0, vy = 0.0;
    if (!this.on) return [0.0, 0.0, 0.0];
    for (const o of this.outlets) {
      const rx = x - o.x, ry = y - o.y;
      const s = rx * o.dx + ry * o.dy;                          // distance along the jet from the nozzle
      if (s <= 0.0 || s > this.length) continue;
      const lat = -rx * o.dy + ry * o.dx;                       // sideways distance, across the pool
      const r2 = lat * lat + (depth - o.depth) ** 2;
      const b = R0 + SPREAD * s;
      const v = Jets.axial(s) * Math.exp(-r2 / (b * b));
      vx += v * o.dx; vy += v * o.dy;
    }
    return [vx, vy, 0.0];
  }

  state() { return { type: "jets", on: this.on, outlets: this.outlets.map((o) => ({ ...o })), length: this.length, floor: this.floor, u0: U0, k: K, r0: R0, spread: SPREAD }; }
}

/** Put the two outlets in the pool wall. They are always there; `on` says whether the water is running. */
export function addTo(rov, on = true) { rov.props.push(new Jets(on)); }
