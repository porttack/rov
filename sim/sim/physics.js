// physics.js — a line-by-line port of ../../rov_physics.py (the Python file is the reference: change it first, then here).
// No DOM, no three.js: runs in the browser and in Node. Axes as in Python: x forward, y LEFT, depth DOWN from the surface.
// What is NOT ported: the web server, and (for now) the optional props (rings/fish) -- the hooks (`props`, `claw_floor`,
// `pitch_torque`) are here so rings.js / fishbrain.js can plug in later.

// The pool: the main pool (the deep end) and the shallow end. Python has these two numbers fixed; here the MAIN pool can be made longer and wider
// with whole-number multipliers (setPool, used by the page's ?poollength= and ?poolwidth=). The ROV still starts near the near wall, in the middle;
// the main pool grows away from it (longer = further along x, wider = both sides of y = 0); the shallow end keeps its 2.5 m x 2.5 m size and stays
// flush with the far wall, joined along the main pool's +y wall.
export const MAIN_LENGTH = 6.0, MAIN_WIDTH = 3.0, SHELF = 2.5;
export const POOL_DEPTHS = [2, 3, 4, 6];                 // the main pool can be this deep (m); the shallow end stays 1 m
export function poolRegions(lengthMul = 1, widthMul = 1, depth = 2.0) {
  const x1 = -3.0 + MAIN_LENGTH * lengthMul, half = (MAIN_WIDTH * widthMul) / 2;
  return [
    [-3.0, x1, -half, half, depth],                     // x0, x1, y0, y1, floor depth: the main pool (deep end)
    [x1 - SHELF, x1, half, half + SHELF, 1.0],          // the shallow end: a 1 m deep shelf
  ];
}
// STAIRS: three steps cut into the shallow end's outer wall (a notch STAIR_WIDTH wide, each step STAIR_TREAD deep), at STAIR_DEPTHS of the shelf's depth (so a ring, 0.3 m high,
// lies under the water even on the top step, and the ROV can drive onto the first). Ordinary regions for the ROV and the rings; the crab and the fish stay in POOL_WATER (the pool proper).
// (The same code is in rov_physics.py.)
export const STAIR_WIDTH = 1.5, STAIR_TREAD = 0.6, STAIR_DEPTHS = [0.8, 0.6, 0.4];
export function makeStairs(water) {
  const sh = water.reduce((a, b) => (b[4] < a[4] ? b : a));
  const xMax = Math.max(...water.map((r) => r[1])), yMax = Math.max(...water.map((r) => r[3])), xMin = Math.min(...water.map((r) => r[0])), yMin = Math.min(...water.map((r) => r[2]));
  const side = sh[1] >= xMax - 1e-9 ? "x1" : sh[3] >= yMax - 1e-9 ? "y1" : sh[0] <= xMin + 1e-9 ? "x0" : sh[2] <= yMin + 1e-9 ? "y0" : null;
  if (!side) return [];
  const alongX = side[0] === "y", lo = alongX ? sh[0] : sh[2], hi = alongX ? sh[1] : sh[3], half = Math.min(STAIR_WIDTH, hi - lo - 0.2) / 2;
  if (half < 0.3) return [];
  const mid = (lo + hi) / 2;
  return STAIR_DEPTHS.map((f, i) => {
    const a = i * STAIR_TREAD, b = (i + 1) * STAIR_TREAD, d = sh[4] * f;
    if (side === "x1") return [sh[1] + a, sh[1] + b, mid - half, mid + half, d];
    if (side === "x0") return [sh[0] - b, sh[0] - a, mid - half, mid + half, d];
    if (side === "y1") return [mid - half, mid + half, sh[3] + a, sh[3] + b, d];
    return [mid - half, mid + half, sh[2] - b, sh[2] - a, d];
  });
}
export const POOL_WATER = poolRegions(1, 1);              // the pool proper (the same array object is edited in place by setPool, so every importer sees the change)
export const POOL_REGIONS = [...POOL_WATER, ...makeStairs(POOL_WATER)];   // everything the ROV and the rings can be over
export let POOL_MAX_DEPTH = Math.max(...POOL_REGIONS.map((r) => r[4]));
/** Resize the main pool (whole numbers: length 1..2 times 6 m, width 1..3 times 3 m, depth 2, 3, 4 or 6 m). Call it BEFORE creating the ROV, rings and fish. */
export function setPool(lengthMul = 1, widthMul = 1, depth = 2) {
  const L = Math.max(1, Math.min(2, Math.round(lengthMul))), W = Math.max(1, Math.min(3, Math.round(widthMul)));
  const D = POOL_DEPTHS.reduce((a, b) => (Math.abs(b - depth) < Math.abs(a - depth) ? b : a));     // the nearest allowed depth
  POOL_WATER.splice(0, POOL_WATER.length, ...poolRegions(L, W, D));
  POOL_REGIONS.splice(0, POOL_REGIONS.length, ...POOL_WATER, ...makeStairs(POOL_WATER));
  POOL_MAX_DEPTH = Math.max(...POOL_REGIONS.map((r) => r[4]));
}
export const ROV_HALF = 0.25, ROV_BOTTOM = 0.28;
export const START = { x: -1.5, y: 0.0, depth: 0.8, yaw: 0.0 };

