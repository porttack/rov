// scout2026.js — the 2026 SCOUT competition mission (browser version only). An OPTIONAL add-on, started by ?mission=scout2026 (see backend-local.js).
// To remove it: delete web/missions/ and the mission lines in backend-local.js and app.js. Written so another mission can be added beside it (common/ is shared).
//   - one `Mission` prop (type "mission"): the clock, the score board, the deck + inventory, and the judges of the tasks
//   - the competition props, each a prop of its own (type "m_item" for things the ROV can carry)
// The physical tasks and their points are the manual's (task 1.1 ... 3.1); the paper tasks and the float are not part of this version. See the plan in the repo history.
import { RunClock } from "../common/clock.js";
import { ScoreBoard } from "../common/board.js";
import { Carryable, noseTip } from "../common/carry.js";
import { RUN_SECONDS, atStairs, deckRect, deckSlot, startPose } from "./layout.js";
import { BasketStar, Connector, Coral, EdnaSquare, Iceberg, Marker, MissionCrab, Observatory, OilPort, PowerConnector, Sensor, Stand, Transect, Waypoint } from "./items.js";
import { floorAt } from "../../sim/physics.js";
import { Cable } from "../common/cable.js";
import { LobsterPot } from "./pot.js";
import { SPOTS } from "./layout.js";

/** The 17 scored items (125 points): [id, label, points, group]. */
export const SCORED = [
  ["star1", "Basket star 1 to the deck", 5, "1 Coral garden"], ["star2", "Basket star 2 to the deck", 5, "1 Coral garden"],
  ["coral1", "Coral 1 to the deck", 5, "1 Coral garden"], ["coral2", "Coral 2 to the deck", 5, "1 Coral garden"],
  ["transect", "Fly the transect", 10, "1 Coral garden"],
  ["crab1", "Green crab 1 to the deck", 5, "2 SmartAtlantic"], ["crab2", "Green crab 2 to the deck", 5, "2 SmartAtlantic"],
  ["marker1", "Marker on iceberg point A", 10, "2 SmartAtlantic"], ["marker2", "Marker on iceberg point B", 10, "2 SmartAtlantic"],
  ["pot_open", "Lobster pot: buoy released", 5, "2 SmartAtlantic"], ["pot_surface", "Lobster pot: buoy at the surface", 5, "2 SmartAtlantic"],
  ["old_sensor", "Old eDNA sensor to the deck", 10, "2 SmartAtlantic"], ["new_sensor", "New eDNA sensor in the yellow square", 10, "2 SmartAtlantic"],
  ["connector", "eDNA connector in the observatory", 5, "2 SmartAtlantic"],
  ["power_lift", "Power connector lifted off the stand", 10, "3 Wind farm"], ["power_cable", "Cable through the waypoint", 10, "3 Wind farm"],
  ["power_port", "Power connector in the oil platform port", 10, "3 Wind farm"],
].map(([id, label, points, group]) => ({ id, label, points, group }));

export class Mission {
  constructor(rov) {
    this.type = "mission"; this.id = "scout2026";
    this.clock = new RunClock(RUN_SECONDS);
    this.board = new ScoreBoard(SCORED);
    this.items = [];                                           // the carryable props (also in rov.props, so the sim steps them)
    this.judges = [];                                          // functions (mission, rov) that set the board each step: one per task, added by the props
    this.resetters = [];                                       // functions that put the judges' own memory back on Reset
    this.locked = false; this.done = false; this.overtime_said = false;
    this.msg = { n: 0, text: "" };
    this.rov = rov;
  }
  reset() {
    this.rov.mission_carry = null;
    this.clock.reset(); this.board.reset();
    for (const f of this.resetters || []) f();
    this.locked = false; this.done = false; this.overtime_said = false;
    this.msg = { n: this.msg.n + 1, text: "" };
  }
  say(text) { this.msg = { n: this.msg.n + 1, text }; }

  step(rov, dt) {
    if (this.clock.state === "ready" && (Object.values(rov.cmd).some((v) => v !== 0) || rov.claw_target !== rov.claw)) this.clock.start();
    this.clock.step(dt);
    if (!this.overtime_said && this.clock.over) { this.overtime_said = true; this.say(`Time! The clock keeps counting, below zero. Score ${this.board.total} of ${this.board.max}`); }
    for (const j of this.judges) j(this, rov);
    this._busyHint(rov, dt);
    if (!this.done && this.board.total === this.board.max) { this.done = true; this.say(`All tasks done! ${this.board.total} points, clock at ${this.clock.text()}`); }
  }

