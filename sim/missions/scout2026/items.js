// items.js — the competition props the ROV can carry, and the ones it flies over. Sizes from the 2026 prop building instructions (metres):
//   basket star : a 1/2" PVC "H" (10 cm crossbar, four 5 cm stubs) with an O-ball (about 10 cm across) cable-tied on top          -> carry it by the ball (nose) or the H (claw)
//   coral       : a 1/2" tee with 30 cm pipe cleaners (trunk and branches), about 25-30 cm tall                                    -> carry it by the branches
//   crab        : a 1 1/2" end cap (5 cm) with 30 cm pipe-cleaner legs and claws, about 30 cm across                                -> carry it by the legs (nose) or the cap (claw)
// More (crab, markers, sensors, connectors ...) are added phase by phase. Every one is worth points only when it is on the deck (`scoreId`).
import { Carryable } from "../common/carry.js";
import { ASSIST, at, frame, SPOTS } from "./layout.js";
const A = (r) => r * ASSIST;
import { floorAt } from "../../sim/physics.js";

export class BasketStar extends Carryable {
  static RADIUS = 0.075; static BODY_HIGH = 0.05;
  constructor(id, label, scoreId, u, v, yaw = 0) {
    const [x, y] = at(u, v);
    super(id, "basket_star", x, y, [{ id: "ball", up: 0.08, r: A(0.08), kind: "lattice" }, { id: "h", up: 0.015, r: A(0.05), kind: "claw" }], yaw);
    this.label = label; this.scoreId = scoreId;
  }
}
export class Coral extends Carryable {
  static RADIUS = 0.05; static BODY_HIGH = 0.10;
  constructor(id, label, scoreId, u, v, yaw = 0) {
    const [x, y] = at(u, v);
    super(id, "coral", x, y, [{ id: "branches", up: 0.18, r: A(0.11), kind: "branch" }, { id: "tee", up: 0.03, r: A(0.04), kind: "claw" }], yaw);
    this.label = label; this.scoreId = scoreId;
  }
}

export class MissionCrab extends Carryable {
  static RADIUS = 0.07; static BODY_HIGH = 0.04;
  constructor(id, label, scoreId, u, v, yaw = 0) {
    const [x, y] = at(u, v);
    super(id, "crab", x, y, [{ id: "legs", up: 0.05, r: A(0.12), kind: "branch" }, { id: "cap", up: 0.02, r: A(0.04), kind: "claw" }], yaw);
    this.label = label; this.scoreId = scoreId;
  }
}

/** A survey marker: a 3" knockout cap (the Velcro loop patch) on a 10 cm pipe with a 20 cm rope loop. It starts on the deck. Carried by the rope (nose) or the pipe (claw);
 *  pressed against a survey point of the iceberg it sticks for good. */
export class Marker extends Carryable {
  static RADIUS = 0.05; static BODY_HIGH = 0.12; static CONTACT_UP = 0.015;
  constructor(id, label) {
    super(id, "marker", null, null, [{ id: "rope", up: 0.20, r: A(0.09), kind: "loop" }, { id: "pipe", up: 0.07, r: A(0.03), kind: "claw" }]);
    this.label = label;
  }
  /** World [x, y, z up] of the Velcro patch (the middle of the cap). */
  contact() { return [this.x, this.y, -this.depth + Marker.CONTACT_UP]; }
}

/** The iceberg: a 55 cm square of 1/2" PVC floating at the surface on a pole from the wall, two 25 cm legs at opposite corners; the lower ends of the legs carry Velcro hooks
 *  (the survey points, about 20 cm below the surface). */
