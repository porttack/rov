// backend-net.js — talks to the Python sim server (keyboard_sim.py / rov_sim.py).
// Every backend has the same shape, so app.js does not care which one it got:
//   connect(onState)   start delivering state objects (the JSON the sim publishes)
//   cmd(obj)           thrusters/claw: {t1..t4, claw}
//   tool(name)         "claw" | "nose"
//   buoyancy(mode)     "positive" | "neutral" | "negative"
//   joy(n, axes)       on-screen joystick n (1 or 2)
//   reset()
//   features           what this backend can do (the page hides what is missing)
// URLs are RELATIVE ("events", not "/events") so the page works from any folder.
const post = (url, body) => fetch(url, { method: "POST", body, keepalive: true });

export const name = "sim connected";
export const features = { keys: true, joys: true, claw: true, imu: true, rings: true, fish: true };

export function connect(onState) {
  const es = new EventSource("events");
  es.onmessage = (e) => onState(JSON.parse(e.data));
}
export const cmd = (obj) => post("cmd", JSON.stringify(obj));
export const tool = (name) => post("tool", name);
export const buoyancy = (mode) => post("buoyancy", mode);
export const joy = (n, axes) => post("joy", JSON.stringify({ n, axes }));
export const reset = () => post("reset");
