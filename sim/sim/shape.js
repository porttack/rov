// shape.js — port of ../../rov_shape.py: the ROV's solid parts as capsules (a segment + a radius), for collisions and distances.
// Mirrors the 3D model in app.js; if you change the look of the ROV, change the numbers here (and in rov_shape.py).
// Axes: x forward, y LEFT, up = z. A point in the ROV's own frame is (fx, ly, uz). Pitch (nose-down +) tilts about the centre.
export const H = 0.25, PIPE_R = 0.014;
export const NOSE_PTS = [[0.25, -0.25], [0.35, -0.25], [0.43, -0.238], [0.485, -0.195]];
export const NOSE_R = 0.016;
export const JAW_X0 = 0.42, JAW_Y0 = 0.03, JAW_HALF = 0.0125;
export const JAW_LEN = 0.14, TIP_LEN = 0.055, TIP_BEND = 0.55;
export const JAW_SWING = 0.7, JAW_Z = -0.25;
export const CAM_POS = [0.23, 0.0, 0.20];          // the ROV camera: top front, looking forward and down
export const CAM_TILT = 0.5;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const clamp01 = (v) => (v < 0.0 ? 0.0 : v > 1.0 ? 1.0 : v);

/** Closest points between segments p1-q1 and p2-q2: [point on 1, point on 2, distance]. */
export function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) { s = t = 0.0; }
  else if (a <= 1e-12) { s = 0.0; t = clamp01(f / e); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-12) { t = 0.0; s = clamp01(-c / a); }
    else {
      const b = dot(d1, d2), denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0.0;
      t = (b * s + f) / e;
      if (t < 0.0) { t = 0.0; s = clamp01(-c / a); }
      else if (t > 1.0) { t = 1.0; s = clamp01((b - c) / a); }
    }
  }
  const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s];
  const c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
  const d = sub(c1, c2);
  return [c1, c2, Math.sqrt(dot(d, d))];
}

/** Closest point on segment a-b to point p: [point, distance]. */
export function pointSeg(p, a, b) {
  const ab = sub(b, a), ap = sub(p, a), L2 = dot(ab, ab);
  const t = L2 > 1e-12 ? clamp01(dot(ap, ab) / L2) : 0.0;
  const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  const d = sub(p, q);
  return [q, Math.sqrt(dot(d, d))];
}

/** A point in the ROV's own frame as a world [x, y, up], allowing for yaw and pitch. */
export function localToWorld(rov, fx, ly, uz) {
  const cy = Math.cos(rov.yaw), sy = Math.sin(rov.yaw), cp = Math.cos(rov.pitch), sp = Math.sin(rov.pitch);
  const fx2 = fx * cp + uz * sp, uz2 = -fx * sp + uz * cp;
  return [rov.x + cy * fx2 - sy * ly, rov.y + sy * fx2 + cy * ly, -rov.depth + uz2];
}

/** The ROV's solid parts in WORLD coordinates as [a, b, radius, tag] (tag: "frame" | "thruster" | "nose" | "claw"). Cached per pose. */
export function capsules(rov) {
  const key = [rov.x, rov.y, rov.depth, rov.yaw, rov.pitch, rov.claw, rov.tool];
  const cached = rov._shape_cache;
  if (cached && cached[0].every((v, i) => v === key[i])) return cached[1];
  const cy = Math.cos(rov.yaw), sy = Math.sin(rov.yaw), cp = Math.cos(rov.pitch), sp = Math.sin(rov.pitch);
  const baseUp = -rov.depth;
  const W = (fx, ly, uz) => {
    const fx2 = fx * cp + uz * sp, uz2 = -fx * sp + uz * cp;
    return [rov.x + cy * fx2 - sy * ly, rov.y + sy * fx2 + cy * ly, baseUp + uz2];
  };
  const out = [];
  const add = (a, b, r, tag) => out.push([W(...a), W(...b), r, tag]);

  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {            // the 12 pipes of the cube
    add([-H, s1 * H, s2 * H], [H, s1 * H, s2 * H], PIPE_R, "frame");
    add([s1 * H, -H, s2 * H], [s1 * H, H, s2 * H], PIPE_R, "frame");
    add([s1 * H, s2 * H, -H], [s1 * H, s2 * H, H], PIPE_R, "frame");
  }
  for (const sgn of [-1, 1]) add([-H, sgn * H, 0], [H, sgn * H, 0], PIPE_R, "frame");      // the side rails
  add([0.15, 0, H - 0.05], [0.21, 0, H - 0.05], 0.026, "frame");                          // the camera housing
  add([0, -H, -H], [0, H, -H], PIPE_R, "frame");                                          // bottom crossbars
  add([-H, 0, -H], [H, 0, -H], PIPE_R, "frame");
  for (const sgn of [-1, 1]) {                                                            // t1 and t2: body and rear shroud
    add([-0.065, sgn * 0.32, 0], [0.065, sgn * 0.32, 0], 0.036, "thruster");
    add([-0.075, sgn * 0.32, 0], [-0.06, sgn * 0.32, 0], 0.053, "thruster");
  }
  for (const sx of [0.17, -0.17]) {                                                       // t3 and t4: body, shroud, propeller
    add([sx, 0, -0.215], [sx, 0, -0.085], 0.036, "thruster");
    add([sx, 0, -0.09], [sx, 0, -0.07], 0.056, "thruster");
    add([sx, 0, -0.078], [sx, 0, -0.072], 0.08, "thruster");
  }
  if (rov.tool === "nose") {
    for (let i = 0; i < NOSE_PTS.length - 1; i++) {
      const [f0, u0] = NOSE_PTS[i], [f1, u1] = NOSE_PTS[i + 1];
      add([f0, 0, u0], [f1, 0, u1], NOSE_R, "nose");
    }
    const tip = NOSE_PTS[NOSE_PTS.length - 1];
    add([tip[0], 0, tip[1]], [tip[0], 0, tip[1]], 0.02, "nose");                          // the ball at the tip
  } else {
    add([0.25, 0, JAW_Z], [0.37, 0, JAW_Z], 0.013, "claw");                               // arm
    add([0.37, 0, JAW_Z], [0.42, 0, JAW_Z], 0.03, "claw");                                // palm
    const th = JAW_SWING * rov.claw;
    for (const sgn of [1, -1]) {                                                          // +1 = left jaw, -1 = right jaw
      const hinge = [JAW_X0, sgn * JAW_Y0, JAW_Z];
      const end1 = [hinge[0] + JAW_LEN * Math.cos(th), hinge[1] + sgn * JAW_LEN * Math.sin(th), JAW_Z];
      const end2 = [end1[0] + TIP_LEN * Math.cos(th - TIP_BEND), end1[1] + sgn * TIP_LEN * Math.sin(th - TIP_BEND), JAW_Z];
      add(hinge, end1, JAW_HALF, "claw");
      add(end1, end2, JAW_HALF, "claw");
    }
  }
  rov._shape_cache = [key, out];
  return out;
}

/** Shortest distance from a world point to the ROV's surface (negative inside it), and the nearest point: [distance, point]. */
export function distanceToRov(rov, p) {
  let best = [1e9, null];
  for (const [a, b, r] of capsules(rov)) {
    const [q, d] = pointSeg(p, a, b);
    if (d - r < best[0]) best = [d - r, q];
  }
  return best;
}
