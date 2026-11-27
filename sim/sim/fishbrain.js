// fishbrain.js — port of ../../rov_fish.py: a coy fish that swims around and never lets the ROV catch it.
// OPTIONAL add-on, like the Python one (the page draws it with ../fish.js). Remove: delete this file and the addFish() call in world.js.
// WHAT IT DOES: wander (lazy swimming), route (thread a pool ring), peek (come and look into the camera of a ROV that sits still),
// flee (bolt away, planned in 3D). It is never caught: it flees early, is faster than the ROV, and a hard rule keeps it 30 cm from
// the ROV's surface. See the header of rov_fish.py for the full story. Python is the reference; keep the two in step.
import { POOL_MAX_DEPTH, POOL_WATER, clamp, nearestIn } from "./physics.js";
import { CAM_POS, CAM_TILT, distanceToRov, localToWorld } from "./shape.js";
import { Rng } from "./rng.js";

const wrapPi = (a) => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;   // Python's % (always >= 0)
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const maxRegion = () => POOL_WATER.reduce((a, b) => (b[4] > a[4] ? b : a));
const inRect = (r, x, y) => r[0] <= x && x <= r[1] && r[2] <= y && y <= r[3];

export class Fish {
  // --- how close it lets the ROV get (distances are to the ROV's surface, metres) ---
  static SAFE_HARD = 0.30;
  static FLEE_AT = 1.6; static CALM_AT = 2.4;
  static FLEE_AT_TRUST = 0.38; static CALM_AT_TRUST = 0.5;
  static IDLE_AFTER = 2.0;
  static CURIOUS_DELAY = [1.0, 5.0];
  static PEEK_FOR = [8.0, 16.0];
  static PEEK_COOLDOWN = [8.0, 20.0];
  static PEEK_SPEED = 0.55;
  static FLOW_PUSH = 0.45;                          // a current (the water jets, current.js) carries the fish along by this fraction of the water's speed:
                                                    // it swims against it a little, but a strong stream still shoves it about
  static REACTION = 0.0;
  // --- swimming ---
  static CRUISE = [0.15, 0.35];
  static BURST = 2.0;
  static ROV_SPEED = 1.3; static ROV_VSPEED = 0.8;
  static TURN_CRUISE = 1.6; static TURN_FLEE = 7.0;
  static PITCH_CRUISE = 0.5; static PITCH_FLEE = 1.1;
  static MARGIN = 0.3; static WANDER_MARGIN = 0.8; static RING_MARGIN = 0.15; static SURFACE_MARGIN = 0.18;

  constructor(seed = 1, color = 0xff7a2a) {
    this.type = "fish";
    this.seed = seed;
    this.color = color;
    this.peeks = true;               // false when the ROV has no camera (page option ?camera=off): nothing to come and look into
    this.reset();
  }

  reset() {
    const F = Fish;
    this.rng = new Rng(this.seed);
    const deep = maxRegion();
    this.x = this.rng.uniform(deep[0] + 0.6 * (deep[1] - deep[0]), deep[1] - 0.8);
    this.y = this.rng.uniform(deep[2] + 0.6, deep[3] - 0.6);
    this.depth = this.rng.uniform(0.7, Math.min(1.2, deep[4] - 0.5));
    this.yaw = this.rng.uniform(-Math.PI, Math.PI);
    this.pitch = 0.0;
    this.speed = 0.2;
    this.mode = "wander";
    this.target = null;
    this.route = [];
    this.route_ring = null;
    this.route_center = null;
    this.cruise = 0.25;
    this.retarget = 0.0;
    this.clock = 0.0;
    this.idle_t = 0.0;
    this.trusting = false;
    this.peek_until = 0.0;
    this.peek_ready = 0.0;
    this.curious_in = null;
    this.peek_local = [1.0, 0.0, 0.05];
    this.peek_via = null;
    this.pinned_t = 0.0;
    this.dm = F.MARGIN;
    this.gap = 99.0;
    this.darts = 0;
  }