// The red (t1) and green (t2) thrusters give this fraction of max_thrust at a command of 1.0: the normal ("1x") speed. The `speed` setting
// (0.25 .. 4, the page's ?speed=) multiplies it. It was 1.0 before; halved so the ROV is easier to drive. (Same constant as rov_physics.py.)
export const SIDE_THRUST = 0.5;
export const CORNER_SHARE = 0.75;     // a tilted corner thruster (8 layout) gives this fraction of what a horizontal one gives
export const TURN_ARM = 0.22;
const INERTIA = 1.2;
const LIN_DRAG = 6.0, QUAD_DRAG = 10.0, YAW_LIN = 1.6, YAW_QUAD = 1.0, HEAVE_MASS_BOOST = 1.5;
export const CLAW_TIME = 0.6;

const SURF_DEPTH = ROV_HALF;
export const BUOYANCY = 1.5;
export const DEFAULT_BUOYANCY = 0.0;     // a new ROV is neutrally buoyant (it hovers); the page's Buoyancy button picks floats / neutral / sinks
export const BUOYANCY_MODES = { positive: BUOYANCY, neutral: 0.0, negative: -BUOYANCY };
const EMERGE_SOFT = 0.08, EMERGE_K1 = 25.0, EMERGE_K2 = 140.0, EMERGE_DAMP = 45.0, EMERGE_MAX = 0.45;
const FLOOR_BOUNCE = 0.2, THRUSTER_UP = -0.15;
export const VERT_ARM = 0.2;
const PITCH_I = 0.6, PITCH_KS = 16.8, PITCH_DS = 3.0, MAX_PITCH = 0.6;
// Roll (heeling over sideways) works like pitch: a spring from buoyancy, damping from the water. Only a current (the water pushing the frame) makes it roll.
// Roll is positive with the TOP of the ROV going to its right (right side down). Shown on the page and in the IMU; the collision shape ignores it.
const ROLL_I = 0.6, ROLL_KS = 12.0, ROLL_DS = 3.0, MAX_ROLL = 0.6;
// How a current tilts the ROV: the water's push on the frame acts this far above its middle (a push from the side heels it over, one from ahead or behind
// pitches it), plus the difference between the push on the top of the frame and on the bottom (a jet that hits only the upper part). Metres.
const TILT_ARM = 0.30, SHEAR_ARM = 0.20;       // for pitch
const ROLL_ARM = 0.55, ROLL_SHEAR = 0.35;      // for roll (a sideways push is weaker than a head-on one, so a longer lever shows it)
export const G = 9.81;
const BODY_HX = 0.26, BODY_HY = 0.33, TOOL_TIP = 0.60;

export const T_LEFT = "t1", T_RIGHT = "t2", T_FRONT = "t3", T_REAR = "t4";

