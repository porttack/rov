// pot.js — the whale-safe lobster pot (task 2.3): a milk crate with a weight in it, a 3" pipe holder with a buoy in it, and a release mechanism on the outside: a vertical shaft
// that turns in a tee (held by Velcro friction), carrying a 30 cm red HANDLE out of the crate and, on the other side, a plate that covers the buoy. Pushing the handle sideways
// turns the shaft; the plate swings clear and the positively buoyant buoy rises on its rope to the surface.
//   handle  a horizontal rod pivoting about the shaft. Any ROV part pushing it moves it (it stays where it is put: friction). Turned 60 degrees or more, the plate is clear.
//   buoy    in the holder until the plate is clear, then rises at BUOY_RISE m/s (the rope is long enough for the pool) and floats at the surface.
import { POOL_WATER, floorAt } from "../../sim/physics.js";
import { capsules, segSeg } from "../../sim/shape.js";
import { at, SPOTS } from "./layout.js";

export class LobsterPot {
  static HALF = 0.165; static HEIGHT = 0.28;                              // the crate: about 33 x 33 x 28 cm
  static HANDLE = 0.30; static HANDLE_R = 0.012; static HANDLE_UP = 0.22; // the red handle's length, thickness and height above the floor
  static OPEN_ANGLE = 1.05;                                               // rad (60 degrees) of turning that clears the plate
  static HOLDER_TOP = 0.10;                                               // the buoy sits in a 10 cm holder
  static BUOY_LEN = 0.15; static BUOY_RISE = 0.35;
  constructor(spot = SPOTS.pot) {
    this.type = "m_pot";
    this.spot = spot;
    this.reset();
  }
  reset() {
    const [cx, cy] = at(...this.spot);
    this.cx = cx; this.cy = cy;
    this.pivot = [cx, cy + LobsterPot.HALF + 0.04];                       // the shaft is just outside the crate wall on the side facing the middle of the pool
    this.theta0 = Math.PI / 2; this.theta = this.theta0;                  // the handle points out from the crate (+y)
    this.open = false;
    this.floor = floorAt(cx, cy) ?? 3;
    this.buoy_depth = this.floor - LobsterPot.HOLDER_TOP;                 // the buoy's middle, in its holder
    this.state_name = "holder";                                           // holder | rising | surface
  }
  /** The handle as a segment in world coordinates [x, y, z up]. */
  handle() {
    const z = -this.floor + LobsterPot.HANDLE_UP, [px, py] = this.pivot;
    return [[px, py, z], [px + LobsterPot.HANDLE * Math.cos(this.theta), py + LobsterPot.HANDLE * Math.sin(this.theta), z]];
  }
  turned() { return Math.abs(this.theta - this.theta0); }

  step(rov, dt) {
    this.floor = floorAt(this.cx, this.cy) ?? this.floor;
    // ---- the ROV pushes the handle round
    const [a, b] = this.handle(), L = LobsterPot.HANDLE;
    for (const [ca, cb, r] of capsules(rov)) {
      if (Math.min(ca[2], cb[2]) - r > a[2] + 0.1 || Math.max(ca[2], cb[2]) + r < a[2] - 0.1) continue;           // not at the handle's height
      if (Math.hypot((ca[0] + cb[0]) / 2 - this.pivot[0], (ca[1] + cb[1]) / 2 - this.pivot[1]) > 1.0) continue;   // nowhere near
      const [c1, c2, d] = segSeg(a, b, ca, cb);
      const pen = r + LobsterPot.HANDLE_R - d;
      if (pen <= 1e-4) continue;
      const nx = c1[0] - c2[0], ny = c1[1] - c2[1], h = Math.hypot(nx, ny);
      if (h < 1e-6) continue;
      const tx = -Math.sin(this.theta), ty = Math.cos(this.theta);                                                 // the direction the handle's tip moves when it turns
      const arm = Math.max(0.05, Math.hypot(c1[0] - this.pivot[0], c1[1] - this.pivot[1]));
      this.theta += Math.max(-0.12, Math.min(0.12, (pen * (nx / h * tx + ny / h * ty)) / arm));
    }
    if (!this.open && this.turned() >= LobsterPot.OPEN_ANGLE) this.open = true;                                    // the plate swings clear
    // ---- the buoy
    if (this.open && this.state_name === "holder") this.state_name = "rising";
    if (this.state_name === "rising") {
      this.buoy_depth -= LobsterPot.BUOY_RISE * dt;
      if (this.buoy_depth <= LobsterPot.BUOY_LEN / 2) { this.buoy_depth = LobsterPot.BUOY_LEN / 2; this.state_name = "surface"; }
    }
  }
  /** The buoy has left its holder (it is clear of the 10 cm pipe). */
  get released() { return this.state_name !== "holder" && this.buoy_depth < this.floor - LobsterPot.HOLDER_TOP - 0.1; }
  get surfaced() { return this.state_name === "surface"; }
  state() {
    return { type: this.type, x: this.cx, y: this.cy, half: LobsterPot.HALF, height: LobsterPot.HEIGHT, floor: this.floor, pivot: this.pivot, theta: this.theta, handle: LobsterPot.HANDLE,
      open: this.open, buoy: { depth: this.buoy_depth, len: LobsterPot.BUOY_LEN, state: this.state_name }, holder: LobsterPot.HOLDER_TOP };
  }
}
