// carry.js — the carry engine for mission props: things the ROV can pick up with its NOSE (hooked, then hanging from it) or its CLAW (held in the jaws),
// carry, put down, and hand to the crew on the deck. No DOM, no three.js. Game-style physics like rings.js: tests of points and distances, no solver.
//
// A Carryable stands on the pool floor (pushed by the ROV like a crab, see sim/pushable.js) or sinks until it does. It has CATCH POINTS on its vertical axis
// (a rope loop, a screw hook, the lattice of a ball ...): `{ id, up, r, kind }`, `up` metres above its base, `r` how close the tool must get.
//   NOSE   the nose tip stays within `r` of a catch point for CATCH_DWELL seconds: it is hooked and HANGS from the tip (straight down, whatever the ROV does).
//          Lowered onto something (the floor, a step) it rests there and is DRAGGED along by the nose; reversing (backing the nose away) slides it off. So "put it down" = lower and back out.
//   CLAW   a catch point between the open jaws and the claw commanded closed: held rigidly in front of the ROV until the claw is opened.
// Hand-over: the crew can take an item from the ROV (`toDeck`) and give it back (`giveTo`): see scout2026.js for the keys. Held items add no force to the ROV (under 5 N).
import { POOL_MAX_DEPTH, POOL_REGIONS, floorAt } from "../../sim/physics.js";
import { JAW_HALF, JAW_SWING, JAW_X0, JAW_Y0, JAW_Z, NOSE_PTS } from "../../sim/shape.js";
import { Pushable } from "../../sim/pushable.js";

export const NOSE_TIP = NOSE_PTS[NOSE_PTS.length - 1];            // [ahead, up] of the nose's tip from the ROV's middle
export const JAW_X1 = 0.60;                                       // the jaws' reach (same as the rings')
export const CLAMP_COMMAND = 0.25;                                // a claw command at or below this means "squeeze"
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lerp = (a, b, k) => a + (b - a) * k;

/** World [x, y, z (up, 0 = the surface)] of a point fixed to the ROV: `fx` ahead, `up` above its middle (pitch allowed for, roll ignored like the rings). */
export function rovPoint(rov, fx, up, ly = 0.0) {
  const c = Math.cos(rov.yaw), s = Math.sin(rov.yaw), cp = Math.cos(rov.pitch), sp = Math.sin(rov.pitch);
  const fx2 = fx * cp + up * sp, up2 = -fx * sp + up * cp;
  return [rov.x + c * fx2 - s * ly, rov.y + s * fx2 + c * ly, -rov.depth + up2];
}
export const noseTip = (rov) => rovPoint(rov, NOSE_TIP[0], NOSE_TIP[1]);

/** Is a world point (radius `r`) inside the space between the claw's jaws? */
export function inJaws(rov, p, r = 0.02) {
  const c = Math.cos(rov.yaw), s = Math.sin(rov.yaw), cp = Math.cos(rov.pitch), sp = Math.sin(rov.pitch);
  const dx = p[0] - rov.x, dy = p[1] - rov.y, fwd = c * dx + s * dy, left = -s * dx + c * dy, up = p[2] + rov.depth;
  const fx = fwd * cp - up * sp, fz = fwd * sp + up * cp;
  if (!(JAW_X0 <= fx && fx <= JAW_X1) || Math.abs(fz - JAW_Z) > 0.035) return false;
  const opening = JAW_Y0 + (fx - JAW_X0) * Math.sin(JAW_SWING * rov.claw) - JAW_HALF;
  return Math.abs(left) + r <= opening + 1e-9;
}

export class Carryable extends Pushable {
  static RADIUS = 0.06; static BODY_LOW = 0.005; static BODY_HIGH = 0.12;     // footprint and height, for being pushed along the floor
  static SINK = 0.15;                                                          // m/s: how fast it sinks once nothing holds it up
  static CATCH_DWELL = 0.2;                                                    // s the nose tip must stay in a catch point to hook it
  static RELEASE = 0.14;                                                       // m the nose tip may drift from where the item rests before it slides off
  static COOLDOWN = 1.0;                                                       // s after being let go before it can be hooked again (or it would jump straight back on)
  static SUPPORT_SNAP = 0.01;                                                  // m: within this of the floor it counts as resting on it

