// world.js — the browser's own simulation loop: no DOM, no three.js (so it also runs in Node tests).
// It owns the commands from the page (the keyboard), steps the ROV at a fixed 1/60 s, and produces state().
import { Rov, BUOYANCY_MODES, clamp } from "./physics.js";

export const DT = 1 / 60, MAX_STEPS = 4;      // never try to catch up more than 4 steps per frame (slow machine: slow motion, not a freeze)

export class World {
  constructor(rov = new Rov({ tool: "nose" })) {
    this.rov = rov;
    this._prev = {};
    this.keys = true;
    this._acc = 0;
    this._last = null;
    this.ringDropper = null;         // set by the page backend when the optional rings add-on is loaded
  }
  /** The page's keyboard command: apply only the channels whose value CHANGED (same rule as apply_keyboard in Python). */
  command(c) {
    const prev = this._prev;
    for (const k of Object.keys(this.rov.cmd)) {
      if ((c[k] ?? 0) !== (prev[k] ?? 0)) this.rov.set_cmd(k, c[k] ?? 0);
    }
    if ((c.claw ?? 0) !== (prev.claw ?? 0)) this.rov.claw_target = clamp(Number(c.claw ?? 0), 0.0, 1.0);
    this._prev = { ...c };
  }
  /** The page's N key: a new ring at (x, y). Returns the ring, or null (no rings add-on loaded, or the pool is full). */
  dropRing(x, y) { return this.ringDropper ? this.ringDropper(this.rov, x, y) : null; }
  setBuoyancy(mode) { if (mode in BUOYANCY_MODES) this.rov.buoyancy = BUOYANCY_MODES[mode]; }
  setTool(t) { if (t === "claw" || t === "nose") this.rov.tool = t; }
  reset() { this.rov.reset(); }
  /** Advance by wall-clock time `now` (ms), in fixed steps. */
  advance(now) {
    if (this._last === null) this._last = now;
    this._acc += Math.min((now - this._last) / 1000, MAX_STEPS * DT);
    this._last = now;
    while (this._acc >= DT) { this.rov.step(DT); this._acc -= DT; }
  }
  /** Skip the time that passed while nobody was running us (tab hidden). */
  pause() { this._last = null; }
  state() { return { ...this.rov.state(this.keys), ros: false, joys: [[0, 0], [0, 0]], joy_topics: [] }; }
}