  /** The nose is right in something's catch point while it is already carrying another thing: tell the student how to let go. */
  _busyHint(rov, dt) {
    const carried = rov.mission_carry;
    if (!carried || rov.tool !== "nose") { this.busy_t = 0; return; }
    const tip = noseTip(rov);
    const near = this.items.some((i) => i !== carried && (i.mode === "floor" || i.mode === "sink") && i.catches.some((c) => c.kind !== "claw" && Math.hypot(tip[0] - i.x, tip[1] - i.y, tip[2] + i.depth - c.up) < c.r));
    this.busy_t = near ? (this.busy_t ?? 0) + dt : 0;
    if (this.busy_t > 0.6 && (this.busy_say ?? -99) < this.clock.elapsed - 6) { this.busy_say = this.clock.elapsed; this.say(`The nose is busy with ${carried.label ?? carried.id}: press G to let go of it`); }
  }

  /** Set a scored item (true = earned, false = lost again) with the clock's time; announces what changed. */
  score(id, earned) {
    const was = this.board.total;
    if (this.board.set(id, earned, this.clock.elapsed)) {
      const it = this.board.byId.get(id), d = this.board.total - was;
      this.say(`${d > 0 ? "+" : ""}${d}  ${it.label}`);
    }
  }

  // ---- the crew on the deck (keys G and Tab on the page)
  /** G: the crew takes what the ROV carries and sets it on the deck. Returns a message. */
  deliver(rov) {
    if (this.locked) return "";
    const item = rov.mission_carry;
    if (!item) { this.say("Nothing on the ROV to hand over"); return this.msg.text; }
    if (!atStairs(rov)) {                                                    // not at the stairs: G just lets go of it (it sinks from where it is)
      item.release(rov);
      this.say(`Let go of ${item.label ?? item.id} (at the stairs, G hands it to the crew)`);
      return this.msg.text;
    }
    const used = new Set(this.items.filter((i) => i.mode === "deck" && i.slot).map((i) => i.slot.join()));
    let k = 0, slot;
    while ((slot = deckSlot(k)) && used.has(slot.join())) k++;
    item.toDeck(rov, slot);
    this.say(`On the deck: ${item.label ?? item.id}`);
    if (item.scoreId) this.score(item.scoreId, true);                     // (it stays scored when the crew hands it back later)
    return this.msg.text;
  }
  /** The inventory: what is on the deck. */
  inventory() { return this.items.filter((i) => i.mode === "deck").map((i) => ({ id: i.id, kind: i.kind, label: i.label ?? i.id })); }
  /** The crew gives the ROV an item from the deck (it hangs on the nose, or goes in the open claw). */
  give(rov, id) {
    if (this.locked) return false;
    if (!atStairs(rov)) { this.say("The ROV has to be at the stairs"); return false; }
    const item = this.items.find((i) => i.id === id && i.mode === "deck");
    if (!item) return false;
    if (!item.giveTo(rov)) { this.say(rov.mission_carry ? "The ROV is already carrying something" : "The tool cannot take that (open the claw first)"); return false; }
    return true;
  }

  state(rov) {
    return {
      type: this.type, id: this.id, title: "Scout 2026", locked: this.locked, clock: this.clock.data(), board: this.board.data(), inventory: this.inventory(),
      carrying: this.rov.mission_carry ? this.rov.mission_carry.id : null, atStairs: atStairs(this.rov), msg: this.msg, deck: deckRect(),
    };
  }
}