export class Iceberg {
  static SIDE = 0.55; static LEG = 0.25; static POINT_DEPTH = 0.20; static REACH = 0.07 * ASSIST;       // REACH: how close a marker's Velcro must get to stick
  constructor(u, v) {
    this.type = "m_iceberg";
    this.u = u; this.v = v;
    this.points = ["A", "B"].map((n, k) => ({ id: "ice" + n, scoreId: k === 0 ? "marker1" : "marker2", marker: null }));
    this.reset();
  }
  /** The survey points in world coordinates [x, y, z up]. */
  spots() {
    const [cx, cy] = at(this.u, this.v), h = Iceberg.SIDE / 2;
    return [[cx + h, cy + h, -Iceberg.POINT_DEPTH], [cx - h, cy - h, -Iceberg.POINT_DEPTH]];
  }
  reset() { for (const p of this.points) p.marker = null; }
  /** A marker that is carried and touches a free survey point sticks to it. `markers`: the Marker items. */
  step(rov, dt, markers = []) {
    const spots = this.spots();
    for (const m of markers) {
      if (m.mode !== "held" || m.stuck_to) continue;
      const c = m.contact();
      this.points.forEach((p, k) => {
        if (p.marker || m.stuck_to) return;
        const d = Math.hypot(c[0] - spots[k][0], c[1] - spots[k][1], c[2] - spots[k][2]);
        if (d <= Iceberg.REACH) {                                           // Velcro on contact: the marker is stuck to the leg's hooks for good
          p.marker = m.id; m.stuck_to = p.id;
          m.x = spots[k][0]; m.y = spots[k][1]; m.depth = -(spots[k][2] - Marker.CONTACT_UP); m.supported = true;
        }
      });
    }
  }
  state() { return { type: this.type, x: at(this.u, this.v)[0], y: at(this.u, this.v)[1], side: Iceberg.SIDE, leg: Iceberg.LEG, points: this.spots().map((s, k) => ({ x: s[0], y: s[1], z: s[2], marker: this.points[k].marker })) }; }
}

/** The eDNA sensors: a 20 cm 2" pipe on an H base (20 x 20 cm) with four 1/2" caps on top and a rope loop. The OLD one starts in the yellow square (bring it to the deck);
 *  the NEW one starts on the deck (set it down upright inside the yellow square). */
export class Sensor extends Carryable {
  static RADIUS = 0.10; static BODY_HIGH = 0.20;
  constructor(id, label, kind, scoreId, spot) {
    super(id, kind, spot ? at(...spot)[0] : null, spot ? at(...spot)[1] : null, [{ id: "rope", up: 0.28, r: A(0.11), kind: "loop" }, { id: "pipe", up: 0.14, r: A(0.04), kind: "claw" }]);
    this.label = label; this.scoreId = scoreId;
  }
}
/** The eDNA sensor connector: a 1/2" PVC "T" (yellow crossbar 10 cm, white stem 20 cm). Hangs from its crossbar with the stem down; the stem's tip is its base. It starts on the deck;
 *  inserted into the observatory's 3" port it stays. Its 2 m cable runs to the new sensor. */
export class Connector extends Carryable {
  static RADIUS = 0.04; static BODY_HIGH = 0.10;
  constructor(id, label) {
    super(id, "connector", null, null, [{ id: "handle", up: 0.21, r: A(0.08), kind: "loop" }, { id: "stem", up: 0.10, r: A(0.03), kind: "claw" }]);
    this.label = label;
  }
}
/** The yellow 0.50 m square the new sensor must stand in. */
export class EdnaSquare {
  static HALF = 0.25;
  constructor(spot) { this.type = "m_zone"; this.spot = spot; }
  centre() { return at(...this.spot); }
  /** Is a 20 x 20 cm base centred at (x, y) completely inside the square? */
  holds(x, y, half = 0.10) { const [cx, cy] = this.centre(); return Math.abs(x - cx) <= EdnaSquare.HALF - half + 0.01 * ASSIST * 3 && Math.abs(y - cy) <= EdnaSquare.HALF - half + 0.01 * ASSIST * 3; }
  reset() {} step() {}
  state() { const [x, y] = this.centre(); return { type: this.type, x, y, half: EdnaSquare.HALF }; }
}
/** The Holyrood observatory: a 1/2" ladder frame (30 x 20 cm) with a 20 cm vertical 3" pipe (the connection port, about 7.8 cm inside, black with an orange band). */
export class Observatory {
  static PORT_RADIUS = 0.035 * ASSIST; static PORT_HEIGHT = 0.20; static DEPTH = 0.12;       // the stem must be this deep in the port (its tip within DEPTH of the floor)
  constructor(spot) { this.type = "m_observatory"; this.spot = spot; this.connector = null; }
  port() { return at(...this.spot); }
  reset() { this.connector = null; }
  /** A carried connector with its stem tip over the port and lowered into it is inserted for good. */
  step(rov, dt, connector) {
    if (!connector || connector.stuck_to || connector.mode !== "held") return;
    const [px, py] = this.port();
    const lowered = connector.depth >= (floorAt(px, py) ?? 3) - Observatory.DEPTH;
    if (Math.hypot(connector.x - px, connector.y - py) <= Observatory.PORT_RADIUS && lowered) {
      this.connector = connector.id; connector.stuck_to = "port";
      connector.x = px; connector.y = py; connector.depth = floorAt(px, py) ?? 3; connector.supported = true;
    }
  }
  state() { const [x, y] = this.port(); return { type: this.type, x, y, port_height: Observatory.PORT_HEIGHT, connector: this.connector }; }
}

