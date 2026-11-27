// controls.js — turns held keys and the on-screen switch box into thruster commands. No DOM, so it is tested in Node.
//
// THE SWITCH BOX imitates the controller most scout ROVs use: three momentary DPDT switches (on-off-on, spring back to centre)
// wired through H-bridges, so each is full reverse, off, or full forward, with no in-between.
//   red switch   = the left thruster(s): t1 (with 6 or 8 thrusters t1 and t3)     keys 1 (reverse) and 2 (forward); lying down: left end reverse, right end forward
//   green switch = the right thruster(s): t2 (with 6 or 8 thrusters t2 and t4)    arrow keys Left (reverse) and Right (forward); lying down like red
//   up/down      = every vertical thruster (t3 / t3 t4 / t5 t6 / t5-t8, by layout)   arrow keys Down and Up; upright
// Only red shows its keys (1 and 2); the other two are meant to be obvious.
// H TOGGLES "H-bridge only" mode: only the three switches work, like the real box. With it off, the extra keyboard keys
// (W or Shift forward, S or Space reverse, A/D turn, R/F up/down, Z/C one side, I/K nose trim; Q/E slide left/right with 6 or 8 thrusters, U/O roll
// with 8) also work, at 80% power. How the keys become t1 ... t8 depends on the thruster layout (3, 4, 6 or 8): see computeCommand.
// A pushed switch always overrides everything else for ITS thrusters. To change a key, edit SWITCHES (and the help in index.html).
export const SWITCHES = [
  { name: "red", orient: "h", minus: "Digit1", plus: "Digit2", title: "red thruster (t1, the left one)" },
  { name: "green", orient: "h", minus: "ArrowLeft", plus: "ArrowRight", title: "green thruster (t2, the right one)" },
  { name: "up/down", orient: "v", minus: "ArrowDown", plus: "ArrowUp", title: "both up/down thrusters (t3, t4)" },
];

export const SWITCH_KEYS = SWITCHES.flatMap((s) => [s.minus, s.plus]);
export const EXTRA_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "KeyF", "KeyZ", "KeyC", "KeyI", "KeyK", "KeyQ", "KeyE", "KeyU", "KeyO", "Space", "ShiftLeft", "ShiftRight"];
export const GAME_KEYS = new Set([...EXTRA_KEYS, "BracketLeft", "BracketRight", ...SWITCH_KEYS]);
export const POWER = 0.8;                         // power of the extra keyboard keys (the switches always give full power, like an H-bridge)

/** Each switch as -1 / 0 / +1. The mouse (`pointer`, one value per switch) wins over the keys; both keys of a pair cancel out. */
export function switchValues(held, pointer = [0, 0, 0]) {
  return SWITCHES.map((s, i) => pointer[i] || ((held.has(s.plus) ? 1 : 0) - (held.has(s.minus) ? 1 : 0)));
}

// The 8 corner thrusters: t1-t4 top, t5-t8 bottom, each front left, front right, rear left, rear right = [ahead +1, left +1, top +1]. The rear ones are mirror images of the front
// ones and every movement is one sign pattern over the corners: forward = ahead, slide right = left, turn right = ahead * left, up = top, nose up = ahead * top, roll = left * top.
// (See THRUSTER_LAYOUTS in sim/physics.js.)
const CORNERS = [[1, 1, 1], [1, -1, 1], [-1, 1, 1], [-1, -1, 1], [1, 1, -1], [1, -1, -1], [-1, 1, -1], [-1, -1, -1]];

/** Which thrusters each switch drives for a layout of n thrusters (3, 4, 6 or 8): [red, green, up/down]. */
export function switchTargets(n) {
  const left = n > 4 ? ["t1", "t3"] : ["t1"], right = n > 4 ? ["t2", "t4"] : ["t2"];
  const vertical = n === 3 ? ["t3"] : n === 6 ? ["t5", "t6"] : n === 8 ? ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"] : ["t3", "t4"];
  return n === 8 ? [["t1", "t3", "t5", "t7"], ["t2", "t4", "t6", "t8"], vertical] : [left, right, vertical];
}

