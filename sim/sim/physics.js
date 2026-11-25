// physics.js — a line-by-line port of ../../rov_physics.py (the Python file is the reference: change it first, then here).
// No DOM, no three.js: runs in the browser and in Node. Axes as in Python: x forward, y LEFT, depth DOWN from the surface.
// What is NOT ported: the web server, and (for now) the optional props (rings/fish) -- the hooks (`props`, `claw_floor`,
// `pitch_torque`) are here so rings.js / fishbrain.js can plug in later.

export const POOL_REGIONS = [
  [-3.0, 3.0, -1.5, 1.5, 2.0],     // x0, x1, y0, y1, floor depth: the deep end
  [0.5, 3.0, 1.5, 4.0, 1.0],       // the shallow end: a 1 m deep shelf, joined to the deep end along y = 1.5
];
export const POOL_MAX_DEPTH = Math.max(...POOL_REGIONS.map((r) => r[4]));
export const ROV_HALF = 0.25, ROV_BOTTOM = 0.28;
export const START = { x: -1.5, y: 0.0, depth: 0.8, yaw: 0.0 };

const TURN_ARM = 0.22, INERTIA = 1.2;
const LIN_DRAG = 6.0, QUAD_DRAG = 10.0, YAW_LIN = 1.6, YAW_QUAD = 1.0, HEAVE_MASS_BOOST = 1.5;
export const CLAW_TIME = 0.6;

const SURF_DEPTH = ROV_HALF;
export const BUOYANCY = 1.5;
export const BUOYANCY_MODES = { positive: BUOYANCY, neutral: 0.0, negative: -BUOYANCY };
const EMERGE_SOFT = 0.08, EMERGE_K1 = 25.0, EMERGE_K2 = 140.0, EMERGE_DAMP = 45.0, EMERGE_MAX = 0.45;
const FLOOR_BOUNCE = 0.2, THRUSTER_UP = -0.15;
export const VERT_ARM = 0.2;
const PITCH_I = 0.6, PITCH_KS = 16.8, PITCH_DS = 3.0, MAX_PITCH = 0.6;
export const G = 9.81;
const BODY_HX = 0.26, BODY_HY = 0.33, TOOL_TIP = 0.60;

export const T_LEFT = "t1", T_RIGHT = "t2", T_FRONT = "t3", T_REAR = "t4";

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Python's round() rounds halves to even; Math.round does not.
function pyRound(x) {
  const f = Math.floor(x), d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}
