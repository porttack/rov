// =============================================================================
// jets.js — OPTIONAL add-on: draws the two water outlets in the side wall and the water streaming out of them.
// To remove: delete this file and ../rov_current.py (and sim/current.js). app.js loads it with a dynamic import() that quietly does nothing
// if the file is missing; it only looks at the state.props entry whose type is "jets", so nothing else in the page knows about the current.
//
// The outlets (a flat round plate with a dark opening) are ALWAYS drawn. While the water runs (state.on) the stream is drawn in one of four looks
// (press J to cycle, or flow= in the address): "bubbles" (small bubbles in a fairly narrow plume), "streaks" (thin tracer lines along the flow),
// "rings" (ripple rings that expand as they travel out, like the vortex rings a real jet sheds), and "mix" (rings with a few bubbles; the default).
// Everything moves with the SAME axial water speed the physics uses (u0 / k from the state), so it shows the current the ROV feels. The picture is a
// little NARROWER and straighter than the physical flow (the water really moves more gently over a wider area; that is what a floating ROV feels).
// While it runs, the water surface above the stream is also ruffled now and then (opts.ripple).
// =============================================================================
const LOOKS = ["bubbles", "streaks", "rings", "mix"];
const BUBBLES = 260, STREAKS = 110, MAX_RINGS = 9;
const VIS_BUBBLE = 0.5, VIS_STREAK = 0.35, VIS_RING = 0.12;     // how narrow the picture is next to the physical jet (b = r0 + spread * s)

export class Jets {
  /** `opts.ripple(x, z, radius, strength)` disturbs the water surface where the stream wells up (the page owns the wave simulation);
   *  `opts.look` is the starting look. */
  constructor(scene, THREE, opts = {}) {
    this.scene = scene;
    this.T = THREE;
    this.sys = null;
    this.ripple = opts.ripple || null;
    this.rippleT = 0;
    this.look = LOOKS.includes(opts.look) ? opts.look : "mix";
  }

  /** Choose a look by name (ignored if it is not one of the four). */
  setLook(name) { if (LOOKS.includes(name)) this.look = name; return this.look; }

  /** Next look; returns its name. */
  cycleLook() { this.look = LOOKS[(LOOKS.indexOf(this.look) + 1) % LOOKS.length]; return this.look; }

  gauss() { let u = 0; for (let i = 0; i < 4; i++) u += Math.random(); return (u - 2) * 1.7320508; }      // ~ a normal random number (sum of 4 uniforms)

  /** A soft round dot, so a bubble that is close to the camera looks like a bubble and not a hard square. */
  bubbleTexture() {
    if (this._tex) return this._tex;
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const g = c.getContext("2d"), grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.55, "rgba(255,255,255,0.55)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    return (this._tex = new this.T.CanvasTexture(c));
  }