/** Where the three on-screen switches stand, from the thruster commands the sim has (whoever sent them: the page's own keys and switches, ROS, a micro:bit over USB).
 *  Each switch is -1 (reverse), 0 (stop) or +1 (forward): the average of its thrusters' commands (the corner thrusters of the 8 layout push the way their pattern says), snapped to
 *  the nearest of the three positions: a real H-bridge switch has no in-between, and anything that is not (almost) zero shows the direction it is pushing. */
export function switchPositions(cmd, n = 4, dead = 0.05) {
  const targets = switchTargets(n), out = [];
  targets.forEach((names, i) => {
    let sum = 0, count = 0;
    for (const t of names) {
      const k = Number(t.slice(1)) - 1, sign = n === 8 ? (i === 2 ? CORNERS[k][2] : CORNERS[k][0]) : 1;     // (the 8 corner thrusters: red / green push ahead on the front ones and back on the rear, up / down is top up, bottom down)
      sum += sign * (Number(cmd[t]) || 0); count++;
    }
    const v = count ? sum / count : 0;
    out.push(v > dead ? 1 : v < -dead ? -1 : 0);
  });
  return out;
}

/** The command for the sim: {t1 ... t<n>, claw}. `hOnly`: ignore the extra keys, only the switches count. `thrusters` is the layout: 3, 4, 6 or 8.
 *  3 and 4: t1 / t2 are the left / right thrusters (the keys mix forward and turn), t3 (and t4) are the vertical ones (up, and nose trim with two).
 *  6 and 8: t1 front left, t2 front right, t3 rear left, t4 rear right (with 8: the top corners; t5-t8 the bottom ones), angled 45 degrees: forward is all of them, turning is the left side against the right,
 *  sliding sideways is the diagonals (t1 and t4 against t2 and t3). Then t5, t6 (6) or t5 ... t8 (8, the corners) are vertical: up, nose trim, and roll. */
export function computeCommand(held, pointer, clawCmd = 0, { power = POWER, hOnly = false, thrusters = 4 } = {}) {
  const k = (c) => (!hOnly && held.has(c) ? 1 : 0);
  const fwd = k("KeyW") + k("ShiftLeft") + k("ShiftRight") - k("KeyS") - k("Space");     // Shift = forward, Space = reverse
  const turn = k("KeyD") - k("KeyA");                                       // + = turn right
  const up = k("KeyR") - k("KeyF");
  const trim = k("KeyI") - k("KeyK");                                       // + = nose up: front pushes up, rear down
  const strafe = k("KeyE") - k("KeyQ"), roll = k("KeyO") - k("KeyU");       // + = slide right / heel over with the right side down
  const zl = k("KeyZ"), zr = k("KeyC");                                     // one side only
  const c = (v) => Math.max(-1, Math.min(1, v)) * power;
  const cmd = {};
  if (thrusters === 8) {
    CORNERS.forEach(([sx, sy, sz], i) => {
      cmd["t" + (i + 1)] = c(sx * (fwd + (sy > 0 ? zl : zr)) + strafe * sy + turn * sx * sy + up * sz + trim * sx * sz + roll * sy * sz);
    });
  } else if (thrusters <= 4) {
    cmd.t1 = c(fwd + turn + zl); cmd.t2 = c(fwd - turn + zr);
    if (thrusters === 3) cmd.t3 = c(up);                                    // one vertical thruster: no way to trim the nose
    else { cmd.t3 = c(up + trim); cmd.t4 = c(up - trim); }
  } else {
    cmd.t1 = c(fwd + turn + strafe + zl); cmd.t2 = c(fwd - turn - strafe + zr);
    cmd.t3 = c(fwd + turn - strafe + zl); cmd.t4 = c(fwd - turn + strafe + zr);
    cmd.t5 = c(up + trim); cmd.t6 = c(up - trim);
  }
  cmd.claw = Math.round(clawCmd * 100) / 100;
  const targets = switchTargets(thrusters);
  switchValues(held, pointer).forEach((v, i) => {
    if (!v) return;
    for (const t of targets[i]) {
      const [sx, , sz] = CORNERS[Number(t.slice(1)) - 1] || [1, 1, 1];
      cmd[t] = thrusters === 8 ? v * (i === 2 ? sz : sx) : v;               // 8 corner thrusters: red / green push ahead on the front ones and back on the rear ones, up/down pushes the top ones up and the bottom ones down
    }
  });
  return cmd;
}
