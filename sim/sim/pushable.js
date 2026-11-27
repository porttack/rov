// pushable.js — port of ../../rov_pushable.py: things that rest on the pool floor and get pushed out of the way when the ROV touches them.
// OPTIONAL add-on, GENERIC: it knows nothing about crabs. A Pushable is a small body (a vertical capsule standing on the floor) that lives in one
// rectangle of the pool. Each step: think() (its own motion; the base class does none), move (plus the speed a push gave it, which dies away in the
// water), every solid part of the ROV (shape.js capsules) that overlaps it pushes it out ALONG THE FLOOR (an off-centre push turns it a little), and it
// is kept inside its rectangle. Game-style physics like the rings. Python is the reference; keep the two in step.
import { POOL_WATER, clamp, nearestIn } from "./physics.js";
import { capsules, segSeg } from "./shape.js";

export class Pushable {
  static RADIUS = 0.05;                              // m: how wide it is (a ROV part closer than this, plus its own radius, pushes it)
  static BODY_LOW = 0.005; static BODY_HIGH = 0.040; // the body stands from this height above the floor to this one
  static MARGIN = 0.06;                              // keeps this far from the walls of its rectangle
  static COAST_DRAG = 4.0; static SPIN_DRAG = 5.0;   // 1/s: how fast a pushed object slows down in the water
  static SPIN = 0.6;                                 // how strongly an off-centre push turns it
  static MAX_PUSH_SPEED = 1.0;                       // m/s: a push never throws it faster than this

  constructor(x, y, yaw = 0.0) {
    this.type = "pushable";
    this.start = [x, y, yaw];
    this.RADIUS = new.target.RADIUS;                 // instance copies, so callers can read crab.RADIUS
    this.reset();
  }

  // ---- what a subclass provides
  /** The rectangle [x0, x1, y0, y1, floor depth] it lives in: by default the shallowest part of the pool. */
  home() { return POOL_WATER.reduce((a, b) => (b[4] < a[4] ? b : a)); }
  /** Its own motion this step as [vx, vy] in m/s along the floor. */
  think() { return [0.0, 0.0]; }

  // ---- common
  reset() {
    [this.x, this.y, this.yaw] = this.start;
    this.pvx = this.pvy = this.pw = 0.0;             // motion from pushes: m/s, m/s, rad/s
    this.pushed = false;                             // touched by the ROV during the last step
  }
  get floor() { return this.home()[4]; }

  step(rov, dt) {
    const C = this.constructor;
    const [vx, vy] = this.think(rov, dt);
    this.x += (vx + this.pvx) * dt;
    this.y += (vy + this.pvy) * dt;
    this.yaw += this.pw * dt;
    const k = Math.exp(-C.COAST_DRAG * dt), ks = Math.exp(-C.SPIN_DRAG * dt);
    this.pvx *= k; this.pvy *= k; this.pw *= ks;
    this.pushed = false;
    this._collide(rov, dt);
    this._keepInside();
  }

  _keepInside() {
    [this.x, this.y] = nearestIn([this.home()], this.x, this.y, this.constructor.MARGIN);
  }

  /** Push this body out of every part of the ROV it overlaps (up to three rounds: resolve the worst, look again). */
  _collide(rov, dt) {
    const C = this.constructor, floor = this.floor, R = C.RADIUS;
    const zA = -floor + C.BODY_LOW, zB = -floor + C.BODY_HIGH;
    const parts = capsules(rov).filter(([ca, cb, r]) => Math.min(ca[2], cb[2]) - r < -floor + 0.5
      && Math.hypot((ca[0] + cb[0]) / 2 - this.x, (ca[1] + cb[1]) / 2 - this.y) < 1.2).map(([ca, cb, r]) => [ca, cb, r]);   // near the floor and near us
    for (let it = 0; it < 3; it++) {
      let worst = null;
      const a = [this.x, this.y, zA], b = [this.x, this.y, zB];
      for (const [ca, cb, r] of parts) {
        const [c1, c2, d] = segSeg(a, b, ca, cb);
        const pen = r + R - d;
        if (pen > 1e-4 && (worst === null || pen > worst[0])) worst = [pen, c1, c2, d];
      }
      if (worst === null) return;
      const [pen, c1, c2, d] = worst;
      let nx = c1[0] - c2[0], ny = c1[1] - c2[1];     // along the floor, from the ROV part toward us
      let h = Math.hypot(nx, ny);
      if (h < 1e-6) { nx = Math.cos(rov.yaw); ny = Math.sin(rov.yaw); h = 1.0; }   // straight under a part: get out of the way of the ROV's front
      const frac = d > 1e-9 ? clamp(h / d, 0.35, 1.0) : 1.0;       // a sideways contact moves us the whole overlap; an under-the-part one moves us further
      const move = Math.min((pen + 0.0005) / frac, 0.08);
      const px = nx / h * move, py = ny / h * move;
      const rx = c2[0] - this.x, ry = c2[1] - this.y;              // where it was hit, relative to the middle
      const dyaw = clamp(C.SPIN * (rx * py - ry * px) / (R * R), -0.2, 0.2);
      this.x += px; this.y += py; this.yaw += dyaw;
      this.pushed = true;
      if (dt > 0) {                                               // keep some of that motion as it drifts away
        this.pvx = clamp(0.5 * this.pvx + 0.5 * px / dt, -C.MAX_PUSH_SPEED, C.MAX_PUSH_SPEED);
        this.pvy = clamp(0.5 * this.pvy + 0.5 * py / dt, -C.MAX_PUSH_SPEED, C.MAX_PUSH_SPEED);
        this.pw = clamp(0.5 * this.pw + 0.5 * dyaw / dt, -3.0, 3.0);
      }
      this._keepInside();
    }
  }

  state() { return { type: this.type, x: this.x, y: this.y, depth: this.floor - 0.02, yaw: this.yaw, r: this.constructor.RADIUS }; }
}