  /** Take the outlets and the water out of the scene (to be built again somewhere else). */
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.group = null; this.sys = null;
  }

  build(p) {
    const T = this.T, group = new T.Group();
    const rim = new T.MeshStandardMaterial({ color: 0xe0e6ea, roughness: 0.35, metalness: 0.3 }), hole = new T.MeshBasicMaterial({ color: 0x0a2030 });
    const unitTorus = new T.TorusGeometry(1, 0.03, 8, 56);                  // one ring, scaled to its radius
    const sys = [];
    for (const o of p.outlets) {
      const dir = new T.Vector3(o.dx, 0, -o.dy).normalize();                // sim (x, y) is three (x, -z)
      const side = new T.Vector3(-dir.z, 0, dir.x);                         // across the pool, level
      const origin = new T.Vector3(o.x, -o.depth, -o.y);
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
      const plate = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.012, 32), rim);       // a flat round cover plate on the wall ...
      plate.position.copy(origin).addScaledVector(dir, 0.012); plate.quaternion.copy(q);
      const mouth = new T.Mesh(new T.CircleGeometry(0.05, 32), hole);                       // ... with the dark opening in the middle (nothing sticks out of the wall)
      mouth.position.copy(origin).addScaledVector(dir, 0.0195); mouth.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir);
      group.add(plate, mouth);

      // bubbles
      const bgeo = new T.BufferGeometry(), bpos = new Float32Array(BUBBLES * 3);
      bgeo.setAttribute("position", new T.BufferAttribute(bpos, 3));
      const bubbles = new T.Points(bgeo, new T.PointsMaterial({ color: 0xdcf2ff, size: 0.05, map: this.bubbleTexture(), transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true }));
      bubbles.frustumCulled = false;
      // streaks: thin lines that fade out toward their tail
      const sgeo = new T.BufferGeometry(), spos = new Float32Array(STREAKS * 6), scol = new Float32Array(STREAKS * 8);
      for (let i = 0; i < STREAKS; i++) scol.set([0.9, 0.98, 1, 0.0, 0.9, 0.98, 1, 1.0], i * 8);      // tail transparent, head bright
      sgeo.setAttribute("position", new T.BufferAttribute(spos, 3));
      sgeo.setAttribute("color", new T.BufferAttribute(scol, 4));
      const streaks = new T.LineSegments(sgeo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
      streaks.frustumCulled = false;
      // rings
      const ringGroup = new T.Group();
      const rings = [];
      for (let i = 0; i < MAX_RINGS; i++) {
        const mat = new T.MeshBasicMaterial({ color: 0xcdeeff, transparent: true, opacity: 0, depthWrite: false });
        const m = new T.Mesh(unitTorus, mat);
        m.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir);       // the ring faces along the stream
        m.visible = false;
        ringGroup.add(m);
        rings.push({ mesh: m, mat, s: -1 });
      }
      group.add(bubbles, streaks, ringGroup);

      const j = { o, dir, side, origin, bubbles, bpos, bgeo, bs: new Float32Array(BUBBLES), blx: new Float32Array(BUBBLES), bly: new Float32Array(BUBBLES),
        streaks, spos, sgeo, ss: new Float32Array(STREAKS), slx: new Float32Array(STREAKS), sly: new Float32Array(STREAKS),
        rings, ringGroup, nextRing: 0 };
      for (let i = 0; i < BUBBLES; i++) this.respawnBubble(j, i, 0.04 + Math.random() * p.length * 0.6);
      for (let i = 0; i < STREAKS; i++) this.respawnStreak(j, i, 0.04 + Math.random() * p.length * 0.7);
      sys.push(j);
    }
    this.scene.add(group);
    this.group = group;
    this.sys = sys;
  }

  respawnBubble(j, i, s = 0.04) { j.bs[i] = s; j.blx[i] = this.gauss(); j.bly[i] = this.gauss(); }
  respawnStreak(j, i, s = 0.04) { j.ss[i] = s; j.slx[i] = this.gauss(); j.sly[i] = this.gauss(); }

  /** Axial water speed, s metres from the nozzle: the physics' own formula. */
  axial(p, s) { return s * p.u0 <= p.k ? p.u0 : p.k / s; }

  update(list, dt) {                       // list = state.props from the sim
    const p = (list || []).find((q) => q.type === "jets");
    if (!p) { if (this.group) this.group.visible = false; return; }
    const where = JSON.stringify(p.outlets.map((o) => [o.x, o.y, o.depth, o.dx, o.dy]));
    if (this.sys && where !== this.where) this.dispose();                  // the outlets moved (the pool was resized): draw them where they are now
    if (!this.sys) { this.build(p); this.where = where; }
    this.group.visible = true;
    const on = !!p.on, showBubbles = on && (this.look === "bubbles" || this.look === "mix"), showStreaks = on && this.look === "streaks", showRings = on && (this.look === "rings" || this.look === "mix");
    for (const j of this.sys) { j.bubbles.visible = showBubbles; j.streaks.visible = showStreaks; j.ringGroup.visible = showRings; }
    if (!on) return;                                                       // the outlets are always drawn; the water only while it runs
    dt = Math.min(dt, 0.05);
    const floorY = -(p.floor - 0.05), topY = -0.04;                        // keep everything drawn inside the water
    const clampY = (y) => Math.min(topY, Math.max(floorY, y));

    for (const j of this.sys) {
      const dir = j.dir, side = j.side, org = j.origin;
      if (showBubbles) {
        for (let i = 0; i < BUBBLES; i++) {
          let s = j.bs[i];
          const b = (p.r0 + p.spread * s) * VIS_BUBBLE, bx = j.blx[i] * b * Math.SQRT1_2, by = j.bly[i] * b * Math.SQRT1_2;
          s += this.axial(p, s) * Math.exp(-(bx * bx + by * by) / (b * b * 2.2)) * dt;         // the core is fastest
          if (s > p.length) { this.respawnBubble(j, i); s = 0.04; }
          j.bs[i] = s;
          const b2 = (p.r0 + p.spread * s) * VIS_BUBBLE, ox = j.blx[i] * b2 * Math.SQRT1_2, oy = j.bly[i] * b2 * Math.SQRT1_2;
          j.bpos[i * 3] = org.x + dir.x * s + side.x * ox;
          j.bpos[i * 3 + 1] = clampY(org.y + oy);
          j.bpos[i * 3 + 2] = org.z + dir.z * s + side.z * ox;
        }
        j.bgeo.attributes.position.needsUpdate = true;
      }
      if (showStreaks) {
        for (let i = 0; i < STREAKS; i++) {
          let s = j.ss[i];
          const b = (p.r0 + p.spread * s) * VIS_STREAK, ox = j.slx[i] * b * Math.SQRT1_2, oy = j.sly[i] * b * Math.SQRT1_2;
          const u = this.axial(p, s) * Math.exp(-(ox * ox + oy * oy) / (b * b * 2.2));
          s += u * dt;
          if (s > p.length) { this.respawnStreak(j, i); s = 0.04; }
          j.ss[i] = s;
          const b2 = (p.r0 + p.spread * s) * VIS_STREAK, px = j.slx[i] * b2 * Math.SQRT1_2, py = j.sly[i] * b2 * Math.SQRT1_2;
          const len = 0.1 + 0.7 * Math.min(1, this.axial(p, s) / p.u0);          // faster water: a longer streak
          const y = clampY(org.y + py);
          for (let e = 0; e < 2; e++) {                                           // vertex 0 = the tail, vertex 1 = the head
            const sv = e === 0 ? Math.max(0.04, s - len) : s;
            j.spos[i * 6 + e * 3] = org.x + dir.x * sv + side.x * px;
            j.spos[i * 6 + e * 3 + 1] = y;
            j.spos[i * 6 + e * 3 + 2] = org.z + dir.z * sv + side.z * px;
          }
        }
        j.sgeo.attributes.position.needsUpdate = true;
      }
      if (showRings) {
        j.emit = (j.emit ?? 0) + dt;
        if (j.emit > 0.8) {                                                   // a new ring leaves the outlet now and then
          j.emit = 0;
          const slot = j.rings.find((r) => r.s < 0);
          if (slot) slot.s = 0.05;
        }
        for (const r of j.rings) {
          if (r.s < 0) { r.mesh.visible = false; continue; }
          r.s += (0.3 + 0.55 * this.axial(p, r.s)) * dt;                          // a ring travels along with the stream (and does not stall as it slows, or they would bunch up)
          if (r.s > p.length) { r.s = -1; r.mesh.visible = false; continue; }
          const room = Math.min(j.o.depth - 0.04, p.floor - j.o.depth - 0.04);  // it must not grow out of the water
          const R = Math.max(0.03, Math.min(p.r0 * 1.2 + VIS_RING * r.s, room));
          r.mesh.visible = true;
          r.mesh.position.set(org.x + dir.x * r.s, org.y, org.z + dir.z * r.s);
          r.mesh.scale.set(R, R, R);
          r.mat.opacity = 0.5 * Math.min(1, r.s / 0.25) * (1 - 0.8 * r.s / p.length);
        }
      }
    }

    if (this.ripple) {                                                     // the stream wells up and ruffles the surface above it, mostly over the upper jet, further out
      this.rippleT += dt;
      while (this.rippleT > 0.12) {
        this.rippleT -= 0.12;
        for (const j of this.sys) {
          const s = 0.5 + Math.random() * (p.length * 0.8 - 0.5), b = p.r0 + p.spread * s, depth = -j.origin.y;
          if (Math.random() > Math.exp(-(depth * depth) / (b * b))) continue;       // the deeper the jet and the narrower the stream, the less it reaches the surface
          const lat = this.gauss() * b * Math.SQRT1_2;
          this.ripple(j.origin.x + j.dir.x * s + j.side.x * lat, j.origin.z + j.dir.z * s + j.side.z * lat, 0.05, 0.12);
        }
      }
    }
  }
}
