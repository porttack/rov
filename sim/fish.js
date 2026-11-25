// =============================================================================
// fish.js — OPTIONAL add-on: draws the coy fish (see ../rov_fish.py)
// =============================================================================
// To remove: delete this file and ../rov_fish.py. app.js loads it with a dynamic import() that quietly does
// nothing if the file is missing. It draws every item of type "fish" in state.props (props.js ignores those).
//
// The body is an ellipsoid whose vertices are bent by a travelling sine wave every frame (the tail end swings most),
// with a forked tail fin, a dorsal fin, two pectoral fins that flap, and two eyes. Faster swimming = faster tail.
// =============================================================================
export class Fish {
  constructor(scene, THREE) {
    this.scene = scene;
    this.T = THREE;
    this.items = [];
  }

  build(p) {
    const T = this.T, base = new T.Color(p.color ?? 0xff7a2a), white = new T.Color(0xf8f4ea), dark = new T.Color(0x2b1a12);
    const A = 0.18, B = 0.055, C = 0.045;                                  // body half-length, half-height, half-width
    const geo = new T.SphereGeometry(1, 28, 18);
    const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), rest = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const nx = pos.getX(i), tail = (1 - nx) / 2;                         // tail = 0 at the nose .. 1 at the tail end
      const taper = 1 - 0.6 * Math.pow(Math.max(0, tail - 0.35) / 0.65, 1.4);   // slim down toward the tail
      const x = nx * A, y = pos.getY(i) * B * taper, z = pos.getZ(i) * C * taper;
      rest[i * 3] = x; rest[i * 3 + 1] = y; rest[i * 3 + 2] = z;
      const n = Math.sin(x * 26 + 1.3) * Math.sin(z * 38 + y * 20) + 0.6 * Math.sin(y * 50 + x * 10);
      const col = n > 0.42 ? white : n < -0.6 ? dark : base;               // koi blotches
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute("color", new T.BufferAttribute(colors, 3));
    const group = new T.Group();
    const body = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 }));
    body.frustumCulled = false;
    group.add(body);

    const fin = new T.MeshStandardMaterial({ color: base, roughness: 0.6, transparent: true, opacity: 0.85, side: T.DoubleSide });
    const shape = (pts) => { const s = new T.Shape(); pts.forEach(([x, y], k) => (k ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return new T.ShapeGeometry(s); };
    const tailPivot = new T.Group();                                       // tail fin, hinged at the end of the body
    tailPivot.position.x = -A * 0.95;
    tailPivot.add(new T.Mesh(shape([[0, 0], [-0.14, 0.095], [-0.095, 0], [-0.14, -0.095]]), fin));
    group.add(tailPivot);
    const dorsal = new T.Mesh(shape([[0.04, 0], [-0.02, 0.075], [-0.1, 0]]), fin);
    dorsal.position.y = B * 0.85;
    group.add(dorsal);
    const pects = [1, -1].map((sd) => {                                    // pectoral fins, flapping
      const holder = new T.Group();
      holder.position.set(0.07, -0.015, sd * C * 0.8);
      const f = new T.Mesh(shape([[0, 0], [-0.07, 0.0], [-0.04, -0.05]]), fin);
      f.rotation.x = Math.PI / 2;
      holder.add(f);
      holder.userData.side = sd;
      group.add(holder);
      return holder;
    });
    const eyeMat = new T.MeshStandardMaterial({ color: 0x101010, roughness: 0.3 });
    for (const sd of [1, -1]) {
      const e = new T.Mesh(new T.SphereGeometry(0.0095, 10, 8), eyeMat);
      e.position.set(A * 0.72, B * 0.25, sd * C * 0.78);
      group.add(e);
    }
    group.rotation.order = "YXZ";
    group.position.set(p.x, -p.depth, -p.y);
    this.scene.add(group);
    return { group, geo, rest, tailPivot, pects, phase: Math.random() * 6, yaw: p.yaw, A };
  }

  update(list, dt, t) {                    // list = state.props from the sim
    const a = 1 - Math.exp(-dt * 18);
    (list || []).forEach((p, i) => {
      if (p.type !== "fish") return;
      const it = this.items[i] || (this.items[i] = this.build(p));
      const g = it.group;
      g.position.lerp(new this.T.Vector3(p.x, -p.depth, -p.y), a);
      let d = p.yaw - it.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      it.yaw += d * a;
      g.rotation.y = it.yaw;
      g.rotation.z = -p.pitch;             // pitch is nose-down positive, like the ROV
      // tail beat: faster and bigger when swimming fast
      const sp = Math.min(p.speed / 1.2, 1.5);
      it.phase += dt * (2.5 + 9 * sp);
      const amp = 0.012 + 0.032 * Math.min(1, sp);
      const pos = it.geo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const x = it.rest[k * 3], tail = (1 - x / it.A) / 2;               // 0 nose .. 1 tail end
        pos.setXYZ(k, x, it.rest[k * 3 + 1], it.rest[k * 3 + 2] + amp * tail * tail * Math.sin(it.phase - 7 * tail));
      }
      pos.needsUpdate = true;
      it.geo.computeVertexNormals();
      it.tailPivot.position.z = amp * Math.sin(it.phase - 7);
      it.tailPivot.rotation.y = 0.9 * amp / 0.04 * Math.cos(it.phase - 7) * 0.5;
      for (const h of it.pects) h.rotation.x = h.userData.side * (0.25 + 0.2 * Math.sin(it.phase * 0.6));
    });
  }
}