  /** id: unique name ("star1"); kind: what the page draws; catches: [{ id, up, r, kind }]; (x, y): where it starts on the floor (mode "floor"), or null to start on the deck. */
  constructor(id, kind, x, y, catches = [], yaw = 0.0) {
    super(x ?? 0, y ?? 0, yaw);
    this.type = "m_item";
    this.id = id; this.kind = kind; this.catches = catches;
    this.home_pose = x === null || x === undefined ? null : [x, y, yaw];       // null: it starts on the deck (in the crew's inventory)
    this.reset();
  }

  /** The rectangle it stands in: the region of the pool under it (the stairs count), or the nearest. */
  home() {
    return this._region();
  }
  _region() {
    const R = this._regions();
    const hit = R.filter((r) => r[0] - 1e-9 <= this.x && this.x <= r[1] + 1e-9 && r[2] - 1e-9 <= this.y && this.y <= r[3] + 1e-9);
    if (hit.length) return hit.reduce((a, b) => (b[4] > a[4] ? b : a));
    return R.reduce((a, b) => (distTo(b, this.x, this.y) < distTo(a, this.x, this.y) ? b : a));
  }
  _regions() { return Carryable.regions(); }                                   // (set by the mission: the pool's regions, see scout2026.js)

  reset() {
    this.mode = this.home_pose ? "floor" : "deck";                             // floor | sink | held | deck
    if (this.home_pose) [this.x, this.y, this.yaw] = this.home_pose;
    this.pvx = this.pvy = this.pw = 0.0;
    this.pushed = false;
    this.held = null;                                                          // null | "nose" | "claw"
    this.supported = false;
    this.dwell = 0.0; this.prev_claw = 0.0; this.cooldown = 0.0; this.need_clear = false; this.support_t = 0.0;
    this.rel = [0, 0, 0, 0]; this.hang_yaw = 0.0;
    this.rested_at = [this.x, this.y];
    this.depth = this.home_pose ? this._floor_here() : 0.0;                    // the depth of its BASE (on the floor: the floor's depth)
    this.stuck_to = null;                                                      // stuck (Velcro) to something that holds it for good, e.g. "icebergA"
    this.slot = this.start_slot ?? null;                                       // where it sits on the deck: [x, y], set by the mission (deck-start props begin there)
    if (!this.home_pose && this.slot) [this.x, this.y] = this.slot;
  }

  _floor_here() { return this.rest_depth(this.x, this.y); }
  /** The depth of the base when it rests at (x, y): the pool floor, or a table / platform the prop stands on (a subclass can override this). */
  rest_depth(x, y) { return floorAt(x, y) ?? POOL_MAX_DEPTH; }
  /** World [x, y, z up] of one of its catch points. */
  catchWorld(c) { return [this.x, this.y, -this.depth + c.up]; }
  get inPool() { return this.mode !== "deck"; }

  // ------------------------------------------------------------------ per step
  step(rov, dt) {
    if (this.mode === "deck" || this.mode === "stuck") return;
    if (this.held) { this._follow(rov, dt); return; }
    this._catch(rov, dt);
    if (this.held) return;
    const f = this._floor_here();
    if (this.depth < f - Carryable.SUPPORT_SNAP) {                            // in the water: sinks
      this.mode = "sink";
      this.depth = Math.min(f, this.depth + this.constructor.SINK * dt);
      this.pvx = this.pvy = 0.0;
    } else {                                                                  // on the floor (or a step): can be pushed
      this.mode = "floor"; this.depth = f;
      super.step(rov, dt);
      this.depth = this._floor_here();
    }
  }

