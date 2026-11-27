// =============================================================================
// crab.js — OPTIONAL add-on: draws the green crabs on the floor of the shallow end (one or several).
// To remove: delete this file and ../rov_crab.py (and sim/crab.js). app.js loads it with a dynamic import() that quietly does nothing if the
// file is missing. It only looks at state.props entries whose type is "crab", so nothing else in the page knows about crabs.
// The crab is built facing +x (its claws), width along z, up = +y. It walks sideways, so the legs swing while it moves.
// =============================================================================
export class Crabs {
  constructor(scene, THREE) {
    this.scene = scene;
    this.T = THREE;
    this.items = [];
  }

  /** A cylinder from point a to point b (local coordinates), like bar() in app.js. */
  limb(a, b, r, mat) {
    const T = this.T, va = new T.Vector3(...a), vb = new T.Vector3(...b), len = va.distanceTo(vb);
    const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 6), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    return m;
  }

  build(p) {
    const T = this.T, g = new T.Group();
    const shell = new T.MeshStandardMaterial({ color: p.color ?? 0x3f8f3a, roughness: 0.75 });
    const dark = new T.MeshStandardMaterial({ color: 0x2f6a2a, roughness: 0.8 });
    const belly = new T.MeshStandardMaterial({ color: 0xc9c27a, roughness: 0.9 });
    const eye = new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    const ellipsoid = (sx, sy, sz, mat) => new T.Mesh(new T.SphereGeometry(1, 18, 12).scale(sx, sy, sz), mat);

    const top = ellipsoid(0.034, 0.017, 0.043, shell);                  // the carapace: wider than it is long
    g.add(top);
    const under = ellipsoid(0.031, 0.008, 0.039, belly); under.position.y = -0.008; g.add(under);
    for (const s of [-1, 1]) {                                          // two eyes on short stalks, at the front
      g.add(this.limb([0.027, 0.008, s * 0.012], [0.034, 0.019, s * 0.014], 0.0022, dark));
      const e = ellipsoid(0.0058, 0.0058, 0.0058, eye); e.position.set(0.034, 0.021, s * 0.014); g.add(e);
    }
    const claws = [];
    for (const s of [-1, 1]) {                                          // two claws; one bigger, like a real crab
      const big = s > 0 ? 1.0 : 0.75, claw = new T.Group();
      claw.add(this.limb([0.03, -0.002, s * 0.03], [0.058, 0.0, s * 0.034], 0.0035, dark));
      const hand = ellipsoid(0.014 * big, 0.008 * big, 0.0085 * big, shell); hand.position.set(0.068, 0.0, s * 0.034); claw.add(hand);
      const finger = ellipsoid(0.009 * big, 0.003, 0.0035, dark); finger.position.set(0.082 * (0.97 + 0.03 * big), 0.0, s * (0.034 - 0.003)); claw.add(finger);
      g.add(claw); claws.push(claw);
    }
    const legs = [];
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {              // four legs a side: out, then down to the floor
      const leg = new T.Group();
      leg.position.set(0.016 - i * 0.0125, -0.002, s * 0.036);
      leg.add(this.limb([0, 0, 0], [-0.004, 0.006, s * 0.028], 0.0024, dark));
      leg.add(this.limb([-0.004, 0.006, s * 0.028], [-0.008, -0.016, s * 0.040], 0.0021, shell));
      g.add(leg); legs.push({ leg, phase: i * 0.9 + (s > 0 ? Math.PI : 0) });
    }
    this.scene.add(g);
    return { group: g, legs, claws, yaw: p.yaw ?? 0, phase: Math.random() * 6, placed: false };
  }

  update(list, dt, t) {                    // list = state.props from the sim
    const a = 1 - Math.exp(-dt * 12), V = this.T.Vector3;
    (list || []).forEach((p, i) => {
      if (p.type !== "crab") return;
      const it = this.items[i] || (this.items[i] = this.build(p));
      const g = it.group, to = new V(p.x, -p.depth, -p.y);
      if (!it.placed) { g.position.copy(to); it.yaw = p.yaw; it.placed = true; }      // appear in place, do not slide in from the origin
      g.position.lerp(to, a);
      let d = p.yaw - it.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      it.yaw += d * a;
      g.rotation.y = it.yaw;
      it.phase += dt * (p.moving ? 8 + 60 * p.speed : 0);              // the legs only move while it does
      const amp = p.moving ? 0.35 : 0.0;
      for (const { leg, phase } of it.legs) leg.rotation.x = amp * Math.sin(it.phase + phase);
      const wave = p.mode === "scuttle" ? 0.25 * Math.sin(t * 14) : 0.04 * Math.sin(t * 1.5);   // claws held up and shaking when frightened
      it.claws.forEach((c, k) => { c.rotation.z = (p.mode === "scuttle" ? 0.35 : 0.0) + wave * (k ? 1 : -1); });
    });
  }
}