/** The wind farm's power connector stand: a 1/2" frame 25 x 15 cm with a 35 x 20 cm plastic top, 15 cm high. The power connector starts on it. */
export class Stand {
  static HEIGHT = 0.15; static HALF_X = 0.175; static HALF_Y = 0.10;
  constructor(spot) { this.type = "m_stand"; this.spot = spot; }
  centre() { return at(...this.spot); }
  /** Is (x, y) over the top of the stand? */
  holds(x, y) { const [cx, cy] = this.centre(); return Math.abs(x - cx) <= Stand.HALF_X && Math.abs(y - cy) <= Stand.HALF_Y; }
  reset() {} step() {}
  state() { const [x, y] = this.centre(); return { type: this.type, x, y, height: Stand.HEIGHT, hx: Stand.HALF_X, hy: Stand.HALF_Y }; }
}
/** The power connector: a red 1/2" cross with a metal screw hook on top, a 15 cm pipe ending in a Velcro-hook patch (6 x 4 cm) and a 5 cm tail with a 4 m wire. Hanging from
 *  its hook the pipe points down and the Velcro tip (its base) is at the bottom. It lies on the stand at the start. */
export class PowerConnector extends Carryable {
  static RADIUS = 0.05; static BODY_HIGH = 0.08;
  constructor(id, label, stand) {
    const [x, y] = stand.centre();
    super(id, "power_connector", x, y, [{ id: "hook", up: 0.17, r: A(0.08), kind: "loop" }, { id: "pipe", up: 0.08, r: A(0.03), kind: "claw" }]);
    this.label = label; this.stand = stand;
    this.reset();
  }
  rest_depth(x, y) { const f = floorAt(x, y) ?? 3; return this.stand && this.stand.holds(x, y) ? f - Stand.HEIGHT : f; }
  /** Lifted off the stand: carried, and its tip at least 3 cm clear of whatever it rested on (the stand's top or the floor). */
  get lifted() { return this.held !== null && this.depth < this.rest_depth(this.x, this.y) - 0.03; }
}
/** The waypoint: a 1/2" PVC "X" on the floor whose four arm ends carry 12 cm posts. The cable must run between the four posts. */
export class Waypoint {
  static ARM = 0.17 * ASSIST; static POST_HEIGHT = 0.15;
  constructor(spot) { this.type = "m_waypoint"; this.spot = spot; }
  centre() { return at(...this.spot); }
  reset() {} step() {}
  /** Does a polyline (world [x, y, z up] points, dense) pass through the space between the four posts, below the post tops? It must come in and go out again. */
  through(pts, floorZ) {
    const [cx, cy] = this.centre(), fz = floorZ(cx, cy);
    const inside = (p) => Math.abs(p[0] - cx) + Math.abs(p[1] - cy) <= Waypoint.ARM && p[2] <= fz + Waypoint.POST_HEIGHT;
    let before = false, inn = false;
    for (const p of pts) {
      if (inside(p)) { if (before) inn = true; }
      else if (inn) return true;                                           // in, and out the other side
      else before = true;
    }
    return false;
  }
  state() { const [x, y] = this.centre(); return { type: this.type, x, y, arm: Waypoint.ARM, post: Waypoint.POST_HEIGHT }; }
}
/** The oil platform port: a 2" tee on a 1/2" frame (45 x 15 cm), its branch pointing up, lined with Velcro loops. The power connector's Velcro tip sticks in it. */
export class OilPort {
  static HEIGHT = 0.12; static RADIUS = 0.03 * ASSIST; static DEPTH = 0.04;           // the opening is 12 cm up; the tip must go 4 cm in
  constructor(spot) { this.type = "m_oilport"; this.spot = spot; this.connector = null; }
  port() { return at(...this.spot); }
  reset() { this.connector = null; }
  step(rov, dt, connector) {
    if (!connector || connector.stuck_to || connector.mode !== "held") return;
    const [px, py] = this.port(), f = floorAt(px, py) ?? 3;
    if (Math.hypot(connector.x - px, connector.y - py) <= OilPort.RADIUS && connector.depth >= f - (OilPort.HEIGHT - OilPort.DEPTH)) {          // over the opening and its tip 4 cm in
      this.connector = connector.id; connector.stuck_to = "oilport";
      connector.x = px; connector.y = py; connector.depth = f - (OilPort.HEIGHT - OilPort.DEPTH); connector.supported = true;
    }
  }
  state() { const [x, y] = this.port(); return { type: this.type, x, y, height: OilPort.HEIGHT, connector: this.connector }; }
}