  /** The nose threading a loop must not shove the item away: no pushing while the nose tip is right at one of its catch points. */
  _collide(rov, dt) {
    if (rov.tool === "nose" && this.catches.some((c) => c.kind !== "claw" && dist3(noseTip(rov), this.catchWorld(c)) < c.r * 1.3)) return;
    if (rov.tool === "claw" && this.catches.some((c) => c.kind !== "nose" && inJaws(rov, this.catchWorld(c), 0.0))) return;       // ... nor the claw while a catch point is between its jaws
    super._collide(rov, dt);
  }

  _catch(rov, dt) {
    const C = Carryable;
    if (this.cooldown > 0) { this.cooldown -= dt; this.dwell = 0.0; this.prev_claw = rov.claw; return; }
    if (this.need_clear && rov.tool === "nose") {                                // let go of: it cannot be hooked again until the nose has left its catch points
      const tip = noseTip(rov);
      if (this.catches.every((c) => dist3(tip, this.catchWorld(c)) > c.r * 1.6)) this.need_clear = false;
      else { this.dwell = 0.0; this.prev_claw = rov.claw; return; }
    }
    if (rov.mission_carry) { this.dwell = 0.0; this.prev_claw = rov.claw; return; }                // the ROV has its hands full
    if (rov.tool === "nose") {
      const tip = noseTip(rov);
      const near = this.catches.some((c) => c.kind !== "claw" && dist3(tip, this.catchWorld(c)) <= c.r);
      this.dwell = near ? this.dwell + dt : 0.0;
      if (this.dwell >= C.CATCH_DWELL) this._hook(rov, "nose", this.catches.find((c) => c.kind !== "claw" && dist3(tip, this.catchWorld(c)) <= c.r * 1.5) ?? this.catches[0]);
    } else if (rov.tool === "claw" && rov.claw_holder === null) {
      const closing = rov.claw_target <= C.CLAMP && rov.claw < this.prev_claw - 1e-4;
      const c = this.catches.find((k) => k.kind !== "nose" && inJaws(rov, this.catchWorld(k), Math.min(k.r, 0.03)));
      if (c && closing) this._hook(rov, "claw", c);
    }
    this.prev_claw = rov.claw;
  }
  static get CLAMP() { return CLAMP_COMMAND; }

  _hook(rov, how, c) {
    this.held = how; this.mode = "held"; this.dwell = 0.0;
    this.supported = false; this.catch_up = c.up;
    rov.mission_carry = this;
    if (how === "claw") {
      rov.claw_holder = this;
      const p = this.catchWorld(c), cs = Math.cos(rov.yaw), sn = Math.sin(rov.yaw), dx = p[0] - rov.x, dy = p[1] - rov.y;
      this.rel = [cs * dx + sn * dy, -sn * dx + cs * dy, p[2] + rov.depth, this.yaw - rov.yaw];
    } else this.hang_yaw = this.yaw - rov.yaw;
  }

  /** Let go (the nose slid off, the claw opened, the crew took it): it sinks from where it is. */
  release(rov) {
    if (this.held === "claw" && rov.claw_holder === this) rov.claw_holder = null;
    if (rov.mission_carry === this) rov.mission_carry = null;
    this.held = null; this.mode = this.stuck_to ? "stuck" : "sink"; this.supported = false; this.cooldown = Carryable.COOLDOWN; this.need_clear = true;
    this.rested_at = [this.x, this.y];
    this.pvx = this.pvy = this.pw = 0.0;
  }

