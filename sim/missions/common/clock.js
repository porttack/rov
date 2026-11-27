// clock.js — the countdown clock of a timed mission run. No DOM, no three.js (it runs in Node tests).
//   ready   waiting for the first move (the clock shows the full time)     running   counting down; at zero it does NOT stop: it keeps counting, now in NEGATIVE numbers (overtime)
export class RunClock {
  constructor(total = 600) {
    this.total = total;
    this.reset();
  }
  reset() { this.state = "ready"; this.remaining = this.total; this.elapsed = 0.0; }
  /** The run begins (the ROV made its first move, or the Start key). Does nothing when it already began. */
  start() { if (this.state === "ready") this.state = "running"; }
  step(dt) {
    if (this.state !== "running") return;
    this.elapsed += dt;
    this.remaining = this.total - this.elapsed;                     // goes below zero in overtime
  }
  /** Time is up (the clock is in overtime). The run is not stopped: the clock just counts on, below zero. */
  get over() { return this.state === "running" && this.remaining <= 0.0; }
  /** "m:ss" for the page, "-m:ss" in overtime (rounded up, so 0:00 shows only at the zero itself). */
  text() {
    const neg = this.remaining < 0, s = Math.ceil((neg ? -this.remaining : this.remaining) - 1e-9);
    return `${neg ? "-" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  data() { return { state: this.state, remaining: this.remaining, elapsed: this.elapsed, total: this.total, text: this.text(), over: this.over }; }
}
