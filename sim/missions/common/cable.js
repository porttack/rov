// cable.js — a cable that is only DRAWN and checked (no rope physics): the line from where it is anchored along the path its free end really took.
// The path is a trail of points left behind the end; backing up over the trail takes it in again (so the cable "retracts"). Used for the 2 m and 4 m cables of the 2026 mission.
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export class Cable {
  static DRAPE = 0.8;
  /** anchor(): world [x, y, z up] of the fixed end; end(): [x, y, z] of the free end, or null when it is not in the water (on the deck); length: metres of cable. */
  constructor(id, anchor, end, length, floorZ = null) {
    this.type = "m_cable"; this.id = id; this.anchor = anchor; this.end = end; this.length = length;
    this.floorZ = floorZ;                                  // (x, y) -> z of the floor there: with it the cable DRAPES: it lies on the floor except the last DRAPE metres near the carried end
    this.reset();
  }
  reset() { this.trail = []; this.path = 0; }
  step() {
    const e = this.end();
    if (!e) { this.trail = []; this.path = 0; return; }
    const a = this.anchor();
    if (!this.trail.length) this.trail.push(a);
    while (this.trail.length > 1 && d3(e, this.trail[this.trail.length - 2]) < 0.12) this.trail.pop();         // backed up over its own trail: take the cable in
    if (d3(e, this.trail[this.trail.length - 1]) > 0.10) this.trail.push([e[0], e[1], e[2]]);
    this.trail[0] = a;                                                                                          // (the anchor can move: the sensor was set down somewhere else)
    let p = 0; const pts = this.points();
    for (let i = 1; i < pts.length; i++) p += d3(pts[i - 1], pts[i]);
    this.path = p;
  }
  /** The polyline: anchor, the trail, the free end (draped on the floor if the cable knows where the floor is). */
  points() {
    const e = this.end();
    if (!e) return [];
    const raw = [...this.trail, e];
    if (!this.floorZ) return raw;
    const out = new Array(raw.length); let s = 0;                                                               // s: cable length from the free end
    for (let i = raw.length - 1; i >= 0; i--) {
      if (i < raw.length - 1) s += d3(raw[i], raw[i + 1]);
      const f = this.floorZ(raw[i][0], raw[i][1]) + 0.012, k = Math.max(0, 1 - s / Cable.DRAPE);
      out[i] = [raw[i][0], raw[i][1], f + k * Math.max(0, raw[i][2] - f)];
    }
    return out;
  }
  /** The polyline as points every `step` metres (for tests of "does it pass through here"). */
  dense(step = 0.02) {
    const pts = this.points(), out = [];
    for (let i = 1; i < pts.length; i++) {
      const n = Math.max(1, Math.ceil(d3(pts[i - 1], pts[i]) / step));
      for (let k = 0; k < n; k++) { const u = k / n; out.push([0, 1, 2].map((j) => pts[i - 1][j] + (pts[i][j] - pts[i - 1][j]) * u)); }
    }
    if (pts.length) out.push(pts[pts.length - 1]);
    return out;
  }
  get taut() { return this.path > this.length; }
  state() { return { type: this.type, id: this.id, pts: this.points().slice(-160), length: this.length, path: this.path, taut: this.taut }; }
}