/** The transect: a 3.1 m "I" of 1/2" PVC on the floor, running out from the wall (0.5 m to 3.6 m). Flying along it, staying over it from one end to the other, scores. */
export class Transect {
  static LENGTH = 3.1; static HALF_WIDTH = 0.27;                            // the ROV is about 0.5 m wide: its plan view must overlap the pipe
  static END_ZONE = 0.35;                                                   // m: within this of an end it counts as being "at" that end
  static LEAVE = 0.6;                                                       // m past an end the run is over
  constructor(u0 = 0.5) {
    this.type = "m_transect";
    this.u0 = u0;
    this.reset();
  }
  /** The two ends in world coordinates [x, y]: A (near the wall) and B. */
  ends() { const f = frame(); return [[f.wallX - this.u0, f.midY], [f.wallX - this.u0 - Transect.LENGTH, f.midY]]; }
  reset() { this.armed = null; this.done = false; this.s = 0.0; this.d = 0.0; }
  /** Where the ROV is along the pipe (s, 0..LENGTH from end A) and how far to the side (d). */
  locate(rov) {
    const [a, b] = this.ends(), L = Transect.LENGTH;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    const dx = rov.x - a[0], dy = rov.y - a[1];
    return [dx * ux + dy * uy, -dx * uy + dy * ux];
  }
  step(rov, dt) {
    const L = Transect.LENGTH, Z = Transect.END_ZONE;
    const [s, d] = this.locate(rov);
    this.s = s; this.d = d;
    const over = Math.abs(d) <= Transect.HALF_WIDTH && s >= -Transect.LEAVE && s <= L + Transect.LEAVE;
    if (!over) { this.armed = null; return; }                              // left the pipe: start again from an end
    if (this.armed === null) { if (s <= Z) this.armed = "A"; else if (s >= L - Z) this.armed = "B"; }            // starts from either end
    else if (this.armed === "A" && s >= L - Z) this.done = true;
    else if (this.armed === "B" && s <= Z) this.done = true;
  }
  state() { const [a, b] = this.ends(); return { type: this.type, a, b, armed: this.armed, done: this.done, length: Transect.LENGTH }; }
}
