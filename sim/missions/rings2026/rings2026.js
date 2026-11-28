// rings2026.js — "Pool Rings 2026": a little game, started by ?mission=rings2026. Pick up the pool rings and take them to the stairs; G lets go of a ring there: 5 points,
// and the ring is dropped again somewhere else in the pool. A 5 minute clock, which starts at the first move. After time is up nothing scores any more (Reset plays again).
// Made like the Scout mission (one `mission` prop that the page's panel reads) but the rings are the pool's ordinary rings (sim/rings.js).
import { RunClock } from "../common/clock.js";
import { stairsRect } from "../common/stairs.js";
import { POOL_WATER } from "../../sim/physics.js";

export const POOL_RESIZABLE = true;                  // the game works in any pool size (the page may resize it); the Scout mission's props are placed for one pool
export const RUN_SECONDS = 300, POINTS = 5, TITLE = "Pool Rings 2026";
export const HINT = "Pick up pool rings and deliver them to the stairs. Press G there to release a ring: 5 points, and a new ring drops somewhere in the pool.";
const MARGIN = 0.4;                                  // a ring counts as "in the stairs" this close to them too (m)

export class Mission {
  constructor(rov, random = Math.random) {
    this.type = "mission"; this.id = "rings2026";
    this.clock = new RunClock(RUN_SECONDS);
    this.rov = rov; this.random = random;
    this.delivered = 0; this.locked = false; this.said_over = false;
    this.msg = { n: 0, text: "" };
  }
  reset() { this.clock.reset(); this.delivered = 0; this.said_over = false; this.msg = { n: this.msg.n + 1, text: "" }; }
  say(text) { this.msg = { n: this.msg.n + 1, text }; }
  get score() { return this.delivered * POINTS; }
  rings() { return this.rov.props.filter((p) => p.type === "ring"); }
  carried() { return this.rings().find((r) => r.held || r.hooked) || null; }
  inStairs(x, y) { const r = stairsRect(); return !!r && x >= r[0] - MARGIN && x <= r[1] + MARGIN && y >= r[2] - MARGIN && y <= r[3] + MARGIN; }

  step(rov, dt) {
    if (this.clock.state === "ready" && (Object.values(rov.cmd).some((v) => v !== 0) || rov.claw_target !== rov.claw)) this.clock.start();
    this.clock.step(dt);
    if (!this.said_over && this.clock.over) { this.said_over = true; this.say(`Time! You delivered ${this.delivered} ring${this.delivered === 1 ? "" : "s"}: ${this.score} points. Reset to play again`); }
  }

  /** G: let go of the ring the ROV has. In the stairs it scores and a new ring is dropped; anywhere else it is just let go. Returns the message. */
  deliver(rov) {
    const ring = this.carried();
    if (!ring) { this.say("No ring on the ROV: put the nose through a ring and lift it, or close the claw on one"); return this.msg.text; }
    if (ring.held) ring._letGo(rov);
    ring.hooked = false;
    if (this.inStairs(ring.x, ring.y) && !this.clock.over) {
      this.delivered++;
      this.say(`+${POINTS}  ring delivered (${this.score} points)`);
      this.redrop(ring);
    } else if (this.inStairs(ring.x, ring.y)) {
      this.say("Time is up: no more points. Reset to play again");
    } else {
      ring.x += Math.cos(rov.yaw) * 0.35; ring.y += Math.sin(rov.yaw) * 0.35;                 // (off the nose, so it does not hook straight again)
      this.say("Let go of the ring. Take it to the stairs and press G there to score");
    }
    return this.msg.text;
  }
  give() { return false; }                          // no inventory in this game

  /** Drop a ring from the surface at a random spot in the main pool (not on the ROV or another ring). */
  redrop(ring) {
    const main = POOL_WATER.reduce((a, b) => (b[4] > a[4] ? b : a)), m = 0.5, rov = this.rov, others = this.rings().filter((r) => r !== ring);
    let x = 0, y = 0;
    for (let k = 0; k < 30; k++) {
      x = main[0] + m + this.random() * (main[1] - main[0] - 2 * m); y = main[2] + m + this.random() * (main[3] - main[2] - 2 * m);
      if (Math.hypot(x - rov.x, y - rov.y) > 0.9 && others.every((o) => Math.hypot(x - o.x, y - o.y) > 0.5) && !this.inStairs(x, y)) break;
    }
    ring.x = x; ring.y = y; ring.yaw = this.random() * Math.PI;
    ring.vx = ring.vy = ring.wz = 0;
    ring.depth = ring.R + ring.TUBE;                               // the top of the hoop just at the surface; it sinks to the floor
    ring.held = ring.hooked = ring.lifting = ring.in_jaws = false;
    return ring;
  }

  state() {
    const carried = this.carried();
    return {
      type: this.type, id: this.id, title: TITLE, hint: HINT, locked: this.locked, clock: this.clock.data(),
      board: { items: [], total: this.score, max: 0 }, inventory: [], carrying: carried ? "a pool ring" : null,
      atStairs: false, msg: this.msg, deck: null, delivered: this.delivered,
    };
  }
}

export function addTo(rov) {
  const m = new Mission(rov);
  rov.props.push(m);
  rov.mission = m;
  return m;
}
