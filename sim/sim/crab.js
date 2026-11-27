// crab.js — port of ../../rov_crab.py: a small European green crab crawling about on the floor of the shallow end.
// OPTIONAL add-on (the page draws it with ../crab.js). To remove it: delete this file, pushable.js stays harmless, and the addTo() call in backend-local.js.
// It is a Pushable (pushable.js): that file does the pushing and keeps it on the floor inside the shallow end; this file only decides where it walks.
//   pause: sits still a few seconds   walk: crawls SIDEWAYS to a spot on the shelf   scuttle: hurries straight away when the ROV is within SCARE_AT
// (and is still about five times slower than the ROV). The JS crab uses its own random numbers, so it walks different paths from the Python one.
import { clamp } from "./physics.js";
import { distanceToRov } from "./shape.js";
import { Pushable } from "./pushable.js";
import { Rng } from "./rng.js";

const wrapPi = (a) => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;   // Python's % is never negative

export class Crab extends Pushable {
  static RADIUS = 0.05;                              // about 10 cm wide counting the legs
  static WALK = [0.03, 0.07];                        // m/s, an unhurried crawl
  static SCUTTLE = 0.16;                             // m/s when frightened
  static SCARE_AT = 0.45; static CALM_AT = 0.8;      // metres from the ROV's surface
  static PAUSE = [1.0, 5.0];                         // seconds it sits still between walks
  static ARRIVE = 0.04;                              // m: close enough to the spot to stop

  constructor(seed = 1, color = 0x3f8f3a) {
    super(0.0, 0.0);
    this.type = "crab";
    this.seed = seed;
    this.color = color;
    this.reset();
  }

  reset() {
    this.rng = new Rng(this.seed ?? 1);
    const r = this.home(), m = Pushable.MARGIN + 0.1;
    this.start = [this.rng.uniform(r[0] + m, r[1] - m), this.rng.uniform(r[2] + m, r[3] - m), this.rng.uniform(-Math.PI, Math.PI)];
    super.reset();
    this.mode = "pause";
    this.timer = this.rng.uniform(0.2, 2.0);
    this.target = null;
    this.side = 1;                                   // which way it walks sideways: +1 or -1
    this.walk_speed = 0.05;
    this.speed = 0.0;
    this.gap = 99.0;                                 // distance to the ROV's surface, as of the last step
  }

  _pickTarget() {
    const r = this.home(), m = Pushable.MARGIN + 0.05;
    for (let i = 0; i < 8; i++) {                    // a spot 0.25 to 0.9 m away, if there is one
      const ang = this.rng.uniform(-Math.PI, Math.PI), dist = this.rng.uniform(0.25, 0.9);
      const tx = this.x + Math.cos(ang) * dist, ty = this.y + Math.sin(ang) * dist;
      if (r[0] + m <= tx && tx <= r[1] - m && r[2] + m <= ty && ty <= r[3] - m) return [tx, ty];
    }
    return [this.rng.uniform(r[0] + m, r[1] - m), this.rng.uniform(r[2] + m, r[3] - m)];
  }

  /** Turn the body so that moving along `heading` is sideways: the claws point a quarter turn away from the way it goes. */
  _face(heading, dt, rate = 4.0) {
    const want = heading - this.side * Math.PI / 2;
    this.yaw = wrapPi(this.yaw + clamp(wrapPi(want - this.yaw), -rate * dt, rate * dt));
  }

  think(rov, dt) {
    const C = Crab, floor = this.floor;
    const [gap, near] = distanceToRov(rov, [this.x, this.y, -floor + 0.02]);
    this.gap = gap;
    if (gap < C.SCARE_AT) this.mode = "scuttle";
    else if (this.mode === "scuttle" && gap > C.CALM_AT) { this.mode = "pause"; this.timer = this.rng.uniform(...C.PAUSE); }

    if (this.mode === "scuttle") {
      const away = Math.hypot(this.x - near[0], this.y - near[1]) > 1e-6 ? Math.atan2(this.y - near[1], this.x - near[0]) : rov.yaw;
      this._face(away, dt, 8.0);
      this.speed = C.SCUTTLE;
      return [Math.cos(away) * this.speed, Math.sin(away) * this.speed];
    }
    if (this.mode === "pause") {
      this.speed = 0.0;
      this.timer -= dt;
      if (this.timer <= 0) {
        this.mode = "walk"; this.target = this._pickTarget();
        this.side = this.rng.choice([-1, 1]);
        this.walk_speed = this.rng.uniform(...C.WALK);
      }
      return [0.0, 0.0];
    }
    const dx = this.target[0] - this.x, dy = this.target[1] - this.y;      // walk
    const dist = Math.hypot(dx, dy);
    if (dist < C.ARRIVE) { this.mode = "pause"; this.timer = this.rng.uniform(...C.PAUSE); this.speed = 0.0; return [0.0, 0.0]; }
    const heading = Math.atan2(dy, dx);
    this._face(heading, dt);
    this.speed = this.walk_speed * clamp(dist / 0.15, 0.3, 1.0);
    return [Math.cos(heading) * this.speed, Math.sin(heading) * this.speed];
  }

  state() { return { ...super.state(), speed: this.speed, mode: this.mode, moving: this.speed > 0.005, color: this.color }; }
}

/** Put n crabs (0 to 5) on the shallow end's floor. */
export function addTo(rov, n = 1) {
  for (let i = 0; i < Math.max(0, Math.min(Math.trunc(n), 5)); i++) rov.props.push(new Crab(21 + 5 * i));
}