  // ------------------------------------------------------------------ helpers
  _openRegions(depth) {
    const regs = POOL_WATER.filter((r) => r[4] - this.dm >= depth);
    return regs.length ? regs : [maxRegion()];
  }
  _floorHere(x, y, regions = null) {
    const ds = (regions ?? this._openRegions(this.depth)).filter((r) => inRect(r, x, y)).map((r) => r[4]);
    return ds.length ? Math.max(...ds) : POOL_MAX_DEPTH;
  }
  _randomPoint(avoid = null) {
    let p;
    for (let i = 0, n = avoid !== null ? 10 : 1; i < n; i++) {
      p = this._randomSpot();
      if (avoid === null || dist3(p, [avoid.x, avoid.y, avoid.depth]) > 2.5) break;
    }
    return p;
  }
  _randomSpot() {
    const W = Fish.WANDER_MARGIN;
    const regs = POOL_WATER.filter((r) => r[1] - r[0] > 2 * W && r[3] - r[2] > 2 * W && r[4] > 0.9);
    const weights = regs.map((r) => (r[1] - r[0]) * (r[3] - r[2]));
    const r = this.rng.weighted(regs, weights);
    return [this.rng.uniform(r[0] + W, r[1] - W), this.rng.uniform(r[2] + W, r[3] - W), this.rng.uniform(0.4, r[4] - 0.4)];
  }
  _clearance(regions, x, y, z) {
    let h = 0.0;
    for (const m of [0.4, 0.7, 1.0, 1.4]) {
      const [qx, qy] = nearestIn(regions, x, y, m);
      if (Math.abs(qx - x) + Math.abs(qy - y) > 1e-9) break;
      h = m;
    }
    const v = Math.min(z - Fish.MARGIN, this._floorHere(x, y, regions) - Fish.MARGIN - z);
    return Math.min(h / 1.4, Math.max(v, 0.0) / 0.5, 1.0);
  }