// THRUSTER LAYOUTS: 3, 4 (the original), 6 or 8 thrusters (same table as rov_physics.py). Each thruster:
//   name   the channel (t1 ... t8)           kind  "h" horizontal (pushes along (dx, dy)) or "v" vertical (pushes up for a + command)
//   x, y   its LEVER ARM for the torques: metres ahead of / to the LEFT of the ROV's middle
//   gx, gy where it is drawn and where its solid parts are for collisions       dx, dy  for a horizontal one: the unit vector a + command pushes the ROV along
//   label  a short name for the page; color "red" (left) / "green" (right) / "white"
// 3: t1 left, t2 right (on the sides), t3 one vertical in the middle.   4: t1 left, t2 right, t3 front vertical, t4 rear vertical (the original).
// 6: t1-t4 horizontal on the four vertical posts, angled 45 degrees in an "X" (so it can also slide sideways), t5 front vertical, t6 rear vertical.
// 8: one thruster just outside EACH of the cube's 8 corners, tilted 45 degrees: t1-t4 on the top corners, t5-t8 on the bottom ones (front left, front right,
//    rear left, rear right). The rear ones are the MIRROR IMAGES of the front ones: from above they fan out like an "X" (front ones point forward, rear ones backward,
//    all sideways toward the middle), and each leans up (top) or down (bottom) by 45 degrees (so 45 / 135 degrees to the PVC). Kind "c": it also has a z lever arm and dz.
//    Eight directions give all six movements, each from its own sign pattern.
const _C = Math.sqrt(0.5);
const _h = (name, x, y, gx, gy, dx, dy, label, color) => ({ name, kind: "h", x, y, z: 0.0, gx, gy, gz: 0.0, dx, dy, dz: 0.0, label, color });
const _v = (name, x, y, gx, gy, label) => ({ name, kind: "v", x, y, z: 0.0, gx, gy, gz: 0.0, dx: 0.0, dy: 0.0, dz: 0.0, label, color: "white" });
/** A thruster at the corner (sx, sy, sz = +-1: ahead/behind, left/right, top/bottom), 45 degrees up or down from the 6-layout's horizontal diagonal. */
const _c = (name, sx, sy, sz, label) => ({ name, kind: "c", x: 0.25 * sx, y: 0.25 * sy, z: 0.25 * sz, gx: 0.30 * sx, gy: 0.30 * sy, gz: 0.30 * sz,
  dx: 0.5 * sx, dy: -0.5 * sy, dz: sz * _C, label, color: sy > 0 ? "red" : "green" });
const _CORNERS = [[1, 1, "front left"], [1, -1, "front right"], [-1, 1, "rear left"], [-1, -1, "rear right"]];
const _SIDES = [_h("t1", 0.0, TURN_ARM, 0.0, 0.32, 1.0, 0.0, "left", "red"), _h("t2", 0.0, -TURN_ARM, 0.0, -0.32, 1.0, 0.0, "right", "green")];
const _POSTS = [_h("t1", 0.25, 0.25, 0.30, 0.30, _C, -_C, "front left", "red"), _h("t2", 0.25, -0.25, 0.30, -0.30, _C, _C, "front right", "green"),
  _h("t3", -0.25, 0.25, -0.30, 0.30, _C, _C, "rear left", "red"), _h("t4", -0.25, -0.25, -0.30, -0.30, _C, -_C, "rear right", "green")];