  _follow(rov, dt) {
    const up = this.catch_up ?? 0.0;
    if (this.held === "claw") {
      if (rov.claw_target > CLAMP_COMMAND) { this.release(rov); return; }
      const [rx, ry, rz, ryaw] = this.rel, c = Math.cos(rov.yaw), s = Math.sin(rov.yaw);
      this.x = rov.x + c * rx - s * ry; this.y = rov.y + s * rx + c * ry;
      this.depth = -(-rov.depth + rz - up);                                    // base depth below the catch point
      this.yaw = rov.yaw + ryaw;
      return;
    }
    const tip = noseTip(rov), floor = this._floor_here();
    const want = -(tip[2] - up);                                                // the base's depth if it just hangs from the tip
    if (this.stuck_to) {                                                        // stuck to something: it stays; the nose slides off when it backs away
      if (dist3(tip, [this.x, this.y, -this.depth + up]) > Carryable.RELEASE) this.release(rov);
      return;
    }
    if (this.supported) {                                                       // resting on the floor or a step
      const k = 1 - Math.exp(-dt * 14);
      this.support_t += dt;
      if (want < this.depth - Carryable.SUPPORT_SNAP) this.supported = false;  // the nose rises: it is lifted again
      else {
        const fx = Math.cos(rov.yaw), fy = Math.sin(rov.yaw), behind = -((tip[0] - this.x) * fx + (tip[1] - this.y) * fy);       // how far the tip is BEHIND the item
        if (behind > Carryable.RELEASE || (rov.u < -0.06 && this.support_t > 0.4)) { this.release(rov); return; }       // the nose backs away: it slides off
        this.x = lerp(this.x, tip[0], k); this.y = lerp(this.y, tip[1], k);   // otherwise it is dragged along by the nose
        const f2 = this.rest_depth(this.x, this.y);
        if (want < f2 - Carryable.SUPPORT_SNAP) this.supported = false; else this.depth = f2;
        return;
      }
    }
    const k = 1 - Math.exp(-dt * 14);                                           // (it follows a little behind the tip, so it does not jump when hooked)
    this.x = lerp(this.x, tip[0], k); this.y = lerp(this.y, tip[1], k);
    const f = this.rest_depth(this.x, this.y);
    if (want >= f) { this.x = tip[0]; this.y = tip[1]; this.depth = this.rest_depth(this.x, this.y); this.supported = true; this.support_t = 0.0; this.rested_at = [this.x, this.y]; }       // (set down right under the tip)
    else this.depth = lerp(this.depth, want, k);
    this.yaw = lerp(this.yaw, rov.yaw + this.hang_yaw, k);
  }

  /** The crew takes it off the ROV and sets it on the deck at `slot` ([x, y]). */
  toDeck(rov, slot) {
    this.release(rov);
    this.mode = "deck"; this.slot = slot; [this.x, this.y] = slot; this.depth = 0.0; this.held = null;
  }
  /** The crew hangs it on the ROV's nose (or puts it in the open claw): it starts at the ROV's tool. Returns false when the tool cannot take it. */
  giveTo(rov) {
    if (rov.mission_carry) return false;
    const how = rov.tool === "claw" ? "claw" : "nose";
    const c = this.catches.find((k) => (how === "claw" ? k.kind !== "nose" : k.kind !== "claw"));
    if (!c) return false;
    if (how === "claw" && (rov.claw_holder !== null || rov.claw_target <= CLAMP_COMMAND)) return false;     // the claw has to be open (and free)
    this.mode = "held"; this.depth = 0.0;
    const tip = how === "nose" ? noseTip(rov) : rovPoint(rov, (JAW_X0 + 0.14), JAW_Z);
    [this.x, this.y] = [tip[0], tip[1]]; this.depth = -(tip[2] - c.up); this.yaw = rov.yaw;
    this._hook(rov, how, c);
    this.slot = null;
    return true;
  }

  state() {
    return { type: this.type, id: this.id, kind: this.kind, x: this.x, y: this.y, depth: this.depth, yaw: this.yaw, mode: this.mode, held: this.held,
      r: this.constructor.RADIUS, h: this.constructor.BODY_HIGH, catches: this.catches.map((c) => ({ id: c.id, up: c.up, kind: c.kind })) };
  }
}
const distTo = (r, x, y) => Math.hypot(Math.max(r[0] - x, 0, x - r[1]), Math.max(r[2] - y, 0, y - r[3]));
/** The regions an item may stand in: the whole pool incl. the stairs (the same array object setPool edits in place). */
Carryable.regions = () => POOL_REGIONS;