  // ------------------------------------------------------------------ choosing where to go
  _rehearse(rov, a, pitch, regions) {
    const F = Fish;
    let [x, y, z] = [this.x, this.y, this.depth];
    let yaw = this.yaw, pit = this.pitch, spd = this.speed;
    let [px, py, pz] = [rov.x, rov.y, rov.depth];
    const dt = 0.15;
    let gapMin = 99.0;
    for (let i = 0; i < 12; i++) {
      yaw += clamp(wrapPi(a - yaw), -F.TURN_FLEE * dt, F.TURN_FLEE * dt);
      pit += clamp(pitch - pit, -4.0 * dt, 4.0 * dt);
      spd += (F.BURST - spd) * Math.min(1.0, 6.0 * dt);
      x += spd * Math.cos(pit) * Math.cos(yaw) * dt;
      y += spd * Math.cos(pit) * Math.sin(yaw) * dt;
      z += spd * Math.sin(pit) * dt;
      [x, y] = nearestIn(regions, x, y, F.MARGIN);
      z = clamp(z, F.MARGIN, Math.max(F.MARGIN, this._floorHere(x, y, regions) - F.MARGIN));
      const dx = x - px, dy = y - py, dz = z - pz;
      const dh = Math.hypot(dx, dy);
      if (dh > 1e-6) { px += dx / dh * F.ROV_SPEED * dt; py += dy / dh * F.ROV_SPEED * dt; }
      pz += clamp(dz, -F.ROV_VSPEED * dt, F.ROV_VSPEED * dt);
      gapMin = Math.min(gapMin, Math.sqrt((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2) - 0.45);
    }
    const finalGap = Math.sqrt((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2) - 0.45;
    return [gapMin, finalGap, [x, y, z], this._clearance(regions, x, y, z)];
  }

  _enterFlee(rov, near) {
    this.mode = "flee";
    this.route = [];
    this._pickEscape(rov, near);
  }

  _pickEscape(rov, near) {
    const regions = this._openRegions(this.depth);
    const away = Math.hypot(this.x - near[0], this.y - near[1]) > 1e-6 ? Math.atan2(this.y - near[1], this.x - near[0]) : this.yaw;
    const wallWeight = this.pinned_t > 0.2 ? 1.2 : 0.6;
    let best = null;
    for (let k = 0; k < 16; k++) {
      const a = away + (k - 7.5) * 0.4;
      for (const pitch of [0.0, -0.9, 0.9]) {
        const [gapMin, finalGap, end, clear] = this._rehearse(rov, a, pitch, regions);
        const score = gapMin + 0.25 * finalGap + wallWeight * clear + 0.05 * this.rng.random();
        if (best === null || score > best[0]) best = [score, end];
      }
    }
    this.target = best[1];
    this.retarget = 0.4;
    this.pinned_t = 0.0;
  }

  _pickNext(rov) {
    this.cruise = this.rng.uniform(...Fish.CRUISE);
    const roll = this.rng.random();
    if (this.trusting && this.clock >= this.peek_ready && roll < 0.8 && this._startPeek(rov)) {
      // the ROV is sitting still: go and have a look at it
    } else if (roll < (this.trusting ? 0.12 : 0.2) && this._startRoute(rov)) {
      // thread a ring now and then
    } else {
      this.target = this._randomPoint(this.trusting ? null : rov);
    }
  }

  _startPeek(rov) {
    if (!this.peeks) return false;
    const local = this._choosePeekSpot(rov);
    if (local === null) return false;
    this.mode = "peek";
    this.peek_local = local;
    this.peek_until = this.clock + this.rng.uniform(...Fish.PEEK_FOR);
    this.peek_via = null;
    this.target = this._peekPoint(rov);
    return true;
  }

  _routeAround(rov, spot) {
    const [fx, fy, fz] = [this.x, this.y, this.depth];
    const [dx, dy, dz] = [spot[0] - fx, spot[1] - fy, spot[2] - fz];
    const L2 = dx * dx + dy * dy + dz * dz;
    if (L2 < 1e-6) return null;
    const t = clamp(((rov.x - fx) * dx + (rov.y - fy) * dy + (rov.depth - fz) * dz) / L2, 0.0, 1.0);
    const nearest = [fx + dx * t, fy + dy * t, fz + dz * t];
    if (dist3(nearest, [rov.x, rov.y, rov.depth]) > 1.0) return null;
    const [px, py] = [-dy, dx];
    const n = Math.hypot(px, py) || 1.0;
    let best = null;
    for (const side of [1, -1]) {
      const [wx, wy] = [rov.x + side * px / n * 1.5, rov.y + side * py / n * 1.5];
      const [qx, qy] = nearestIn(this._openRegions(fz), wx, wy, Fish.MARGIN);
      if (Math.abs(qx - wx) + Math.abs(qy - wy) > 1e-6) continue;
      const length = Math.hypot(fx - wx, fy - wy) + Math.hypot(wx - spot[0], wy - spot[1]);
      if (best === null || length < best[0]) best = [length, [wx, wy, clamp(0.5 * (fz + spot[2]), Fish.MARGIN, POOL_MAX_DEPTH - Fish.MARGIN)]];
    }
    return best ? best[1] : null;
  }

  _choosePeekSpot(rov) {
    const F = Fish, tilt = CAM_TILT;
    const wantGap = F.FLEE_AT_TRUST + 0.05;
    let best = null;
    for (const dist of [0.7, 0.8, 0.9, 1.0, 1.15, 1.3, 1.5, 1.8, 2.2]) {
      for (const dlat of [0.0, 0.12, -0.12, 0.25, -0.25]) {
        for (const dup of [0.0, 0.08, 0.16, 0.25, 0.35, 0.45]) {
          const local = [CAM_POS[0] + dist * Math.cos(tilt), dlat * dist, CAM_POS[2] - dist * Math.sin(tilt) + dup];
          const [x, y, up] = localToWorld(rov, ...local);
          const z = -up;
          if (!(F.SURFACE_MARGIN <= z && z <= this._floorHere(x, y, this._openRegions(z)) - F.MARGIN)) continue;
          const [qx, qy] = nearestIn(this._openRegions(z), x, y, F.MARGIN);
          if (Math.abs(qx - x) + Math.abs(qy - y) > 1e-6) continue;
          if (distanceToRov(rov, [x, y, up])[0] < wantGap) continue;
          const score = dist + 0.5 * Math.abs(dlat) + 0.5 * dup + 0.02 * this.rng.random();
          if (best === null || score < best[0]) best = [score, local];
        }
      }
      if (best !== null && dist >= 0.9) break;
    }
    return best ? best[1] : null;
  }

  _peekPoint(rov) {
    const F = Fish;
    const [x0, y0, up] = localToWorld(rov, ...this.peek_local);
    const z = clamp(-up + 0.03 * Math.sin(2.0 * this.clock), F.SURFACE_MARGIN, POOL_MAX_DEPTH - F.MARGIN);
    const [x, y] = nearestIn(this._openRegions(z), x0, y0, F.MARGIN);
    return [x, y, z];
  }

  _startRoute(rov) {
    const rings = rov.props.filter((p) => p.type === "ring" && !p.held && !p.hooked);
    if (!rings.length) return false;
    const ring = this.rng.choice(rings);
    const [nx, ny] = [-Math.sin(ring.yaw), Math.cos(ring.yaw)];
    const side = (this.x - ring.x) * nx + (this.y - ring.y) * ny >= 0 ? 1 : -1;
    const pts = [0.6, 0.0, -0.6].map((k) => [ring.x + side * nx * k, ring.y + side * ny * k, ring.depth]);
    const regions = this._openRegions(ring.depth);
    for (const [x, y] of pts) {
      const [qx, qy] = nearestIn(regions, x, y, Fish.MARGIN);
      if (Math.abs(qx - x) + Math.abs(qy - y) > 1e-6) return false;
    }
    this.mode = "route"; this.route = pts; this.route_ring = ring;
    this.route_center = [ring.x, ring.y, ring.depth];
    this.target = pts[0];
    return true;
  }

  _updateRoute() {
    const ring = this.route_ring, c = this.route_center;
    if (!this.route.length || ring.held || ring.hooked || dist3([ring.x, ring.y, ring.depth], c) > 0.25) {
      this.mode = "wander"; this.route = []; this.target = null;
      return;
    }
    this.target = this.route[0];
    if (dist3([this.x, this.y, this.depth], this.target) < 0.18) {
      this.route.shift();
      if (!this.route.length) { this.mode = "wander"; this.target = null; }
    }
  }

  // ------------------------------------------------------------------ per-step
  _closingSpeed(rov) {
    const c = Math.cos(rov.yaw), s = Math.sin(rov.yaw);
    const [vx, vy, vz] = [rov.u * c - rov.v * s, rov.u * s + rov.v * c, -rov.w];
    const [dx, dy, dz] = [this.x - rov.x, this.y - rov.y, -this.depth + rov.depth];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return d > 1e-6 ? Math.max(0.0, (vx * dx + vy * dy + vz * dz) / d) : 0.0;
  }

  _updateTrust(rov, dt) {
    const active = Math.hypot(rov.u, rov.v) > 0.1 || Math.abs(rov.r) > 0.1 || Math.abs(rov.w) > 0.35
      || Object.values(rov.cmd).some((v) => Math.abs(v) > 0.05);
    this.idle_t = active ? 0.0 : this.idle_t + dt;
    const was = this.trusting;
    this.trusting = this.idle_t > Fish.IDLE_AFTER;
    if (this.trusting && !was) this.curious_in = this.rng.uniform(...Fish.CURIOUS_DELAY);
    else if (!this.trusting) this.curious_in = null;
  }

  step(rov, dt) {
    const F = Fish;
    this.clock += dt;
    this._updateTrust(rov, dt);
    const [gap, near] = distanceToRov(rov, [this.x, this.y, -this.depth]);
    this.retarget -= dt;
    let [fleeAt, calmAt] = this.trusting ? [F.FLEE_AT_TRUST, F.CALM_AT_TRUST] : [F.FLEE_AT, F.CALM_AT];
    const closing = this._closingSpeed(rov);
    fleeAt += F.REACTION * closing;
    calmAt += F.REACTION * closing;
    if (gap < fleeAt) {
      if (this.mode !== "flee" || this.retarget <= 0 || this.pinned_t > 0.3) this._enterFlee(rov, near);
    } else if (this.mode === "flee" && gap > calmAt) {
      this.mode = "wander"; this.target = null;
    }

    if (this.curious_in !== null) {
      this.curious_in -= dt;
      if (this.curious_in <= 0) {
        this.curious_in = null;
        if (this.mode === "wander" && this.clock >= this.peek_ready) this._startPeek(rov);
      }
    }
    if (this.mode === "peek") {
      if (!this.trusting || this.clock > this.peek_until) {
        this.mode = "wander"; this.target = null;
        this.peek_ready = this.clock + this.rng.uniform(...F.PEEK_COOLDOWN);
      } else {
        const spot = this._peekPoint(rov);
        if (this.peek_via === null && dist3([this.x, this.y, this.depth], spot) > 1.2) this.peek_via = this._routeAround(rov, spot);
        if (this.peek_via !== null && dist3([this.x, this.y, this.depth], this.peek_via) < 0.35) this.peek_via = null;
        this.target = this.peek_via !== null ? this.peek_via : spot;
      }
    } else if (this.mode === "route") {
      this._updateRoute();
    }
    if (this.mode === "wander" && this.target === null) this._pickNext(rov);
    this.dm = this.mode === "route" ? F.RING_MARGIN : F.MARGIN;

    const [tx, ty, td] = this.target;
    const [dx, dy, dd] = [tx - this.x, ty - this.y, td - this.depth];
    const hdist = Math.hypot(dx, dy);
    if (this.mode === "wander" && hdist < 0.25 && Math.abs(dd) < 0.25) this.target = null;
    const flee = this.mode === "flee";
    const turn = flee ? F.TURN_FLEE : F.TURN_CRUISE;
    const d3 = dist3([this.x, this.y, this.depth], [tx, ty, td]);
    let wantYaw, want;
    if (this.mode === "peek" && this.peek_via === null && d3 < 0.12) {
      const [cx, cy] = localToWorld(rov, ...CAM_POS);
      wantYaw = Math.atan2(cy - this.y, cx - this.x);
      want = 0.0;
    } else {
      wantYaw = hdist > 0.05 ? Math.atan2(dy, dx) : this.yaw;
      if (flee) want = F.BURST;
      else if (this.mode === "route") want = dist3([this.x, this.y, this.depth], this.route_center) < 0.4 ? 0.2 : 0.3;
      else if (this.mode === "peek") want = F.PEEK_SPEED * clamp(d3 / 1.0, 0.12, 1.0);
      else want = this.cruise * clamp(hdist / 0.5, 0.4, 1.0);
    }
    this.yaw = wrapPi(this.yaw + clamp(wrapPi(wantYaw - this.yaw), -turn * dt, turn * dt));
    this.speed += (want - this.speed) * Math.min(1.0, (flee ? 6.0 : 3.0) * dt);
    const lim = flee ? F.PITCH_FLEE : F.PITCH_CRUISE;
    const wantPitch = clamp(Math.atan2(dd, Math.max(hdist, 0.2)), -lim, lim);
    const pr = (flee ? 4.0 : 1.5) * dt;
    this.pitch += clamp(wantPitch - this.pitch, -pr, pr);

    const hv = this.speed * Math.cos(this.pitch);
    this.x += hv * Math.cos(this.yaw) * dt;
    this.y += hv * Math.sin(this.yaw) * dt;
    this.depth += this.speed * Math.sin(this.pitch) * dt;
    if (typeof rov._flowAt === "function") {                // the water itself may be moving: a stream shoves the fish a bit
      const [wx, wy, wd] = rov._flowAt(this.x, this.y, this.depth);
      this.x += wx * F.FLOW_PUSH * dt; this.y += wy * F.FLOW_PUSH * dt; this.depth += wd * F.FLOW_PUSH * dt;
    }
    const bumped = this._keepInWater();
    this.pinned_t = bumped && flee ? this.pinned_t + dt : 0.0;
    if (bumped && this.mode === "wander") this.target = null;

    this._keepClear(rov);
    this.gap = distanceToRov(rov, [this.x, this.y, -this.depth])[0];
  }

  _keepInWater() {
    const F = Fish;
    const [x, y] = nearestIn(this._openRegions(this.depth), this.x, this.y, this.mode !== "route" ? F.MARGIN : 0.1);
    const moved = Math.abs(x - this.x) + Math.abs(y - this.y) > 1e-6;
    this.x = x; this.y = y;
    const top = this.mode === "peek" ? F.SURFACE_MARGIN : F.MARGIN;
    this.depth = clamp(this.depth, top, Math.max(top, this._floorHere(x, y) - this.dm));
    return moved;
  }

  _keepClear(rov) {
    const F = Fish;
    const [gap, near] = distanceToRov(rov, [this.x, this.y, -this.depth]);
    if (gap >= F.SAFE_HARD) return;
    let p = [this.x - near[0], this.y - near[1], -this.depth - near[2]];
    let n = Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2);
    if (n < 1e-6) { p = [Math.cos(this.yaw), Math.sin(this.yaw), 0.0]; n = 1.0; }
    const out = F.SAFE_HARD + 0.03;
    this.x = near[0] + p[0] / n * out;
    this.y = near[1] + p[1] / n * out;
    this.depth = clamp(-(near[2] + p[2] / n * out), 0.0, POOL_MAX_DEPTH);
    this._keepInWater();
    const [gap2] = distanceToRov(rov, [this.x, this.y, -this.depth]);
    if (gap2 < F.SAFE_HARD - 0.02) {                       // cornered: dart to the free spot farthest from the ROV
      let best = null;
      for (let i = 0; i < 40; i++) {
        const [x, y, d] = this._randomPoint();
        const [g] = distanceToRov(rov, [x, y, -d]);
        if (best === null || g > best[0]) best = [g, x, y, d];
      }
      [, this.x, this.y, this.depth] = best;
      this.yaw = Math.atan2(this.y - rov.y, this.x - rov.x);
      this.darts += 1;
    }
    this._enterFlee(rov, near);
  }

  state() {
    return { type: "fish", x: this.x, y: this.y, depth: this.depth, yaw: this.yaw, pitch: this.pitch, speed: this.speed,
      flee: this.mode === "flee", mode: this.mode, color: this.color };
  }
}

export const FISH_COLORS = [0xff7a2a, 0xffb703, 0xf2efe6];

/** Put n fish (0 to 3) in the pool. */
export function addTo(rov, n = 1) {
  for (let i = 0; i < Math.max(0, Math.min(Math.trunc(n), 3)); i++) rov.props.push(new Fish(11 + 7 * i, FISH_COLORS[i % FISH_COLORS.length]));
}