export const THRUSTER_LAYOUTS = {
  3: [..._SIDES, _v("t3", 0.0, 0.0, 0.0, 0.0, "vertical")],
  4: [..._SIDES, _v("t3", VERT_ARM, 0.0, 0.17, 0.0, "front"), _v("t4", -VERT_ARM, 0.0, -0.17, 0.0, "rear")],
  6: [..._POSTS, _v("t5", VERT_ARM, 0.0, 0.17, 0.0, "front vertical"), _v("t6", -VERT_ARM, 0.0, -0.17, 0.0, "rear vertical")],
  8: [..._CORNERS.map(([sx, sy, lab], i) => _c("t" + (i + 1), sx, sy, 1, lab + " top")),
    ..._CORNERS.map(([sx, sy, lab], i) => _c("t" + (i + 5), sx, sy, -1, lab + " bottom"))],
};
/** The thruster layout for n thrusters (3, 4, 6 or 8); anything else gives the original 4. */
export const layoutFor = (n) => THRUSTER_LAYOUTS[Math.trunc(Number(n))] ?? THRUSTER_LAYOUTS[4];

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
  constructor({ maxThrust = 12.0, mass = 8.0, buoyancy = DEFAULT_BUOYANCY, hardLimits = false, tool = "claw", imuNoise = 0.0, imuResolution = 0.0, speed = 1.0, thrusters = 4 } = {}) {
    this.max_thrust = maxThrust; this.mass = mass; this.buoyancy = buoyancy;
    this.speed_mult = clamp(Number(speed), 0.25, 4.0);       // multiplies the red / green thrusters' power (1 = normal)
    this.hard_limits = hardLimits;
    this.tool = tool;
    this.props = [];                         // optional extras (rings, fish): each has reset/step/state
    this.claw_floor = 0.0;
    this.claw_holder = null;
    this.thruster_up = THRUSTER_UP;
    this.pitch = this.pitch_rate = 0.0;      // radians, positive = nose DOWN
    this.roll = this.roll_rate = 0.0;        // radians, positive = right side DOWN (the top goes to the right)
    this.pitch_torque = 0.0;
    this.imu_noise = imuNoise;
    this.imu_resolution = imuResolution;
    this.imu_acc = [0.0, 0.0, G];
    this.splash_n = this.floor_n = 0;
    this.splash_v = this.floor_v = 0.0;
    this.cmd = {};                           // thruster commands, each -1..1, by channel name (t1 ... t3, t4, t6 or t8: see THRUSTER_LAYOUTS)
    this.set_layout(thrusters);
    this.claw_target = 0.0;
    this.reset();
  }

  reset() {
    this.props = this.props.filter((p) => !p.transient);     // rings dropped into the pool disappear on Reset
    const S = this.start_pose || START;               // (a mission may start the ROV somewhere else)
    this.x = S.x; this.y = S.y; this.depth = S.depth; this.yaw = S.yaw;
    this.u = this.v = this.w = this.r = 0.0;
    this.claw = 0.0;
    for (const k in this.cmd) this.cmd[k] = 0.0;
    this.pitch = this.pitch_rate = 0.0;
    this.roll = this.roll_rate = 0.0;
    this.claw_holder = null;
    this._depth_before = this.depth;
    this._prev = [0.0, 0.0, 0.0, 0.0];
    this.imu_acc = [0.0, 0.0, G];
    for (const p of this.props) p.reset();
  }

  /** Switch to 3, 4, 6 or 8 thrusters (any other number gives 4). The commands go back to zero; nothing else changes. */
  set_layout(n) {
    this.layout = layoutFor(n);
    this.thrusters = this.layout.length;
    this.cmd = Object.fromEntries(this.layout.map((th) => [th.name, 0.0]));
  }

  /** A thruster command, -1..1. A channel this layout does not have (t5 with 4 thrusters) is ignored: returns false. */
  set_cmd(name, value) {
    if (!(name in this.cmd)) return false;
    this.cmd[name] = clamp(Number(value), -1.0, 1.0);
    return true;
  }

  step(dt) {
    const mt = this.max_thrust, m = this.mass;
    const side = mt * SIDE_THRUST * this.speed_mult;          // what a command of 1.0 gives a horizontal thruster (N)
    const h0 = -this.depth + this.thruster_up * Math.cos(this.pitch);
    const sp_ = Math.sin(this.pitch), sr_ = Math.sin(this.roll);
    let fx = 0.0, fy = 0.0, yawT = 0.0;                        // the horizontal thrusters: force along and across the ROV, and the twist about the vertical
    let fv = 0.0, pitchT = 0.0, rollT = 0.0;                   // the vertical ones: total push up, and the twists (nose DOWN +, top-to-the-right +)
    for (const th of this.layout) {
      if (th.kind === "h") {
        const f = this.cmd[th.name] * side;
        fx += f * th.dx; fy += f * th.dy;
        yawT += th.x * f * th.dy - th.y * f * th.dx;
      } else if (th.kind === "c") {
        // a corner thruster tilted 45 degrees: its force has all three parts, at 3/4 of a horizontal one (CORNER_SHARE); a propeller only pushes water
        // while it is under the surface (its height allows for pitch and roll too)
        let f = this.cmd[th.name] * side * CORNER_SHARE;
        f *= clamp(0.5 - (-this.depth + th.z * Math.cos(this.pitch) - th.x * sp_ + th.y * sr_) / 0.08, 0.0, 1.0);
        const tx = f * th.dx, ty = f * th.dy, tz = f * th.dz;
        fx += tx; fy += ty; fv += tz;
        yawT += th.x * ty - th.y * tx;
        pitchT += th.z * tx - th.x * tz;                       // forward above the middle tips the nose down; up ahead lifts it
        rollT += th.y * tz - th.z * ty;                        // up on the left lifts the left side; left at the top leans the top left
      } else {
        // each vertical thruster is half of max_thrust; a propeller only pushes water while it is under the surface (heights allow for pitch and roll)
        let f = this.cmd[th.name] * mt / 2;
        f *= clamp(0.5 - (h0 - th.x * sp_ + th.y * sr_) / 0.08, 0.0, 1.0);
        fv += f;
        pitchT -= f * th.x;                                    // a push up ahead of the middle lifts the nose (nose DOWN is positive)
        rollT += f * th.y;                                     // a push up on the left lifts the left side (the top goes to the right)
      }
    }
    // The water itself may be moving (a current from the optional jets, current.js): drag works on the speed RELATIVE to the water.
    // With no current this is exactly the old behaviour (the water is still: wx = wy = wd = 0).
    const [wx, wy, wd] = this._water();
    const c0 = Math.cos(this.yaw), s0 = Math.sin(this.yaw);
    const ur = this.u - (wx * c0 + wy * s0), vr = this.v - (-wx * s0 + wy * c0), wr = this.w - wd;
    const surge = fx - LIN_DRAG * ur - QUAD_DRAG * ur * Math.abs(ur);
    const torque = yawT - YAW_LIN * this.r - YAW_QUAD * this.r * Math.abs(this.r);
    let heaveUp = fv + this.buoyancy + LIN_DRAG * wr + QUAD_DRAG * wr * Math.abs(wr);
    if (!this.hard_limits) {
      const out = Math.max(0.0, SURF_DEPTH - this.depth);
      heaveUp -= EMERGE_K1 * Math.min(out, EMERGE_SOFT) + EMERGE_K2 * Math.max(0.0, out - EMERGE_SOFT);
      if (out > 0) heaveUp += EMERGE_DAMP * this.w;
    }
    const sway = fy - LIN_DRAG * 2 * vr;                       // (the angled thrusters of the 6 and 8 layouts can push sideways)

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
    const [tp, tr] = this._waterTorque();                       // what a current does to the tilt (exactly 0, 0 with no current)
    const tilt = pitchT + this.pitch_torque + tp;
    this.pitch_rate += (tilt - PITCH_KS * this.pitch - PITCH_DS * this.pitch_rate) / PITCH_I * dt;
    this.pitch = clamp(this.pitch + this.pitch_rate * dt, -MAX_PITCH, MAX_PITCH);
    this.roll_rate += (tr + rollT - ROLL_KS * this.roll - ROLL_DS * this.roll_rate) / ROLL_I * dt;
    this.roll = clamp(this.roll + this.roll_rate * dt, -MAX_ROLL, MAX_ROLL);
    this._accelerometer(dt);
  }

  /** The water's velocity at a point: [world x, world y, DOWN] in m/s. Any prop with a flow(x, y, depth) method moves the water
   *  (the jets in current.js do); with none, the water is still. */
  _flowAt(x, y, depth) {
    let wx = 0.0, wy = 0.0, wd = 0.0;
    for (const p of this.props) {
      if (typeof p.flow === "function") { const [a, b, c] = p.flow(x, y, depth); wx += a; wy += b; wd += c; }
    }
    return [wx, wy, wd];
  }

  /** The water's own velocity at the ROV's middle. */
  _water() { return this._flowAt(this.x, this.y, this.depth); }

  /** The twist a current gives the frame: [pitch torque, nose DOWN +; roll torque, top-to-the-right +], N m. The push of the water is worked out at
   *  the top, middle and bottom of the frame (a jet usually hits only part of it), from the water's speed RELATIVE to the ROV: a ROV carried along with
   *  the water is not pushed over, one held against it is. It fades in with the strength of the current, so with the water still it is exactly [0, 0]
   *  and driving about does not tilt the ROV. */
  _waterTorque() {
    if (!this.props.some((p) => typeof p.flow === "function")) return [0.0, 0.0];
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const forces = []; let strongest = 0.0;
    for (const dz of [-ROV_HALF, 0.0, ROV_HALF]) {                // top (shallower), middle, bottom (deeper)
      const [wx, wy] = this._flowAt(this.x, this.y, this.depth + dz);
      strongest = Math.max(strongest, Math.hypot(wx, wy));
      const ur = wx * c + wy * s - this.u, vr = -wx * s + wy * c - this.v;       // the water's speed along and across the ROV, relative to the ROV
      forces.push([LIN_DRAG * ur + QUAD_DRAG * ur * Math.abs(ur), LIN_DRAG * 2 * vr]);
    }
    const fade = Math.min(1.0, strongest / 0.1);                   // 0 with still water, 1 once the current is 0.1 m/s or more
    const [[fxt, fyt], [fxm, fym], [fxb, fyb]] = forces;
    return [fade * (TILT_ARM * fxm + SHEAR_ARM * (fxt - fxb)), -fade * (ROLL_ARM * fym + ROLL_SHEAR * (fyt - fyb))];
  }

  _accelerometer(dt) {
    const [u0, v0, w0, r0] = this._prev;       // r0 unused, as in Python
    this._prev = [this.u, this.v, this.w, this.r];
    if (dt <= 0) return;
    const aFwd = (this.u - u0) / dt - this.r * this.v;
    const aLeft = (this.v - v0) / dt + this.r * this.u;
    const fUp = -(this.w - w0) / dt + G;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const ax = aFwd * cp - fUp * sp, az0 = aFwd * sp + fUp * cp;
    const cr = Math.cos(this.roll), sr = Math.sin(this.roll);        // heeling over swings gravity into the y axis (the up direction leans toward the left)
    const ay = aLeft * cr + az0 * sr, az = az0 * cr - aLeft * sr;
    const n = this.imu_noise;
    const acc = n ? [ax + gauss(n), ay + gauss(n), az + gauss(n)] : [ax, ay, az];
    const q = this.imu_resolution;
    this.imu_acc = q ? acc.map((v) => pyRound(v / q) * q) : acc;
  }

  imu() {
    const n = this.imu_noise;
    const g = n ? () => gauss(n * 0.1) : () => 0.0;
    return { roll: this.roll, pitch: this.pitch, yaw: this.yaw,
      gx: this.roll_rate + g(), gy: this.pitch_rate + g(), gz: this.r + g(),
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
      ...this.cmd, thrusters: this.thrusters, layout: this.layout, claw: this.claw,
      speed: Math.sqrt(this.u ** 2 + this.v ** 2 + this.w ** 2),
      splash_n: this.splash_n, splash_v: this.splash_v, floor_n: this.floor_n, floor_v: this.floor_v,
      props: this.props.map((p) => p.state()), tool: this.tool, pitch: this.pitch, roll: this.roll, imu: this.imu(), buoyancy: this.buoyancy,
      regions: POOL_REGIONS.map((r) => [...r]), keys, water: this._water() };
  }
}