/** Put the mission into the pool: its props and the ROV's start. Returns the Mission. (The pool must already be the mission's pool: see MISSION_DEFAULTS in config.js.) */
export function addTo(rov) {
  const m = new Mission(rov);
  rov.start_pose = startPose();
  rov.props.push(m);
  rov.mission = m;
  m.addItem = (item) => {
    m.items.push(item); rov.props.push(item);
    if (!item.home_pose) { item.start_slot = deckSlot(m.items.filter((i) => !i.home_pose).length - 1); item.reset(); }       // deck-start props begin in the crew's inventory
    return item;
  };
  // task 1: the coral garden (positions are wall-relative: u out from the wall, v to the left)
  m.addItem(new BasketStar("star1", "Basket star 1", "star1", 1.6, 0.9, 0.3));
  m.addItem(new BasketStar("star2", "Basket star 2", "star2", 2.9, -1.0, -0.4));
  m.addItem(new Coral("coral1", "Coral 1", "coral1", 2.3, 0.8, 0.0));
  m.addItem(new Coral("coral2", "Coral 2", "coral2", 3.3, -0.6, 0.0));
  // task 2.1: two invasive European green crabs
  m.addItem(new MissionCrab("crab1", "Green crab 1", "crab1", 1.2, -0.9, 0.5));
  m.addItem(new MissionCrab("crab2", "Green crab 2", "crab2", 3.4, 0.9, -0.6));
  // task 2.2: the iceberg at the surface and two survey markers (they start on the deck: ask the crew for them with Tab at the stairs)
  const iceberg = new Iceberg(1.0, -2.3);
  rov.props.push(iceberg);
  const markers = [m.addItem(new Marker("marker1", "Survey marker 1")), m.addItem(new Marker("marker2", "Survey marker 2"))];
  m.judges.push((mm, r) => { iceberg.step(r, 0, markers); iceberg.points.forEach((p) => mm.score(p.scoreId, !!p.marker)); });
  // task 2.4: the eDNA station: yellow square (old sensor in it), new sensor + connector on the deck, observatory with its 3" port
  const square = new EdnaSquare(SPOTS.edna), obs = new Observatory(SPOTS.observatory);
  const oldSensor = m.addItem(new Sensor("old_sensor", "Old eDNA sensor", "edna_old", "old_sensor", SPOTS.edna));
  const newSensor = m.addItem(new Sensor("new_sensor", "New eDNA sensor", "edna_new", null, null));
  const connector = m.addItem(new Connector("connector", "eDNA connector"));
  const eCable = new Cable("edna_cable", () => [newSensor.x, newSensor.y, -newSensor.depth + 0.18], () => (connector.mode === "deck" ? null : [connector.x, connector.y, -connector.depth + 0.15]), 2.0);
  rov.props.push(square, obs, eCable);
  m.judges.push((mm, r) => {
    obs.step(r, 0, connector);
    mm.score("connector", connector.mode === "stuck" && connector.stuck_to === "port");                // (in the port and off the ROV)
    const standing = newSensor.mode === "floor" && !newSensor.held && square.holds(newSensor.x, newSensor.y);
    mm.score("new_sensor", standing && mm.board.get("old_sensor"));                                    // the old sensor has to be out first
  });
  // task 2.3: the whale-safe lobster pot
  const pot = new LobsterPot(SPOTS.pot);
  rov.props.push(pot);
  m.judges.push((mm) => { mm.score("pot_open", pot.released); mm.score("pot_surface", pot.surfaced); });
  // task 3.1: the wind farm: the power connector on its stand, the waypoint, the oil platform port, and the 4 m wire
  const stand = new Stand(SPOTS.stand), way = new Waypoint(SPOTS.waypoint), oil = new OilPort(SPOTS.oilPort);
  const power = m.addItem(new PowerConnector("power_connector", "Power connector", stand));
  const floorZ = (x, y) => -(floorAt(x, y) ?? 3);
  const pCable = new Cable("power_cable", () => { const [x, y] = stand.centre(); return [x, y, floorZ(x, y) + 0.10]; },
    () => (power.mode === "deck" ? null : [power.x, power.y, -power.depth + 0.17]), 4.0, floorZ);
  rov.props.push(stand, way, oil, pCable);
  let lifted = false;
  m.judges.push((mm, r) => {
    oil.step(r, 0, power);
    if (power.lifted) lifted = true;                                                                  // lifted off the stand: kept even if it is dropped later
    mm.score("power_lift", lifted);
    mm.score("power_cable", way.through(pCable.dense(), floorZ));                                     // the wire runs between the four posts (and stays there)
    mm.score("power_port", power.mode === "stuck" && power.stuck_to === "oilport");
  });
  m.resetters.push(() => { lifted = false; });
  const transect = new Transect(0.5);
  rov.props.push(transect);
  m.judges.push((mm) => { if (transect.done) mm.score("transect", true); });
  rov.reset();
  return m;
}
export { Carryable };
