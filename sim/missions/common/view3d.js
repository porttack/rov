// view3d.js — small three.js helpers for drawing mission props (pipes, caps, labels). Each takes THREE as its first argument so no import is needed here.
/** A cylinder (pipe) from point a to point b ([x, y, z] arrays, three.js axes), radius r. */
export function pipe(T, a, b, r, mat, seg = 10) {
  const va = new T.Vector3(...a), vb = new T.Vector3(...b), len = va.distanceTo(vb);
  const m = new T.Mesh(new T.CylinderGeometry(r, r, Math.max(len, 1e-4), seg), mat);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return m;
}
export const PVC_R = 0.0107;                          // 1/2" PVC pipe: 21.3 mm across
export const standard = (T, color, rough = 0.55) => new T.MeshStandardMaterial({ color, roughness: rough });
