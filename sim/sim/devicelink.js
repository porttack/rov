// devicelink.js — the simulator's side of docs/PROTOCOL.md: plain text lines to and from a micro:bit or Pico. No DOM, no Web Serial
// (serial.js does the browser part), so it runs in Node tests with a fake device.
//
//   device -> sim   p:t1,0.5   thruster 1..4 (-1..1)      p:claw,1   claw (0 closed .. 1 open)
//                   p:tool,nose   p:reset,1                 s:depth    "send me depth" (repeat every few seconds)
//   sim -> device   m:depth,0.82   m:heading,90.0   m:pitch,-1.5   m:accel,0.00,0.00,9.81   m:speed,0.12
//                   (only for channels the device subscribed to; every line <= 32 bytes so it also fits a radio packet)
//
// Safety: a thruster command from the device stays until a new one arrives (like ROS), BUT when the link goes away
// (cable pulled, port closed) all four thrusters are set to zero. Slow, one line at a time, so a small micro:bit receive buffer
// is never flooded. Anything that is not a valid p: / s: line (boot noise, debug prints, half a line) is ignored.
const THRUSTERS = ["t1", "t2", "t3", "t4"];
export const SUB_TTL_MS = 15000;          // a subscription lapses this long after the device's last s:<name>
export const MIN_GAP_MS = 60;             // at most one line to the device per this long (about 16 lines a second)
export const KEEPALIVE_MS = 1000;         // an unchanged value is repeated this often
export const MAX_LINE = 32;

/** Same rule as the Python bridge: lower-case, anything but a-z 0-9 _ becomes _, no leading digit. */
export function cleanName(name) {
  const n = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return n && !/^[0-9]/.test(n) ? n : null;
}

/** Cuts a byte stream (already decoded to text) into lines. Handles \r\n, partial lines, and drops absurdly long ones. */
export class LineSplitter {
  constructor(maxLine = 256) { this.buf = ""; this.max = maxLine; this.skipping = false; }
  feed(text) {
    const out = [];
    for (const ch of text) {
      if (ch === "\n") {
        if (!this.skipping && this.buf.trim()) out.push(this.buf.trim());
        this.buf = ""; this.skipping = false;
      } else if (!this.skipping) {
        this.buf += ch;
        if (this.buf.length > this.max) { this.buf = ""; this.skipping = true; }     // resync at the next newline
      }
    }
    return out;
  }
}

const deg = (rad) => rad * 180 / Math.PI;
const f = (v, n) => { const t = v.toFixed(n); return t === "-0.00" || t === "-0.0" || t === "-0" ? t.slice(1) : t; };
// what the sim can tell a device: channel -> (state) => text of the value, and how often it is worth sending (ms)
export const CHANNELS = {
  depth: { every: 200, value: (s) => f(s.depth, 2) },                                         // metres below the surface
  heading: { every: 200, value: (s) => f(((deg(s.yaw) % 360) + 360) % 360, 0) },              // degrees, 0 = +x end of the pool, counter-clockwise +
  pitch: { every: 200, value: (s) => f(deg(s.pitch), 1) },                                    // degrees, nose DOWN positive
  speed: { every: 200, value: (s) => f(s.speed, 2) },                                         // m/s
  accel: { every: 200, value: (s) => (s.imu ? `${f(s.imu.ax, 2)},${f(s.imu.ay, 2)},${f(s.imu.az, 2)}` : null) },   // m/s^2, with gravity
};

export class DeviceLink {
  /** `world` is the browser sim (sim/world.js): we use world.rov, world.setTool, world.reset, world.state. */
  constructor(world) {
    this.world = world;
    this.send = null;                // set by the transport: (line) => void. null = no device connected
    this.subs = new Map();           // channel -> time (ms) the subscription lapses
    this.lastSent = new Map();       // channel -> [time, text]
    this.lastAny = -1e9;
    this.turn = 0;                   // round-robin start, so every subscribed channel gets its turn
    this.onActivity = null;          // optional (direction, line) => void, for the on-page log
    this.stats = { in: 0, ignored: 0, out: 0 };
  }

  /** One line from the device. Returns true if it was understood. */
  onLine(line, now) {
    const ok = this._handle(line, now);
    ok ? this.stats.in++ : this.stats.ignored++;
    if (ok && this.onActivity) this.onActivity("in", line);
    return ok;
  }

  _handle(line, now) {
    if (line.startsWith("s:")) {
      const name = cleanName(line.slice(2));
      if (!name) return false;
      if (name in CHANNELS) this.subs.set(name, now + SUB_TTL_MS);
      return true;                     // understood, even when it is a channel the sim does not have
    }
    if (!line.startsWith("p:")) return false;
    const comma = line.indexOf(",");
    if (comma < 0) return false;
    const name = cleanName(line.slice(2, comma));
    const text = line.slice(comma + 1).trim();
    if (!name) return false;
    const rov = this.world.rov;
    if (THRUSTERS.includes(name)) {
      const v = Number(text);
      if (text === "" || !Number.isFinite(v)) return false;
      rov.set_cmd(name, v);            // clamped to -1..1 there
      return true;
    }
    if (name === "claw") {
      const v = Number(text);
      if (text === "" || !Number.isFinite(v)) return false;
      rov.claw_target = Math.max(0, Math.min(1, v));
      return true;
    }
    if (name === "tool") { if (text !== "claw" && text !== "nose") return false; this.world.setTool(text); return true; }
    if (name === "reset") { this.world.reset(); return true; }
    return false;                      // a channel the sim does not know: ignored (the device may be talking to something else too)
  }

  /** Call often (every frame is fine). Sends at most ONE line, and only if a device is connected and subscribed. */
  tick(now) {
    if (!this.send || now - this.lastAny < MIN_GAP_MS || this.subs.size === 0) return null;
    for (const [name, until] of this.subs) if (now > until) this.subs.delete(name);
    const names = [...this.subs.keys()];
    if (!names.length) return null;
    const state = this.world.state();
    for (let i = 0; i < names.length; i++) {
      const name = names[(this.turn + i) % names.length];
      const ch = CHANNELS[name];
      const prev = this.lastSent.get(name);
      if (prev && now - prev[0] < ch.every) continue;
      const text = ch.value(state);
      if (text === null) continue;
      if (prev && prev[1] === text && now - prev[0] < KEEPALIVE_MS) continue;       // nothing new to say
      const line = `m:${name},${text}`;
      if (line.length > MAX_LINE) continue;
      this.lastSent.set(name, [now, text]);
      this.lastAny = now;
      this.turn = (this.turn + i + 1) % names.length;
      this.stats.out++;
      this.send(line);
      if (this.onActivity) this.onActivity("out", line);
      return line;
    }
    return null;
  }

  /** The link went away (cable pulled, port closed, error): stop the thrusters, forget the subscriptions. */
  disconnected() {
    this.send = null;
    this.subs.clear();
    this.lastSent.clear();
    for (const k of THRUSTERS) this.world.rov.set_cmd(k, 0);
  }
}
