// =============================================================================
// eel.js — an easter egg (not documented on purpose): draws the eel, the flash and sparks when it bites, and the smoke from the stunned ROV.
// To remove: delete this file and sim/eel.js. app.js loads it with a dynamic import() that quietly does nothing if the file is missing.
// Sim coordinates (x ahead, y left, depth down) -> three.js (x, -depth, -y).
// =============================================================================
const SMOKE_MAX = 70;
let sfx = null;                      // sound effects (sfx.js): optional, loaded once
import("./sfx.js").then((m) => { sfx = m; }).catch(() => { /* no sound */ });

export class Eels {
  constructor(scene, THREE) {
    this.scene = scene;
    this.T = THREE;
    this.body = null;
    this.smoke = [];                 // sprites, reused
    this.smokeAcc = 0;
    this.sparkAcc = 0;
    this.arcsAt = 0;

    const T = THREE;
    // ---- sparks: short-lived bright points, and a few jagged lightning arcs from the eel to the ROV's frame
    const NS = 90;
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(new Float32Array(NS * 3).fill(0).map((_, i) => (i % 3 === 1 ? -1000 : 0)), 3));
    this.sparks = {
      n: NS, next: 0, life: new Float32Array(NS), vel: new Float32Array(NS * 3),
      pts: new T.Points(geo, new T.PointsMaterial({ color: 0xfff2a8, size: 0.09, map: this._glowTex(), transparent: true, opacity: 1, depthWrite: false, alphaTest: 0.02, blending: T.AdditiveBlending })),
    };
    this.sparks.pts.frustumCulled = false;
    scene.add(this.sparks.pts);
    this.NA = 8; this.SEG = 7;       // arcs, and straight pieces per arc
    const ag = new T.BufferGeometry();
    ag.setAttribute("position", new T.BufferAttribute(new Float32Array(this.NA * this.SEG * 2 * 3), 3));
    this.arcs = new T.LineSegments(ag, new T.LineBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.95, depthWrite: false, blending: T.AdditiveBlending }));
    this.arcs.frustumCulled = false; this.arcs.visible = false;
    scene.add(this.arcs);
    this.light = new T.PointLight(0x9fd8ff, 0, 4, 2);
    scene.add(this.light);

    // ---- smoke: a soft grey puff (drawn once on a canvas)
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, "rgba(255,255,255,0.9)"); grad.addColorStop(0.5, "rgba(255,255,255,0.45)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    this.puffTex = new T.CanvasTexture(c);
  }

  _glowTex() {                           // a small round glow for the sparks (a plain point would be a square)
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const g = c.getContext("2d"), grad = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.35, "rgba(255,255,255,0.7)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    return new this.T.CanvasTexture(c);
  }

  /** A cylinder link (unit height along +Y) between two points; radii taper from a to b. Built once, scaled and turned each frame. */
  _build() {
    const T = this.T, g = new T.Group();
    const skin = new T.MeshStandardMaterial({ color: 0x4b4a33, roughness: 0.55 });
    const belly = new T.MeshStandardMaterial({ color: 0xd9822b, roughness: 0.6 });
    const N = 18, joints = [], links = [];
    for (let i = 0; i < N; i++) {
      const r = this._radius(i, N);
      const j = new T.Mesh(new T.SphereGeometry(1, 12, 9), i === 0 ? skin : (i % 3 === 0 ? belly : skin));
      j.scale.setScalar(r); g.add(j); joints.push({ mesh: j, r });
    }
    for (let i = 0; i < N - 1; i++) {
      const l = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 10, 1, true), skin);
      g.add(l); links.push(l);
    }
    const eyeMat = new T.MeshStandardMaterial({ color: 0xffe14a, emissive: 0x665500, roughness: 0.3 });
    const eyes = [-1, 1].map(() => { const e = new T.Mesh(new T.SphereGeometry(0.011, 8, 6), eyeMat); g.add(e); return e; });
    this.scene.add(g);
    return { group: g, joints, links, eyes, N };
  }
  _radius(i, N) { const u = i / (N - 1); return i === 0 ? 0.05 : 0.048 * Math.pow(1 - u, 0.55) + 0.008; }   // fat head end, thin tail

  update(list, dt, t, rov3) {            // list = state.props; rov3 = the ROV's three.js group
    const T = this.T, V = T.Vector3, e = (list || []).find((p) => p.type === "eel");
    if (!e) return;
    // ---- the eel
    if (e.segs.length) {
      if (!this.body) this.body = this._build();
      const b = this.body, wall = e.outlet ? e.outlet.y : 1e9, ox = e.outlet ? e.outlet.x : 0;          // (what is in the wall is hidden: the body slides into the hole)
      const pts = e.segs.map((s) => new V(s[0], -s[2], -(Math.abs(s[0] - ox) < 0.6 ? Math.min(s[1], wall) : s[1])));          // (only at the hole: the shallow end really is beyond that line)
      const swim = e.mode === "chase" || e.mode === "leave" || e.mode === "enter", amp = swim ? 0.06 : 0.02;
      const side = new V();
      pts.forEach((p, i) => {                                                      // a swimming wiggle across the body, travelling tail-ward
        const a = i > 0 ? pts[i - 1] : pts[1] || p, c = i < pts.length - 1 ? pts[i + 1] : p;
        side.set(a.z - c.z, 0, c.x - a.x);                                        // sideways: perpendicular to the body in the floor plane
        if (side.lengthSq() > 1e-9) side.normalize();
        p.addScaledVector(side, amp * Math.sin(e.phase * 9 - i * 0.7) * Math.min(1, i / 3) * (1 - i / pts.length * 0.4));
      });
      b.group.visible = true;
      pts.forEach((p, i) => b.joints[i].mesh.position.copy(p));
      b.links.forEach((l, i) => {
        const a = pts[i], c = pts[i + 1], len = a.distanceTo(c);
        l.position.copy(a).add(c).multiplyScalar(0.5);
        l.quaternion.setFromUnitVectors(new V(0, 1, 0), c.clone().sub(a).normalize());
        const ra = b.joints[i].r, rc = b.joints[i + 1].r, rm = (ra + rc) / 2;
        l.scale.set(rm, Math.max(len, 1e-4), rm);
      });
      const h = pts[0], fwd = new V(e.dir[0], -e.dir[2], -e.dir[1]).normalize(), up = new V(0, 1, 0), right = new V().crossVectors(fwd, up).normalize();
      b.eyes.forEach((m, k) => m.position.copy(h).addScaledVector(fwd, 0.036).addScaledVector(up, 0.03).addScaledVector(right, (k ? 1 : -1) * 0.03));
    } else if (this.body) this.body.group.visible = false;

    // ---- sparks and arcs while it zaps
    const centre = rov3 ? rov3.position : new V();
    const zap = e.zap > 0;
    this._sparks(zap, dt, e, centre, rov3);
    this._arcs(zap, t, e, centre);
    if (sfx) sfx.zap(zap);
    this.light.position.copy(centre);
    this.light.intensity = zap ? (Math.random() < 0.6 ? 2 + 6 * Math.random() : 0.2) : 0;

    // ---- smoke from the dead ROV
    this._smoke(e.dead, dt, t, centre);
  }

  _sparks(zap, dt, e, centre, rov3) {
    const S = this.sparks, pa = S.pts.geometry.attributes.position;
    if (zap) {
      this.sparkAcc += dt * 140;
      while (this.sparkAcc >= 1) {
        this.sparkAcc -= 1;
        const i = S.next; S.next = (S.next + 1) % S.n;
        const s = e.segs[Math.floor(Math.random() * e.segs.length)] || [0, 0, 0];
        const onEel = Math.random() < 0.5;
        const x = onEel ? s[0] : centre.x + (Math.random() - 0.5) * 0.55, y = onEel ? -s[2] : centre.y + (Math.random() - 0.5) * 0.55, z = onEel ? -s[1] : centre.z + (Math.random() - 0.5) * 0.55;
        pa.setXYZ(i, x, y, z);
        S.vel[i * 3] = (Math.random() - 0.5) * 1.6; S.vel[i * 3 + 1] = (Math.random() - 0.5) * 1.6; S.vel[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
        S.life[i] = 0.12 + Math.random() * 0.3;
      }
    }
    for (let i = 0; i < S.n; i++) {
      if (S.life[i] <= 0) { pa.setY(i, -1000); continue; }
      S.life[i] -= dt;
      pa.setXYZ(i, pa.getX(i) + S.vel[i * 3] * dt, pa.getY(i) + S.vel[i * 3 + 1] * dt, pa.getZ(i) + S.vel[i * 3 + 2] * dt);
      if (S.life[i] <= 0) pa.setY(i, -1000);
    }
    pa.needsUpdate = true;
  }

  _arcs(zap, t, e, centre) {
    this.arcs.visible = zap;
    if (!zap || t - this.arcsAt < 0.045) return;                                   // new lightning shapes about 20 times a second
    this.arcsAt = t;
    const pa = this.arcs.geometry.attributes.position, V = this.T.Vector3;
    let k = 0;
    for (let a = 0; a < this.NA; a++) {
      const s = e.segs[Math.floor(Math.random() * e.segs.length)] || [0, 0, 0];
      const from = new V(s[0], -s[2], -s[1]);
      const to = new V(centre.x + (Math.random() - 0.5) * 0.5, centre.y + (Math.random() - 0.5) * 0.5, centre.z + (Math.random() - 0.5) * 0.5);
      let prev = from;
      for (let j = 1; j <= this.SEG; j++) {
        const u = j / this.SEG, p = from.clone().lerp(to, u);
        if (j < this.SEG) p.add(new V((Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.14));
        pa.setXYZ(k++, prev.x, prev.y, prev.z); pa.setXYZ(k++, p.x, p.y, p.z);
        prev = p;
      }
    }
    pa.needsUpdate = true;
  }

  _smoke(dead, dt, t, centre) {
    const T = this.T;
    if (dead) {
      this.smokeAcc += dt * 22;
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        let s = this.smoke.find((q) => q.life <= 0);
        if (!s) {
          if (this.smoke.length >= SMOKE_MAX) break;
          s = new T.Sprite(new T.SpriteMaterial({ map: this.puffTex, color: 0x1c1c1c, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
          s.life = 0; s.renderOrder = 10; this.scene.add(s); this.smoke.push(s);
        }
        s.position.set(centre.x + (Math.random() - 0.5) * 0.35, centre.y + (Math.random() - 0.5) * 0.3, centre.z + (Math.random() - 0.5) * 0.35);
        s.life = s.maxLife = 4 + Math.random() * 3;
        s.drift = [(Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08];
        s.visible = true;
      }
    }
    for (const s of this.smoke) {
      if (s.life <= 0) { s.visible = false; continue; }
      s.life -= dt;
      const age = 1 - s.life / s.maxLife;                                           // 0 at birth .. 1 at the end
      s.position.y += (0.22 + 0.2 * Math.random() * 0.2) * dt;                      // rises, slowly (it is smoke in water, then in air)
      s.position.x += s.drift[0] * dt; s.position.z += s.drift[1] * dt;
      s.scale.setScalar(0.18 + 0.7 * age);
      s.material.opacity = 0.85 * Math.sin(Math.min(1, age * 4) * Math.PI / 2) * (1 - age);
    }
  }
}
