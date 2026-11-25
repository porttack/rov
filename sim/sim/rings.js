// rings.js — port of ../../rov_props.py: weighted rings to pick up and push around. OPTIONAL add-on (the page draws them with ../props.js).
// Remove: delete this file and the addTo() call in backend-local.js. The core only knows "a prop has reset(), step(rov, dt), state()".
// Ways to deal with a ring: NOSE through the hoop then rise (hangs from the nose); CLAW around the rim's side, command it closed
// (grips; open again to let go); BUMPING with any solid part of the ROV (pushed, spun by where it was hit, coasts to a stop).
// Game-style physics, not a solver: capsule-vs-hoop overlap tests, resolved by moving the light ring. Python is the reference.
import { POOL_MAX_DEPTH, POOL_REGIONS, clamp, floorAt, nearestIn } from "./physics.js";
import { JAW_HALF, JAW_SWING, JAW_X0, JAW_Y0, JAW_Z, NOSE_PTS, NOSE_R, capsules, segSeg } from "./shape.js";

/** Angle difference wrapped into (-pi/2, pi/2]: a ring looks the same turned by 180 degrees. (Python's % is never negative.) */
const wrapHalfPi = (a) => ((((a + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI) - Math.PI / 2;
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export class Ring {
  static R = 0.14; static TUBE = 0.02;                  // hoop radius and tube radius (m)
  static SINK = 0.15;                                   // m/s: how fast it falls once nothing holds it up
  static TORQUE_HANGING = 1.7; static TORQUE_HELD = 1.2;   // N m of nose-down torque from the ring's weight out front
  // --- nose (shared with the collision shape) ---
  static NOSE = NOSE_PTS; static NOSE_R = NOSE_R;
  static SLIDE = [0.31, 0.40];                          // a hanging ring rests on the nose's low part, this far ahead of the ROV centre
  // --- claw: hinged at JAW_X0 ahead of the centre, on the bottom bar ---
  static JAW_X0 = JAW_X0; static JAW_X1 = 0.60;
  static JAW_Y0 = JAW_Y0; static JAW_HALF = JAW_HALF; static JAW_SWING = JAW_SWING;
  static JAW_Z = JAW_Z; static JAW_ZTOL = 0.035;
  static CLAMP_COMMAND = 0.25;                          // a claw command at or below this means "squeeze"; above it, "open"
  static HOLD_OPEN = 0.10;                              // jaws can't close past the tube's thickness
  // --- being bumped ---
  static N_HOOP = 16; static SPIN = 0.9;
  static COAST_DRAG = 4.0; static SPIN_DRAG = 5.0;

  constructor(x = 0.8, y = 0.0, yaw = Math.PI / 2, color = 0xff6a00, others = null) {
    this.type = "ring";
    this.R = Ring.R; this.TUBE = Ring.TUBE;             // instance copies, for callers (tests) that read ring.R
    this.start = [x, y, yaw];
    this.color = color;
    this.others = others ?? [];
    this.reset();
  }

  /** The hoop stands in a vertical plane, so from above it is a line: its two ends and its middle. */
  _footprint() {
    const ex = Math.cos(this.yaw) * Ring.R, ey = Math.sin(this.yaw) * Ring.R;
    return [[this.x + ex, this.y + ey], [this.x - ex, this.y - ey], [this.x, this.y]];
  }

  /** Centre depth when standing on the floor right here: the shallowest floor under any part of the hoop. */
  get floor() {
    let fl = this._footprint().map(([x, y]) => floorAt(x, y)).filter((f) => f !== null);
    if (!fl.length) fl = [POOL_MAX_DEPTH];
    return Math.min(...fl) - Ring.R - Ring.TUBE;
  }

  reset() {
    [this.x, this.y, this.yaw] = this.start;
    this.vx = this.vy = this.wz = 0.0;
    this.depth = this.floor;
    this.held = false; this.hooked = false; this.lifting = false; this.in_jaws = false;
    this.prev_claw = 0.0;
    this.rel = [0.0, 0.0, 0.0, 0.0];
  }

  // ------------------------------------------------------------------ per-step
  step(rov, dt) {
    const c = Math.cos(rov.yaw), s = Math.sin(rov.yaw);
    if (rov.tool !== "nose") this.hooked = false;
    this.lifting = false;
    this.in_jaws = false;
    if (rov.tool !== "claw" && this.held) this._letGo(rov);

    if (this.held) {
      this._followClaw(rov, c, s);
      if (this.held) {
        rov.claw_floor = Ring.HOLD_OPEN;
        rov.pitch_torque += Ring.TORQUE_HELD;
      }
    } else {
      this.in_jaws = rov.tool === "claw" && rov.claw_holder === null && this._betweenJaws(rov, c, s);
      this.depth = Math.min(this.floor, this.depth + Ring.SINK * dt);
      if (rov.tool === "nose") {
        this._nose(rov, c, s, dt);
      } else if (this.in_jaws && rov.claw_target <= Ring.CLAMP_COMMAND && rov.claw < this.prev_claw - 1e-4) {
        this.held = true;
        rov.claw_holder = this;
        rov.claw_floor = Ring.HOLD_OPEN;
        this.vx = this.vy = this.wz = 0.0;
        const dx = this.x - rov.x, dy = this.y - rov.y;
        this.rel = [c * dx + s * dy, -s * dx + c * dy, -this.depth + rov.depth, this.yaw - rov.yaw];
      }
    }
    if (this.lifting) rov.pitch_torque += Ring.TORQUE_HANGING;
    this.prev_claw = rov.claw;

    if (this.held || this.hooked) this.vx = this.vy = this.wz = 0.0;
    else this._coast(dt);
    if (!this.held) {
      this._collide(rov, dt);
      for (const other of this.others) if (other !== this) this._collideRing(other);
    }
    for (let i = 0; i < 3; i++) {                        // keep both ends of the hoop inside the pool
      let worst = null;
      for (const [px, py] of this._footprint()) {
        const [qx, qy] = nearestIn(POOL_REGIONS, px, py);
        const d = (qx - px) ** 2 + (qy - py) ** 2;
        if (d > 1e-12 && (worst === null || d > worst[0])) worst = [d, qx - px, qy - py];
      }
      if (worst === null) break;
      this.x += worst[1];
      this.y += worst[2];
    }
    this.depth = clamp(this.depth, Ring.R + Ring.TUBE, this.floor);
  }

  // ------------------------------------------------------------------ being pushed
  _coast(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.yaw += this.wz * dt;
    const k = Math.exp(-Ring.COAST_DRAG * dt), ks = Math.exp(-Ring.SPIN_DRAG * dt);
    this.vx *= k; this.vy *= k; this.wz *= ks;
  }

  /** The hoop as N_HOOP + 1 points (the first repeated), each [x, y, up]. */
  _hoop() {
    const ehx = Math.cos(this.yaw), ehy = Math.sin(this.yaw), upc = -this.depth;
    const pts = [];
    for (let k = 0; k <= Ring.N_HOOP; k++) {
      const a = 2 * Math.PI * k / Ring.N_HOOP;
      const h = Ring.R * Math.cos(a), v = Ring.R * Math.sin(a);
      pts.push([this.x + h * ehx, this.y + h * ehy, upc + v]);
    }
    return pts;
  }

  /** Move the ring out of an overlap: `pen` metres along unit vector `n`; an off-centre push also turns it. */
  _push(n, pen, contact, dt) {
    const [px, py, pz] = [n[0] * pen, n[1] * pen, n[2] * pen];
    const [rx, ry] = [contact[0] - this.x, contact[1] - this.y];
    const dyaw = clamp(Ring.SPIN * (rx * py - ry * px) / (Ring.R * Ring.R), -0.15, 0.15);
    this.x += px; this.y += py; this.depth -= pz; this.yaw += dyaw;
    if (dt > 0) {
      this.vx = clamp(0.5 * this.vx + 0.5 * px / dt, -1.5, 1.5);
      this.vy = clamp(0.5 * this.vy + 0.5 * py / dt, -1.5, 1.5);
      this.wz = clamp(0.5 * this.wz + 0.5 * dyaw / dt, -4.0, 4.0);
    }
  }

  /** Push the ring away from any solid part of the ROV it overlaps (the part that is hooking it excepted). */
  _collide(rov, dt) {
    const center = [this.x, this.y, -this.depth];
    const reach = Ring.R + Ring.TUBE + 0.03;
    const near = [];
    for (const [a, b, r, tag] of capsules(rov)) {
      if (tag === "nose" && this.hooked) continue;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const half = dist3(a, b) / 2;
      if (dist3(mid, center) <= half + r + reach) near.push([a, b, r]);
    }
    for (let it = 0; it < 3; it++) {
      if (!near.length) return;
      const hoop = this._hoop();
      let worst = null;
      for (const [a, b, r] of near) {
        for (let i = 0; i < Ring.N_HOOP; i++) {
          const [c1, c2, d] = segSeg(a, b, hoop[i], hoop[i + 1]);
          const pen = r + Ring.TUBE - d;
          if (pen > 1e-4 && (worst === null || pen > worst[0])) worst = [pen, c1, c2, d];
        }
      }
      if (worst === null) return;
      const [pen, c1, c2, d] = worst;
      const n = d > 1e-9 ? [(c2[0] - c1[0]) / d, (c2[1] - c1[1]) / d, (c2[2] - c1[2]) / d] : [0.0, 0.0, 1.0];
      this._push(n, pen + 0.0005, c2, dt);
    }
  }

  /** Two rings don't pass through each other: each moves half the overlap (all of it if the other is held). */
  _collideRing(other) {
    if (dist3([this.x, this.y, -this.depth], [other.x, other.y, -other.depth]) > 2 * Ring.R + 0.1) return;
    const mine = this._hoop(), theirs = other._hoop();
    let worst = null;
    for (let i = 0; i < Ring.N_HOOP; i++) {
      for (let j = 0; j < Ring.N_HOOP; j++) {
        const [c1, c2, d] = segSeg(mine[i], mine[i + 1], theirs[j], theirs[j + 1]);
        const pen = 2 * Ring.TUBE - d;
        if (pen > 1e-4 && (worst === null || pen > worst[0])) worst = [pen, c1, c2, d];
      }
    }
    if (worst === null) return;
    const [pen, c1, c2, d] = worst;
    const n = d > 1e-9 ? [(c1[0] - c2[0]) / d, (c1[1] - c2[1]) / d, (c1[2] - c2[2]) / d] : [1.0, 0.0, 0.0];
    const share = other.held || other.hooked ? 1.0 : 0.5;
    this._push(n, pen * share + 0.0005, c1, 0.0);
  }

  // ------------------------------------------------------------------ claw
  _letGo(rov) {
    this.held = false;
    if (rov.claw_holder === this) rov.claw_holder = null;
  }

  _followClaw(rov, c, s) {
    if (rov.claw_target > Ring.CLAMP_COMMAND) { this._letGo(rov); return; }
    const [rx, ry, rz, ryaw] = this.rel;
    this.x = rov.x + c * rx - s * ry;
    this.y = rov.y + s * rx + c * ry;
    this.depth = rov.depth - rz;
    this.yaw = rov.yaw + ryaw;
  }

  /** Is a piece of the hoop (running across the jaws, not along them) inside the space between the jaws? */
  _betweenJaws(rov, c, s) {
    const ehx = Math.cos(this.yaw), ehy = Math.sin(this.yaw);
    const cp = Math.cos(rov.pitch), sp = Math.sin(rov.pitch);
    const swing = Math.sin(Ring.JAW_SWING * rov.claw);
    const across = -s * ehx + c * ehy;
    for (let k = 0; k < 72; k++) {
      const a = 2 * Math.PI * k / 72;
      const h = Ring.R * Math.cos(a), v = Ring.R * Math.sin(a);
      const dx = this.x + h * ehx - rov.x, dy = this.y + h * ehy - rov.y;
      const fwd = c * dx + s * dy, left = -s * dx + c * dy;
      const up = -this.depth + v + rov.depth;
      const fx = fwd * cp - up * sp, fz = fwd * sp + up * cp;
      if (!(Ring.JAW_X0 <= fx && fx <= Ring.JAW_X1) || Math.abs(fz - Ring.JAW_Z) > Ring.JAW_ZTOL) continue;
      const opening = Ring.JAW_Y0 + (fx - Ring.JAW_X0) * swing - Ring.JAW_HALF;
      if (Math.abs(left) + Ring.TUBE > opening) continue;
      if (Math.abs(-Math.sin(a) * across) < 0.6) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ nose
  /** World [x, y, up] of a point fixed to the ROV (fx ahead, up above its centre), allowing for pitch. */
  static _toolPoint(rov, c, s, fx, up) {
    const cp = Math.cos(rov.pitch), sp = Math.sin(rov.pitch);
    const fx2 = fx * cp + up * sp, up2 = -fx * sp + up * cp;
    return [rov.x + c * fx2, rov.y + s * fx2, -rov.depth + up2];
  }
  _nosePoints(rov, c, s) { return Ring.NOSE.map(([fx, up]) => Ring._toolPoint(rov, c, s, fx, up)); }

  /** Where the nose polyline crosses the ring's plane: [in-plane horizontal, vertical, point] or null. */
  _cross(pts) {
    const nx = -Math.sin(this.yaw), ny = Math.cos(this.yaw);
    const ehx = Math.cos(this.yaw), ehy = Math.sin(this.yaw);
    const upC = -this.depth;
    const d = pts.map((p) => (p[0] - this.x) * nx + (p[1] - this.y) * ny);
    for (let i = 0; i < pts.length - 1; i++) {
      if (d[i] === d[i + 1] || d[i] * d[i + 1] > 0) continue;
      const t = d[i] / (d[i] - d[i + 1]);
      const q = [0, 1, 2].map((k) => pts[i][k] + t * (pts[i + 1][k] - pts[i][k]));
      return [(q[0] - this.x) * ehx + (q[1] - this.y) * ehy, q[2] - upC, q];
    }
    return null;
  }

  _nose(rov, c, s, dt) {
    const rho = Ring.R - Ring.TUBE - Ring.NOSE_R;
    const cross = this._cross(this._nosePoints(rov, c, s));
    if (cross === null) { this.hooked = false; return; }
    let [dh, dv] = cross;
    if (!this.hooked) {
      if (Math.hypot(dh, dv) < rho - 0.01) this.hooked = true;
      else return;
    }
    const dist = Math.hypot(dh, dv);
    if (dv < 0 && dist > rho + 0.03 && this.depth >= this.floor - 1e-6) { this.hooked = false; return; }
    const ehx = Math.cos(this.yaw), ehy = Math.sin(this.yaw);
    if (dv > 0 && dist > rho - 0.01) {                   // hang: the ring slides sideways until it is directly under the contact point
      const shift = dh * Math.min(1.0, 6.0 * dt);
      this.x += ehx * shift; this.y += ehy * shift;
      dh -= shift;
    }
    if (dist > rho) {                                    // the nose has reached the rim: the ring is dragged along
      const k = (dist - rho) / dist;
      this.x += ehx * dh * k; this.y += ehy * dh * k;
      this.depth -= dv * k;
    }
    const hanging = dv > 0 && dist > rho - 0.02;
    this.lifting = hanging && this.depth < this.floor - 0.02;
    const a = (this.x - rov.x) * c + (this.y - rov.y) * s;
    const shove = clamp(a, Ring.SLIDE[0], Ring.SLIDE[1]) - a;
    if (shove > 0 || hanging) { this.x += shove * c; this.y += shove * s; }
    this.yaw += wrapHalfPi(rov.yaw + Math.PI / 2 - this.yaw) * Math.min(1.0, 6.0 * dt);   // the ring turns with the ROV
  }

  // ------------------------------------------------------------------ report
  state() {
    return { type: "ring", x: this.x, y: this.y, depth: this.depth, yaw: this.yaw, held: this.held, hooked: this.hooked,
      inJaws: this.in_jaws, r: Ring.R, tube: Ring.TUBE, color: this.color };
  }
}

// where the rings start (x, y, yaw, colour): the first faces the ROV's starting position; the rest are scattered
export const RING_STARTS = [
  [0.8, 0.0, Math.PI / 2, 0xff6a00],             // orange
  [-0.4, -0.9, Math.PI / 2 + 0.5, 0xffc400],     // yellow
  [1.9, 0.9, Math.PI / 2 - 0.5, 0x2fbf5a],       // green
  [-1.9, 0.9, Math.PI / 2 + 0.2, 0xb15cff],      // purple
  [2.3, -0.9, Math.PI / 2 - 0.3, 0xff4d88],      // pink
];

/** Put n rings (0 to 5) in the pool. */
export function addTo(rov, n = 3) {
  const rings = [];
  for (const [x, y, yaw, color] of RING_STARTS.slice(0, Math.max(0, Math.min(Math.trunc(n), RING_STARTS.length)))) {
    rings.push(new Ring(x, y, yaw, color, rings));
  }
  rov.props.push(...rings);
}
