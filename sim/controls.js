// controls.js — turns held keys and the on-screen switch box into thruster commands. No DOM, so it is tested in Node.
//
// THE SWITCH BOX imitates the controller most scout ROVs use: three momentary DPDT switches (on-off-on, spring back to centre)
// wired through H-bridges, so each is full reverse, off, or full forward, with no in-between.
//   red switch   = thruster t1 (the left one)    keys 1 (reverse) and 2 (forward); lying down: left end reverse, right end forward
//   green switch = thruster t2 (the right one)   arrow keys Left (reverse) and Right (forward); lying down like red
//   up/down      = both vertical t3 + t4         arrow keys Down and Up; upright
// Only red shows its keys (1 and 2); the other two are meant to be obvious.
// H TOGGLES "H-bridge only" mode: only the three switches work, like the real box. With it off, the extra keyboard keys
// (W/S forward, A/D turn, R/F or Space/Shift up/down, Z/C one thruster, I/K nose trim) also work, at 80% power.
// A pushed switch always overrides everything else for ITS thrusters. To change a key, edit SWITCHES (and the help in index.html).
export const SWITCHES = [
  { name: "red", orient: "h", thrusters: ["t1"], minus: "Digit1", plus: "Digit2", title: "red thruster (t1, the left one)" },
  { name: "green", orient: "h", thrusters: ["t2"], minus: "ArrowLeft", plus: "ArrowRight", title: "green thruster (t2, the right one)" },
  { name: "up/down", orient: "v", thrusters: ["t3", "t4"], minus: "ArrowDown", plus: "ArrowUp", title: "both up/down thrusters (t3, t4)" },
];

export const SWITCH_KEYS = SWITCHES.flatMap((s) => [s.minus, s.plus]);
export const EXTRA_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "KeyF", "KeyZ", "KeyC", "KeyI", "KeyK", "Space", "ShiftLeft", "ShiftRight"];
export const GAME_KEYS = new Set([...EXTRA_KEYS, "BracketLeft", "BracketRight", ...SWITCH_KEYS]);
export const POWER = 0.8;                         // power of the extra keyboard keys (the switches always give full power, like an H-bridge)

/** Each switch as -1 / 0 / +1. The mouse (`pointer`, one value per switch) wins over the keys; both keys of a pair cancel out. */
export function switchValues(held, pointer = [0, 0, 0]) {
  return SWITCHES.map((s, i) => pointer[i] || ((held.has(s.plus) ? 1 : 0) - (held.has(s.minus) ? 1 : 0)));
}

/** The command for the sim: {t1..t4, claw}. `hOnly`: ignore the extra keys, only the switches count. */
export function computeCommand(held, pointer, clawCmd = 0, { power = POWER, hOnly = false } = {}) {
  const k = (c) => (!hOnly && held.has(c) ? 1 : 0);
  const fwd = k("KeyW") - k("KeyS");
  const turn = k("KeyD") - k("KeyA");                                       // + = turn right
  const up = k("KeyR") + k("Space") - k("KeyF") - k("ShiftLeft") - k("ShiftRight");
  const trim = k("KeyI") - k("KeyK");                                       // + = nose up: front pushes up, rear down
  const c = (v) => Math.max(-1, Math.min(1, v)) * power;
  const cmd = { t1: c(fwd + turn + k("KeyZ")), t2: c(fwd - turn + k("KeyC")), t3: c(up + trim), t4: c(up - trim), claw: Math.round(clawCmd * 100) / 100 };
  switchValues(held, pointer).forEach((v, i) => { if (v) for (const t of SWITCHES[i].thrusters) cmd[t] = v; });
  return cmd;
}
