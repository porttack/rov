// scenery.js — a little quiet scenery far from the pool: a ring of grass beyond the edge of the deck, and a koi pond out in the grass with a few slowly swimming koi.
// An OPTIONAL add-on: app.js loads it with a dynamic import() that quietly does nothing if the file is missing (delete it to remove the scenery); ?scenery=off hides it.
// buildScenery(THREE, deck, cx) -> { group, update(t) }. `deck` = { x0, x1, z0, z1 }: the outer edge of the pool deck (three.js axes, the deck is at y = 0.01). The grass lies at y = 0 OUTSIDE it.
const GRASS = 0x7bb661;

function noiseTexture(THREE, size = 128) {                        // a soft mottled green, repeated over the grass
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#7bb661"; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 700; i++) {
    const l = 50 + Math.random() * 14;
    g.fillStyle = `hsla(${92 + Math.random() * 18}, ${38 + Math.random() * 14}%, ${l}%, .35)`;
    g.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

export function buildScenery(THREE, deck, cx = 0) {
  const group = new THREE.Group(); group.name = "scenery";
  const base = noiseTexture(THREE), GRASS_W = 22;
  const strip = (x0, x1, z0, z1) => {                              // one rectangle of grass; its texture repeats about every 4 m
    const w = x1 - x0, h = z1 - z0, tex = base.clone(); tex.needsUpdate = true; tex.repeat.set(w / 4, h / 4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffffff, map: tex }));
    m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); group.add(m);
  };
  const [X0, X1, Z0, Z1] = [deck.x0 - GRASS_W, deck.x1 + GRASS_W, deck.z0 - GRASS_W, deck.z1 + GRASS_W];
  strip(X0, X1, Z0, deck.z0); strip(X0, X1, deck.z1, Z1);          // the grass is a ring around the deck (a plane over the whole ground would cover the pool)
  strip(X0, deck.x0, deck.z0, deck.z1); strip(deck.x1, X1, deck.z0, deck.z1);
  const edge = new THREE.MeshLambertMaterial({ color: 0xb9b4a6 });  // a thin concrete kerb where the deck ends
  for (const [w, d, x, z] of [[deck.x1 - deck.x0 + 0.6, 0.3, (deck.x0 + deck.x1) / 2, deck.z0 - 0.15], [deck.x1 - deck.x0 + 0.6, 0.3, (deck.x0 + deck.x1) / 2, deck.z1 + 0.15], [0.3, deck.z1 - deck.z0, deck.x0 - 0.15, (deck.z0 + deck.z1) / 2], [0.3, deck.z1 - deck.z0, deck.x1 + 0.15, (deck.z0 + deck.z1) / 2]]) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), edge); k.position.set(x, 0.02, z); group.add(k);
  }

  // ---- the koi pond, out in the grass behind the pool (as the Orbit view sees it)
  const px = cx + 2, pz = deck.z0 - 7, RX = 2.6, RZ = 1.7;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1c5f68 }));
  bottom.scale.set(RX, 1, RZ); bottom.position.set(px, 0.012, pz); group.add(bottom);
  const stones = new THREE.MeshLambertMaterial({ color: 0x9a9a94 });
  for (let k = 0; k < 22; k++) {                                    // rim stones
    const a = k / 22 * Math.PI * 2, s = 0.17 + 0.07 * ((k * 7) % 3) / 2;
    const st = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), stones); st.scale.set(s * 1.3, s * 0.7, s);
    st.position.set(px + (RX + 0.1) * Math.cos(a), 0.05, pz + (RZ + 0.1) * Math.sin(a)); st.rotation.y = a; group.add(st);
  }
  const kois = [];
  const KOI = [[0xff7a1a, 0xffffff], [0xffffff, 0xff7a1a], [0xf2b705, 0xffffff], [0x2b2b2b, 0xff7a1a], [0xff5a2a, 0xffd9b0]];
  KOI.forEach(([body, spot], i) => {
    const f = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshLambertMaterial({ color: body })); m.scale.set(0.32, 0.07, 0.1); f.add(m);
    const sp = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: spot })); sp.scale.set(0.1, 0.075, 0.07); sp.position.set(0.02, 0.012, 0.02); f.add(sp);
    const tail = new THREE.Group(); tail.position.set(-0.3, 0, 0);
    const tm = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 6).rotateZ(Math.PI / 2).translate(-0.1, 0, 0), new THREE.MeshLambertMaterial({ color: body })); tm.scale.set(1, 0.4, 1); tail.add(tm); f.add(tail);
    f.position.y = 0.04; group.add(f);
    kois.push({ f, tail, rx: RX * (0.45 + 0.1 * (i % 3)), rz: RZ * (0.45 + 0.1 * ((i + 1) % 3)), w: (0.16 + 0.03 * i) * (i % 2 ? -1 : 1), ph: i * 1.3 });
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6cc4cf, transparent: true, opacity: 0.5, depthWrite: false }));
  water.scale.set(RX, 1, RZ); water.position.set(px, 0.07, pz); water.renderOrder = 2; group.add(water);
  const pad = new THREE.MeshLambertMaterial({ color: 0x3f9a4a, side: THREE.DoubleSide });
  for (const [dx, dz, r] of [[-1.2, 0.5, 0.32], [1.4, -0.6, 0.28], [0.3, 1.0, 0.22], [-0.4, -1.0, 0.26]]) {          // lily pads
    const p = new THREE.Mesh(new THREE.CircleGeometry(r, 14).rotateX(-Math.PI / 2), pad); p.position.set(px + dx, 0.08, pz + dz); group.add(p);
  }
  return {
    group,
    update(t) {                                                      // the koi swim slowly round the pond, each on its own loop
      for (const k of kois) {
        const a = k.ph + t * k.w, dx = -Math.sin(a) * k.rx * k.w, dz = Math.cos(a) * k.rz * k.w;
        k.f.position.set(px + Math.cos(a) * k.rx, 0.04, pz + Math.sin(a) * k.rz);
        k.f.rotation.y = -Math.atan2(dz, dx);                        // head along the way it is going
        k.tail.rotation.y = Math.sin(t * 4 + k.ph) * 0.45;
      }
    },
  };
}