function gauss(sigma) {                     // Box-Muller (not the same stream as Python's random.gauss: noise is not golden-tested)
  const u = 1 - Math.random(), v = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function floorAt(x, y) {
  const ds = POOL_REGIONS.filter((r) => r[0] - 1e-9 <= x && x <= r[1] + 1e-9 && r[2] - 1e-9 <= y && y <= r[3] + 1e-9).map((r) => r[4]);
  return ds.length ? Math.max(...ds) : null;
}

export function nearestIn(regions, x, y, margin = 0.0) {
  let best = null;
  for (const r of regions) {
    const x0 = r[0] + margin, x1 = r[1] - margin, y0 = r[2] + margin, y1 = r[3] - margin;
    if (x0 > x1 || y0 > y1) continue;
    const qx = clamp(x, x0, x1), qy = clamp(y, y0, y1);
    const d = (qx - x) ** 2 + (qy - y) ** 2;
    if (best === null || d < best[0]) best = [d, qx, qy];
  }
  return best ? [best[1], best[2]] : [x, y];
}

export class Rov {
  constructor({ maxThrust = 12.0, mass = 8.0, buoyancy = BUOYANCY, hardLimits = false, tool = "claw", imuNoise = 0.0, imuResolution = 0.0 } = {}) {
    this.max_thrust = maxThrust; this.mass = mass; this.buoyancy = buoyancy;
    this.hard_limits = hardLimits;
    this.tool = tool;
    this.props = [];                         // optional extras (rings, fish): each has reset/step/state
    this.claw_floor = 0.0;
    this.claw_holder = null;
    this.thruster_up = THRUSTER_UP;
    this.pitch = this.pitch_rate = 0.0;      // radians, positive = nose DOWN
    this.pitch_torque = 0.0;
    this.imu_noise = imuNoise;
    this.imu_resolution = imuResolution;
    this.imu_acc = [0.0, 0.0, G];
    this.splash_n = this.floor_n = 0;
    this.splash_v = this.floor_v = 0.0;
    this.cmd = { [T_LEFT]: 0.0, [T_RIGHT]: 0.0, [T_FRONT]: 0.0, [T_REAR]: 0.0 };
    this.claw_target = 0.0;
    this.reset();
  }

  reset() {
    this.x = START.x; this.y = START.y; this.depth = START.depth; this.yaw = START.yaw;
    this.u = this.v = this.w = this.r = 0.0;
    this.claw = 0.0;
    for (const k in this.cmd) this.cmd[k] = 0.0;
    this.pitch = this.pitch_rate = 0.0;
    this.claw_holder = null;
    this._depth_before = this.depth;
    this._prev = [0.0, 0.0, 0.0, 0.0];
    this.imu_acc = [0.0, 0.0, G];
    for (const p of this.props) p.reset();
  }

  set_cmd(name, value) { this.cmd[name] = clamp(Number(value), -1.0, 1.0); }

  step(dt) {
    const mt = this.max_thrust, m = this.mass;
    const fl = this.cmd[T_LEFT] * mt, fr = this.cmd[T_RIGHT] * mt;
    let ff = this.cmd[T_FRONT] * mt / 2, fb = this.cmd[T_REAR] * mt / 2;
    const h0 = -this.depth + this.thruster_up * Math.cos(this.pitch);
    ff *= clamp(0.5 - (h0 - VERT_ARM * Math.sin(this.pitch)) / 0.08, 0.0, 1.0);
    fb *= clamp(0.5 - (h0 + VERT_ARM * Math.sin(this.pitch)) / 0.08, 0.0, 1.0);
    const fv = ff + fb;
    const surge = fl + fr - LIN_DRAG * this.u - QUAD_DRAG * this.u * Math.abs(this.u);
    const torque = (fr - fl) * TURN_ARM - YAW_LIN * this.r - YAW_QUAD * this.r * Math.abs(this.r);
    let heaveUp = fv + this.buoyancy + LIN_DRAG * this.w + QUAD_DRAG * this.w * Math.abs(this.w);
    if (!this.hard_limits) {
      const out = Math.max(0.0, SURF_DEPTH - this.depth);
      heaveUp -= EMERGE_K1 * Math.min(out, EMERGE_SOFT) + EMERGE_K2 * Math.max(0.0, out - EMERGE_SOFT);
      if (out > 0) heaveUp += EMERGE_DAMP * this.w;
    }
    const sway = -LIN_DRAG * 2 * this.v;

    this.u += surge / m * dt;
    this.v += sway / m * dt;
    this.w += -heaveUp / (m * HEAVE_MASS_BOOST) * dt;
    this.r += torque / INERTIA * dt;

    this.yaw += this.r * dt;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.x += (this.u * c - this.v * s) * dt;
    this.y += (this.u * s + this.v * c) * dt;
    const prevDepth = this.depth;
    this.depth += this.w * dt;

    this._depth_before = prevDepth;
    this._walls(c, s, prevDepth);
    const floor = this._floorLimit(c, s);
    if (this.hard_limits) {
      if (this.depth < 0.15 || this.depth > floor) { this.depth = clamp(this.depth, 0.15, floor); this.w = 0.0; }
    } else {
      if ((prevDepth - SURF_DEPTH) * (this.depth - SURF_DEPTH) < 0 && Math.abs(this.w) > 0.05) {
        this.splash_n += 1; this.splash_v = Math.abs(this.w);
      }
      const top = SURF_DEPTH - EMERGE_MAX;
      if (this.depth < top) { this.depth = top; this.w = Math.max(this.w, 0.0); }
      if (this.depth > floor) {
        if (this.w > 0.05) { this.floor_n += 1; this.floor_v = this.w; }
        this.depth = floor;
        this.w = this.w > 0.1 ? -this.w * FLOOR_BOUNCE : 0.0;
      }
    }

    const k = dt / CLAW_TIME;
    this.claw += clamp(this.claw_target - this.claw, -k, k);
    this.claw = Math.max(this.claw, this.claw_floor);
    this.pitch_torque = 0.0;
    this.claw_floor = 0.0;
    for (const p of this.props) p.step(this, dt);
    const tilt = (fb - ff) * VERT_ARM + this.pitch_torque;
    this.pitch_rate += (tilt - PITCH_KS * this.pitch - PITCH_DS * this.pitch_rate) / PITCH_I * dt;
    this.pitch = clamp(this.pitch + this.pitch_rate * dt, -MAX_PITCH, MAX_PITCH);
    this._accelerometer(dt);
  }

  _accelerometer(dt) {
    const [u0, v0, w0, r0] = this._prev;       // r0 unused, as in Python
    this._prev = [this.u, this.v, this.w, this.r];
    if (dt <= 0) return;
    const aFwd = (this.u - u0) / dt - this.r * this.v;
    const aLeft = (this.v - v0) / dt + this.r * this.u;
    const fUp = -(this.w - w0) / dt + G;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const ax = aFwd * cp - fUp * sp, az = aFwd * sp + fUp * cp;
    const n = this.imu_noise;
    const acc = n ? [ax + gauss(n), aLeft + gauss(n), az + gauss(n)] : [ax, aLeft, az];
    const q = this.imu_resolution;
    this.imu_acc = q ? acc.map((v) => pyRound(v / q) * q) : acc;
  }

  imu() {
    const n = this.imu_noise;
    const g = n ? () => gauss(n * 0.1) : () => 0.0;
    return { roll: 0.0, pitch: this.pitch, yaw: this.yaw,
      gx: g(), gy: this.pitch_rate + g(), gz: this.r + g(),
      ax: this.imu_acc[0], ay: this.imu_acc[1], az: this.imu_acc[2] };
  }

  _footprint(c, s) {
    const pts = [[BODY_HX, BODY_HY], [BODY_HX, -BODY_HY], [-BODY_HX, BODY_HY], [-BODY_HX, -BODY_HY], [TOOL_TIP, 0.0]];
    return pts.map(([px, py]) => [this.x + c * px - s * py, this.y + s * px + c * py]);
  }

  _openRegions(depth) {
    const need = depth + ROV_BOTTOM;
    const open = POOL_REGIONS.filter((r) => r[4] >= need - 1e-6);
    if (open.length) return open;
    return [POOL_REGIONS.reduce((a, b) => (b[4] > a[4] ? b : a))];       // max(): first of equals, like Python
  }

  _floorLimit(c, s) {
    const regions = this._openRegions(this._depth_before);
    const floors = [];
    for (const [x, y] of this._footprint(c, s)) {
      const ds = regions.filter((r) => r[0] - 1e-9 <= x && x <= r[1] + 1e-9 && r[2] - 1e-9 <= y && y <= r[3] + 1e-9).map((r) => r[4]);
      if (ds.length) floors.push(Math.max(...ds));
    }
    return (floors.length ? Math.min(...floors) : POOL_MAX_DEPTH) - ROV_BOTTOM;
  }

  _walls(c, s, depth) {
    const openRegions = this._openRegions(depth);
    let vx = this.u * c - this.v * s, vy = this.u * s + this.v * c;
    for (let i = 0; i < 4; i++) {
      let worst = null;
      for (const [wx, wy] of this._footprint(c, s)) {
        const [qx, qy] = nearestIn(openRegions, wx, wy);
        const dx = qx - wx, dy = qy - wy, d = dx * dx + dy * dy;
        if (d > 1e-12 && (worst === null || d > worst[0])) worst = [d, dx, dy];
      }
      if (worst === null) break;
      const [, dx, dy] = worst;
      this.x += dx; this.y += dy;
      if (dx > 0) vx = Math.max(vx, 0.0); else if (dx < 0) vx = Math.min(vx, 0.0);
      if (dy > 0) vy = Math.max(vy, 0.0); else if (dy < 0) vy = Math.min(vy, 0.0);
    }
    this.u = vx * c + vy * s; this.v = -vx * s + vy * c;
  }

  state(keys = false) {
    return { x: this.x, y: this.y, depth: this.depth, yaw: this.yaw,
      t1: this.cmd[T_LEFT], t2: this.cmd[T_RIGHT], t3: this.cmd[T_FRONT], t4: this.cmd[T_REAR], claw: this.claw,
      speed: Math.sqrt(this.u ** 2 + this.v ** 2 + this.w ** 2),
      splash_n: this.splash_n, splash_v: this.splash_v, floor_n: this.floor_n, floor_v: this.floor_v,
      props: this.props.map((p) => p.state()), tool: this.tool, pitch: this.pitch, imu: this.imu(), buoyancy: this.buoyancy,
      regions: POOL_REGIONS.map((r) => [...r]), keys };
  }
}
