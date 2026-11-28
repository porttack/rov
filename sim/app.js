// 3D pool + PVC-cube ROV. Receives state from rov_sim.py over Server-Sent Events.
// Coordinates: sim x = forward, y = left, depth = down  ->  three.js (x, -depth, -y).
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { GAME_KEYS, SWITCHES, computeCommand, switchPositions, switchValues } from "./controls.js";
import { MAX_RINGS, parseConfig, toQuery, poolSizeText, startView } from "./config.js";
import { layoutFor } from "./sim/physics.js";
import { deckEye, nearestSide } from "./deckcam.js";                      // (the thruster layouts: the same table the server uses; the state carries its own)

// Which simulation? A Python server answers GET ping -> talk to it; a plain web host (GitHub Pages...) does not -> run the sim in this page.
// Override with ?mode=local or ?mode=server.
async function pickBackend() {
  const want = new URLSearchParams(location.search).get("mode");
  let server = want === "server";
  if (!want) { try { server = (await fetch("ping", { cache: "no-store" })).ok; } catch (e) { server = false; } }
  return server ? import("./backend-net.js") : import("./backend-local.js");
}
const backend = await pickBackend();
const cfg = parseConfig(location.search);                 // ?controls= ?camera= ... and ?config (see config.js); the pool, rings and fish are read by backend-local.js
if (cfg.controls === "h-hidden") document.body.classList.add("bare");      // H-circuit only, and every other control hidden (CSS: body.bare)

const $ = (id) => document.getElementById(id);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
let maxPR = 2;                                       // quality tiers lower this (see "quality" at the bottom)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPR));
document.body.prepend(renderer.domElement);
// picture of the scene WITHOUT the water surface; the refraction shader samples it
// (with its depth, so the water shader knows how deep each thing seen through the surface really is)
const rtDepth = new THREE.DepthTexture(256, 256);
const rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, depthTexture: rtDepth });
const scene = new THREE.Scene();
const SKY = new THREE.Color(0xbfe3f5), WATER = new THREE.Color(0x0b5f8a);
scene.background = SKY;
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);
const FOV0 = 55;                                  // (the other views; the deck view zooms in)
camera.position.set(-2.6, 1.6, 3.0);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -0.8, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.98;
controls.minDistance = 0.8;
controls.maxDistance = 16;
controls.screenSpacePanning = false;           // Ctrl (or Shift, or the right button) + drag moves the view along the water: left / right / north / south, not up and down
controls.panSpeed = 1.3;
controls.zoomToCursor = true;                  // the wheel zooms towards the mouse pointer: easy to dive into a detail and to back out again
controls.zoomSpeed = 1.6;
controls.screenSpacePanning = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x4a88aa, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(3, 6, 2);
scene.add(sun);

// ---------- pool ----------
// The pool is a list of rectangles with floor depths, sent by the sim (POOL_REGIONS in rov_physics.py).
// Here, in three.js coordinates: x is the sim's x, z is the sim's -y, depth is measured down from the surface.
let regions = [{ x0: -3, x1: 3, z0: -1.5, z1: 1.5, d: 2 }];        // until the sim tells us (the original pool)
let regionsKey = "";
let bbox = { x0: -3, x1: 3, z0: -1.5, z1: 1.5 }, maxDepth = 2;
function setRegions(list) {
  regions = list.map(([x0, x1, y0, y1, d]) => ({ x0, x1, z0: -y1, z1: -y0, d }));       // (the sim's list includes the stairs: they are two more little regions with shallower floors)
  bbox = { x0: Math.min(...regions.map((r) => r.x0)), x1: Math.max(...regions.map((r) => r.x1)),
           z0: Math.min(...regions.map((r) => r.z0)), z1: Math.max(...regions.map((r) => r.z1)) };
  maxDepth = Math.max(...regions.map((r) => r.d));
}
const EPS = 1e-6;
const insidePool = (x, z, e = EPS) => regions.some((r) => x >= r.x0 - e && x <= r.x1 + e && z >= r.z0 - e && z <= r.z1 + e);
function floorAt(x, z) {                          // depth of the floor under (x, z): the deepest region containing it
  let best = null;
  for (const r of regions) if (x >= r.x0 - EPS && x <= r.x1 + EPS && z >= r.z0 - EPS && z <= r.z1 + EPS) best = Math.max(best ?? 0, r.d);
  return best ?? maxDepth;
}

// Surfaces that can block the view fade to "x-ray" when the camera is on the far side of them.
const solids = [];
function solid(mesh, hidesWhen) {
  mesh.material.transparent = true;
  mesh.userData.hidesWhen = hidesWhen;     // (cameraPosition) => true when it is in the way
  solids.push(mesh);
}

// soft web of light patches, tileable: used for ripples seen from below and floor caustics
function rippleTexture() {
  const N = 128, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d"), img = g.createImageData(N, N), TAU = Math.PI * 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N * TAU, v = y / N * TAU;
    const n = Math.sin(u + 1.6 * Math.sin(2 * v)) + Math.sin(v + 1.6 * Math.sin(2 * u + 1));
    const b = Math.pow(1 - Math.min(1, Math.abs(n) / 1.2), 3);       // bright where n ~ 0
    const i = (y * N + x) * 4;
    img.data[i] = 200 + 55 * b; img.data[i + 1] = 235 + 20 * b; img.data[i + 2] = 255;
    img.data[i + 3] = 255 * (0.25 + 0.75 * b);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const pool = new THREE.Group();
scene.add(pool);
const water = {};
const CELL = 1 / 12;               // water-surface grid cell, metres
let NX = 72, NZ = 36, DX = CELL, DZ = CELL;   // grid size, set in buildPool for the pool's bounding box
const wave = { h: null, v: null, tot: null, inside: null, acc: 0 };
let fx = true;                     // "Water FX": refraction + wave simulation (toggle button)
try { fx = localStorage.getItem("rovWaterFx") !== "off"; } catch (e) { /* no storage: keep default */ }

const WATER_VERT = `
  varying vec3 vWorld; varying vec3 vN;
  void main() { vWorld = position; vN = normal;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
// Refraction (Snell's law, water n = 1.33): bend the view ray at the surface, then look up where
// that bent ray would land in the picture of the scene underneath. From below, rays steeper than
// ~49 degrees can't leave the water (total internal reflection): outside "Snell's window" you see
// the water itself, not the sky.
const WATER_FRAG = `
  uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tRip;
  uniform float uTime; uniform vec3 uSun; uniform mat4 uVP; uniform mat4 uInvVP; uniform vec2 uScreen;
  varying vec3 vWorld; varying vec3 vN;
  vec3 worldAt(vec2 uv, float d) {                     // world position of what the picture shows at uv
    vec4 w = uInvVP * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return w.xyz / w.w;
  }
  void main() {
    vec3 I = normalize(vWorld - cameraPosition);
    bool under = cameraPosition.y < 0.0;
    vec3 N = normalize(vN); if (under) N = -N;
    vec3 R = refract(I, N, under ? 1.33 : 1.0 / 1.33);
    float cosi = clamp(dot(-I, N), 0.0, 1.0);
    float fres = 0.02 + 0.98 * pow(1.0 - cosi, 5.0);
    vec3 col;
    if (dot(R, R) < 0.001) {
      float rip = texture2D(tRip, vWorld.xz * 0.9 + vec2(uTime * 0.03, uTime * 0.02)).a;
      col = mix(vec3(0.004, 0.07, 0.15), vec3(0.02, 0.24, 0.38), rip);
    } else {
      // How far something is displaced depends on HOW DEEP it is: nothing at the waterline, more further
      // down. So: look at what is straight behind this pixel, measure its depth below (or, from underwater,
      // height above) the surface, follow the bent ray that far, and look there instead; repeat to refine.
      vec2 uv = gl_FragCoord.xy / uScreen;
      for (int i = 0; i < 4; i++) {
        float d = texture2D(tDepth, uv).x;
        if (d > 0.9999) break;                         // nothing there
        float h = clamp(under ? worldAt(uv, d).y - vWorld.y : vWorld.y - worldAt(uv, d).y, 0.0, 3.0);
        vec4 clip = uVP * vec4(vWorld + R * (h / max(abs(R.y), 0.1)), 1.0);
        uv = clamp(clip.xy / clip.w * 0.5 + 0.5, 0.002, 0.998);
      }
      vec2 px = 0.8 / uScreen;                       // a small blur stands in for the missing anti-aliasing
      col = 0.4 * texture2D(tScene, uv).rgb
          + 0.15 * (texture2D(tScene, uv + vec2(px.x, px.y)).rgb + texture2D(tScene, uv + vec2(-px.x, px.y)).rgb
                  + texture2D(tScene, uv + vec2(px.x, -px.y)).rgb + texture2D(tScene, uv + vec2(-px.x, -px.y)).rgb);
      col = mix(col, vec3(0.02, 0.30, 0.52), under ? 0.12 : 0.22);
      if (!under) col = mix(col, vec3(0.52, 0.77, 0.91), fres * 0.85);
    }
    if (!under) col += pow(max(dot(reflect(I, N), uSun), 0.0), 220.0) * 1.5;   // sun glint
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const sharedTileCanvas = (() => {                 // one tile picture, shared by every wall and floor
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#4ab3dc"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#58c0e6"; g.fillRect(4, 4, 120, 120);
  g.strokeStyle = "#e9f6fb"; g.lineWidth = 4; g.strokeRect(0, 0, 128, 128);
  return c;
})();
function tiled(w, h) {                            // plane w x h metres, one tile = 0.5 m
  const t = new THREE.CanvasTexture(sharedTileCanvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 0.5, h / 0.5);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide });
}

// Wall pieces, worked out from the regions. Each side of each region is either an OUTER wall (nothing on the other
// side: surface to floor) or touches a neighbouring region. Where the neighbour's floor is shallower there is a STEP
// wall (from its floor down to ours); where it is deeper or equal there is nothing from this side.
function wallSegments() {
  const eq = (a, b) => Math.abs(a - b) < EPS;
  const segs = [];
  for (const r of regions) {
    const sides = [
      { axis: "x", at: r.x1, out: +1, span: [r.z0, r.z1], nb: (n) => eq(n.x0, r.x1) && [n.z0, n.z1] },
      { axis: "x", at: r.x0, out: -1, span: [r.z0, r.z1], nb: (n) => eq(n.x1, r.x0) && [n.z0, n.z1] },
      { axis: "z", at: r.z1, out: +1, span: [r.x0, r.x1], nb: (n) => eq(n.z0, r.z1) && [n.x0, n.x1] },
      { axis: "z", at: r.z0, out: -1, span: [r.x0, r.x1], nb: (n) => eq(n.z1, r.z0) && [n.x0, n.x1] },
    ];
    for (const sd of sides) {
      const cover = [];
      for (const n of regions) {
        if (n === r) continue;
        const iv = sd.nb(n);
        if (!iv) continue;
        const lo = Math.max(sd.span[0], iv[0]), hi = Math.min(sd.span[1], iv[1]);
        if (hi - lo > EPS) cover.push({ lo, hi, d: n.d });
      }
      cover.sort((a, b) => a.lo - b.lo);
      let cur = sd.span[0];
      for (const cv of cover) {
        if (cv.lo - cur > EPS) segs.push({ axis: sd.axis, at: sd.at, out: sd.out, lo: cur, hi: cv.lo, top: 0, bottom: r.d, outer: true });
        if (cv.d < r.d - EPS) segs.push({ axis: sd.axis, at: sd.at, out: sd.out, lo: cv.lo, hi: cv.hi, top: cv.d, bottom: r.d, outer: false });
        cur = Math.max(cur, cv.hi);
      }
      if (sd.span[1] - cur > EPS) segs.push({ axis: sd.axis, at: sd.at, out: sd.out, lo: cur, hi: sd.span[1], top: 0, bottom: r.d, outer: true });
    }
  }
  return segs;
}

let sceneryMod = null, scenery = null, deckBox = null;      // quiet scenery far away (scenery.js, optional); the pool is built again once it has loaded
if (cfg.scenery) import("./scenery.js").then((m) => { sceneryMod = m; buildPool(); }).catch(() => { /* no scenery */ });
function buildPool() {
  pool.clear();
  solids.length = 0;
  const bw = bbox.x1 - bbox.x0, bh = bbox.z1 - bbox.z0, cx = (bbox.x0 + bbox.x1) / 2, cz = (bbox.z0 + bbox.z1) / 2;

  // floors (one per region, at its own depth)
  for (const r of regions) {
    const w = r.x1 - r.x0, h = r.z1 - r.z0;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), tiled(w, h));
    floor.position.set((r.x0 + r.x1) / 2, -r.d, (r.z0 + r.z1) / 2);
    pool.add(floor);
    solid(floor, (c) => c.y < -r.d);
  }
  // walls: outer ones fade when the camera is outside them; step walls stay solid. Outer walls also get a faint
  // water tint plane just inside, so water seen through a see-through wall still looks like water.
  const tint = new THREE.MeshBasicMaterial({ color: 0x1f8fc4, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  for (const sg of wallSegments()) {
    const w = sg.hi - sg.lo, h = sg.bottom - sg.top, mid = (sg.lo + sg.hi) / 2, y = -(sg.top + sg.bottom) / 2;
    const geo = new THREE.PlaneGeometry(w, h);
    if (sg.axis === "x") geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, tiled(w, h));
    if (sg.axis === "x") m.position.set(sg.at, y, mid); else m.position.set(mid, y, sg.at);
    pool.add(m);
    if (sg.outer) {
      solid(m, sg.axis === "x" ? (c) => sg.out * (c.x - sg.at) > 0 : (c) => sg.out * (c.z - sg.at) > 0);
      const t = new THREE.Mesh(geo.clone(), tint);
      if (sg.axis === "x") t.position.set(sg.at - sg.out * 0.003, y, mid); else t.position.set(mid, y, sg.at - sg.out * 0.003);
      pool.add(t);
    }
  }
  // tint over each floor too
  for (const r of regions) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2), tint);
    t.position.set((r.x0 + r.x1) / 2, -r.d + 0.003, (r.z0 + r.z1) / 2);
    pool.add(t);
  }

  // deck: everything around the pool that isn't pool (cells of a grid made from the region edges)
  {
    const grow = Math.max(1, Math.sqrt(bw * bh / 18));                                   // a bigger pool gets a bigger deck around it
    const xs = new Set([bbox.x0 - 7 * grow, bbox.x1 + 7 * grow]), zs = new Set([bbox.z0 - 6 * grow, bbox.z1 + 6 * grow]);
    for (const r of regions) { xs.add(r.x0); xs.add(r.x1); zs.add(r.z0); zs.add(r.z1); }
    const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b), pos = [], idx = [];
    deckBox = { x0: X[0], x1: X[X.length - 1], z0: Z[0], z1: Z[Z.length - 1] };
    for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Z.length - 1; j++) {
      if (insidePool((X[i] + X[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2, -EPS)) continue;      // that cell is water
      const k = pos.length / 3;
      pos.push(X[i], 0, Z[j], X[i + 1], 0, Z[j], X[i + 1], 0, Z[j + 1], X[i], 0, Z[j + 1]);
      idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, n) => (n % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    const deck = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xd9d4c7, side: THREE.DoubleSide }));
    deck.position.y = 0.01;
    pool.add(deck);
    solid(deck, (c) => c.y < 0.01);
  }

  scenery = null;
  if (cfg.scenery && sceneryMod && deckBox) { scenery = sceneryMod.buildScenery(THREE, deckBox, cx); pool.add(scenery.group); }       // grass beyond the deck, and the koi pond

  // a compass rose on the deck, beside the stairs wall: the headings on the screen (0 to 360 degrees) are measured from the +x direction, counter-clockwise seen from above
  {
    const cv = document.createElement("canvas"); cv.width = cv.height = 512;
    const g = cv.getContext("2d"), c0 = 256;
    g.clearRect(0, 0, 512, 512);
    g.fillStyle = "rgba(250, 247, 238, 0.92)"; g.beginPath(); g.arc(c0, c0, 244, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#0d3b4f"; g.lineWidth = 6; g.beginPath(); g.arc(c0, c0, 236, 0, Math.PI * 2); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(c0, c0, 150, 0, Math.PI * 2); g.stroke();
    for (let a = 0; a < 360; a += 15) {                                                  // ticks every 15 degrees
      const r1 = a % 45 === 0 ? 150 : 205, r2 = 236, rad = a * Math.PI / 180;
      g.lineWidth = a % 45 === 0 ? 4 : 2; g.beginPath(); g.moveTo(c0 + r1 * Math.cos(rad), c0 - r1 * Math.sin(rad)); g.lineTo(c0 + r2 * Math.cos(rad), c0 - r2 * Math.sin(rad)); g.stroke();
    }
    for (const [a, big] of [[0, 1], [45, 0], [90, 1], [135, 0], [180, 1], [225, 0], [270, 1], [315, 0]]) {            // the points of the rose
      const rad = a * Math.PI / 180, w = big ? 26 : 14, len = big ? 140 : 100;
      g.fillStyle = big ? (a === 0 ? "#d62d2d" : "#0d3b4f") : "#5f8fa3";
      g.beginPath(); g.moveTo(c0 + len * Math.cos(rad), c0 - len * Math.sin(rad));
      g.lineTo(c0 + w * Math.cos(rad + Math.PI / 2), c0 - w * Math.sin(rad + Math.PI / 2)); g.lineTo(c0 + w * Math.cos(rad - Math.PI / 2), c0 - w * Math.sin(rad - Math.PI / 2)); g.closePath(); g.fill();
    }
    g.fillStyle = "#0d3b4f"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold 40px system-ui, sans-serif";
    for (const a of [0, 90, 180, 270]) { const rad = a * Math.PI / 180; g.fillText(a + "\u00b0", c0 + 188 * Math.cos(rad) * 0.9 + (a === 0 ? -6 : a === 180 ? 6 : 0), c0 - 188 * Math.sin(rad) * 0.9); }
    g.font = "bold 26px system-ui, sans-serif"; g.fillText("HEADING", c0, c0 + 4); g.font = "20px system-ui, sans-serif"; g.fillText("0\u00b0 = toward the stairs wall", c0, c0 + 32);
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    const main = regions.reduce((a, b) => (b.d > a.d ? b : a));
    const rose = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    rose.position.set(main.x1 + 1.5, 0.02, (main.z0 + main.z1) / 2 + 1.5);                // on the deck beside the main pool's stairs wall (the canvas's right = +x = 0 degrees, its top = +y = 90 degrees)
    pool.add(rose);
  }

  // one lane line down the middle of each 3 m lane on the deep floor (a wide pool has several), with a "T" at each end like a real pool, and short 1 m ruler ticks
  // along it (short, so a wide pool does not look striped). Together they make motion easy to see.
  {
    const deep = regions.reduce((a, b) => (b.d > a.d ? b : a)), dark = new THREE.MeshBasicMaterial({ color: 0x14384d });
    const len = deep.x1 - deep.x0, y = -deep.d + 0.004, lanes = Math.max(1, Math.round((deep.z1 - deep.z0) / 3)), laneW = (deep.z1 - deep.z0) / lanes;
    const mark = (w, h, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.005, h), dark); m.position.set(x, y, z); pool.add(m); };
    for (let i = 0; i < lanes; i++) {
      const mz = deep.z0 + (i + 0.5) * laneW;
      mark(len - 1.0, 0.06, (deep.x0 + deep.x1) / 2, mz);                                   // the line stops short of the walls...
      for (const sx of [deep.x0 + 0.5, deep.x1 - 0.5]) mark(0.06, 0.7, sx, mz);             // ... where a T crosses it
      for (let x = Math.ceil(deep.x0 + 1.5); x < deep.x1 - 1.0; x += 1) mark(0.05, 0.3, x, mz);
    }
  }

  // ---- depth marks in metres on the near end wall of the main pool (so a ROV's depth can be read off the wall): a ruler with a number plate every metre ----
  {
    const deep = regions.reduce((a, b) => (b.d > a.d ? b : a)), x = deep.x0 + 0.012, zc = (deep.z0 + deep.z1) / 2;
    const ink = new THREE.MeshBasicMaterial({ color: 0x0b2a3d });
    const strip = (w, h, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(Math.PI / 2), ink); m.position.set(x, y, z); pool.add(m); };
    strip(0.05, deep.d - 0.02, -deep.d / 2, zc - 0.3);                                       // the ruler's rail, then a tick every half metre and a plate every metre
    for (let k = 0.5; k < deep.d - 0.01; k += 0.5) strip(Number.isInteger(k) ? 0.3 : 0.15, 0.03, -k, zc - (Number.isInteger(k) ? 0.15 : 0.225));
    for (let k = 0; k < deep.d - 0.01; k += 1) {                                              // 0 m is the surface
      const c = document.createElement("canvas"); c.width = 128; c.height = 64;
      const g = c.getContext("2d"); g.fillStyle = "#0b2a3d"; g.fillRect(0, 0, 128, 64);
      g.fillStyle = "#ffffff"; g.font = "bold 40px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(`${k} m`, 64, 34);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
      plate.position.set(x + 0.002, -k - (k === 0 ? 0.12 : 0), zc - 0.55);
      pool.add(plate);
    }
  }

  // ---- water surface: one wavy grid over the pool's bounding box, only the cells that are water are drawn ----
  const cell = CELL * Math.max(1, Math.sqrt(bw * bh / 33));      // a bigger pool gets coarser water cells: the grid never has more cells than the original pool's (33 m2), so it stays cheap on a Chromebook
  NX = Math.max(8, Math.round(bw / cell)); NZ = Math.max(8, Math.round(bh / cell));
  DX = bw / NX; DZ = bh / NZ;
  const S = NX + 1, geo = new THREE.PlaneGeometry(bw, bh, NX, NZ).rotateX(-Math.PI / 2).translate(cx, 0, cz);
  const index = [];
  for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
    if (!insidePool(bbox.x0 + (ix + 0.5) * DX, bbox.z0 + (iz + 0.5) * DZ)) continue;
    const a = ix + S * iz, b = ix + S * (iz + 1), c = ix + 1 + S * (iz + 1), d = ix + 1 + S * iz;   // same winding as PlaneGeometry
    index.push(a, b, d, b, c, d);
  }
  geo.setIndex(index);
  // "simple" = translucent Phong (+ a rippling underside); "fx" = refraction shader that samples a picture of
  // the scene (see renderScene).
  const surf = new THREE.Mesh(geo,
    new THREE.MeshPhongMaterial({ color: 0x3fb0ea, transparent: true, opacity: 0.32,
                                  specular: 0xffffff, shininess: 90, side: THREE.FrontSide,
                                  depthWrite: false }));
  pool.add(surf);
  const rip = rippleTexture();
  rip.repeat.set(bw / 1.2, bh / 1.2);
  const under = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: rip, color: 0xb8e6ff, transparent: true, opacity: 0.6, side: THREE.BackSide, depthWrite: false }));
  pool.add(under);
  const fxMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { tScene: { value: null }, tRip: { value: rip },
                uTime: { value: 0 }, uVP: { value: new THREE.Matrix4() }, uInvVP: { value: new THREE.Matrix4() },
                uScreen: { value: new THREE.Vector2(1, 1) }, tDepth: { value: null }, uSun: { value: sun.position.clone().normalize() } },
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG });
  const fxSurf = new THREE.Mesh(geo, fxMat);
  pool.add(fxSurf);
  // drifting light patches on each floor
  const cau = [];
  for (const r of regions) {
    const t = rippleTexture();
    t.repeat.set((r.x1 - r.x0) / 1.0, (r.z1 - r.z0) / 1.0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set((r.x0 + r.x1) / 2, -r.d + 0.006, (r.z0 + r.z1) / 2);
    pool.add(m);
    cau.push(t);
  }
  Object.assign(water, { rip, cau, simple: surf, under, fx: fxSurf, geo, mat: fxMat });
  initWave();
}
buildPool();

// ----- surface height field: a small wave simulation (rings spread, bounce off the pool's walls, fade) -----
function initWave() {
  const S = NX + 1, n = S * (NZ + 1);
  wave.h = new Float32Array(n); wave.v = new Float32Array(n); wave.tot = new Float32Array(n);
  wave.inside = new Uint8Array(n);                 // 1 where this grid point is water (the L has corners that aren't)
  for (let iz = 0; iz <= NZ; iz++) for (let ix = 0; ix <= NX; ix++)
    wave.inside[iz * S + ix] = insidePool(bbox.x0 + ix * DX, bbox.z0 + iz * DZ, 1e-4) ? 1 : 0;
}
function drop(x, z, amp, radius = 0.25) {          // poke the water at world (x, z)
  const gx = (x - bbox.x0) / DX, gz = (z - bbox.z0) / DZ;
  for (let iz = Math.max(0, Math.floor(gz - radius / DZ)); iz <= Math.min(NZ, Math.ceil(gz + radius / DZ)); iz++)
    for (let ix = Math.max(0, Math.floor(gx - radius / DX)); ix <= Math.min(NX, Math.ceil(gx + radius / DX)); ix++) {
      const i = iz * (NX + 1) + ix;
      if (!wave.inside[i]) continue;
      const d = Math.hypot((ix - gx) * DX, (iz - gz) * DZ);
      if (d < radius) wave.h[i] += amp * 0.5 * (1 + Math.cos(Math.PI * d / radius));
    }
}
function stepWave() {                               // one 1/60 s step
  const { h, v, inside } = wave, S = NX + 1;
  for (let iz = 0; iz <= NZ; iz++) for (let ix = 0; ix <= NX; ix++) {
    const i = iz * S + ix;
    if (!inside[i]) continue;
    const c = h[i];                                  // a neighbour that is a wall (or outside) just mirrors this point
    const avg = ((ix > 0 && inside[i - 1] ? h[i - 1] : c) + (ix < NX && inside[i + 1] ? h[i + 1] : c) +
                 (iz > 0 && inside[i - S] ? h[i - S] : c) + (iz < NZ && inside[i + S] ? h[i + S] : c)) / 4;
    v[i] = (v[i] + (avg - c) * 0.18) * 0.992;       // spring toward neighbours, then a little damping
  }
  for (let i = 0; i < h.length; i++) h[i] += v[i];
}

function animateWater(t, dt) {
  const S = NX + 1, amb = fx ? 0.005 : 0.012;
  if (fx) { wave.acc += dt; while (wave.acc >= 1 / 60) { wave.acc -= 1 / 60; stepWave(); } }
  const p = water.geo.attributes.position, nrm = water.geo.attributes.normal, H = wave.tot;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    H[i] = amb * Math.sin(x * 2.1 + t * 1.3) + amb * 0.8 * Math.sin(z * 2.7 - t * 1.7) + (fx ? wave.h[i] : 0);
    p.setY(i, H[i]);
  }
  const K = fx ? 3 : 1;                             // exaggerate slopes so tiny ripples still refract visibly
  for (let iz = 0; iz <= NZ; iz++) for (let ix = 0; ix <= NX; ix++) {
    const i = iz * S + ix;
    const sx = (H[iz * S + Math.min(NX, ix + 1)] - H[iz * S + Math.max(0, ix - 1)]) / (2 * DX);
    const sz = (H[Math.min(NZ, iz + 1) * S + ix] - H[Math.max(0, iz - 1) * S + ix]) / (2 * DZ);
    const nx = -sx * K, nz = -sz * K, inv = 1 / Math.hypot(nx, 1, nz);
    nrm.setXYZ(i, nx * inv, inv, nz * inv);
  }
  p.needsUpdate = true; nrm.needsUpdate = true;
  water.rip.offset.set(t * 0.03, t * 0.02);
  for (const c of water.cau) c.offset.set(-t * 0.025, t * 0.035);
  water.mat.uniforms.uTime.value = t;
}

// ---------- ROV model ----------
const PVC = new THREE.MeshStandardMaterial({ color: 0xf2f2ec, roughness: 0.55 });
const JOINT = new THREE.MeshStandardMaterial({ color: 0xcfcfc8, roughness: 0.6 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x262d36, roughness: 0.5 });
const METAL = new THREE.MeshStandardMaterial({ color: 0xa8b2ba, roughness: 0.3, metalness: 0.6 });
const BLADE = new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.4 });
const PORT = new THREE.MeshStandardMaterial({ color: 0xd62d2d, roughness: 0.5 });      // left = red
const STBD = new THREE.MeshStandardMaterial({ color: 0x23a84a, roughness: 0.5 });      // right = green

const rov = new THREE.Group();
scene.add(rov);
const H = 0.25;                          // half the cube side

function bar(a, b, r = 0.014, parent = rov) {          // PVC pipe from point a to point b
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), PVC);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
  parent.add(m);
}
for (const sy of [-1, 1]) for (const sz of [-1, 1]) bar([-H, sy * H, sz * H], [H, sy * H, sz * H]);   // along x
for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar([sx * H, -H, sz * H], [sx * H, H, sz * H]);   // vertical
for (const sx of [-1, 1]) for (const sy of [-1, 1]) bar([sx * H, sy * H, -H], [sx * H, sy * H, H]);   // along z
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {                       // corner joints
  const j = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.045), JOINT);
  j.position.set(sx * H, sy * H, sz * H);
  rov.add(j);
}
// bottom crossbars that carry the vertical thruster (mounted low so its propeller stays under water)
bar([0, -H, -H], [0, -H, H], 0.012);
bar([-H, -H, 0], [H, -H, 0], 0.012);

// ---- pipe insulation (foam) on the TOP four sticks: that is what makes a real ROV float. Shown by the Buoyancy setting:
//      floats = a long piece on each stick, neutral = a few short pieces, sinks = none ----
const FOAM = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.9 });
const FOAM_R = 0.026;                                  // a bit fatter than the 1.4 cm PVC
const topSticks = [];                                  // [start, end] of each of the four top sticks (the cube's top face, y = +H)
for (const sz of [-1, 1]) topSticks.push([[-H, H, sz * H], [H, H, sz * H]]);       // two along x (front to back)
for (const sx of [-1, 1]) topSticks.push([[sx * H, H, -H], [sx * H, H, H]]);       // two across
function foamPiece(group, stick, t0, t1) {            // a piece from t0 to t1 metres along the stick (the stick is 0.5 m long)
  const va = new THREE.Vector3(...stick[0]), vb = new THREE.Vector3(...stick[1]);
  const dir = vb.clone().sub(va).normalize();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(FOAM_R, FOAM_R, t1 - t0, 16), FOAM);
  m.position.copy(va).addScaledVector(dir, (t0 + t1) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  group.add(m);
}
const foamFloat = new THREE.Group(), foamNeutral = new THREE.Group();
topSticks.forEach((st) => foamPiece(foamFloat, st, 0.05, 0.45));                    // floats: most of every top stick
[[[0.07, 0.16], [0.30, 0.38]], [[0.12, 0.20], [0.33, 0.42]], [[0.20, 0.29]], [[0.15, 0.23]]]      // neutral: a few short pieces
  .forEach((pieces, i) => pieces.forEach(([t0, t1]) => foamPiece(foamNeutral, topSticks[i], t0, t1)));
rov.add(foamFloat, foamNeutral);
function showFoam(buoyancy) {
  foamFloat.visible = buoyancy > 0.05;
  foamNeutral.visible = buoyancy >= -0.05 && buoyancy <= 0.05;
}
showFoam(0);                                           // (the default is "neutral"; the real value arrives with the first state)

function makeThruster(shroudMat) {
  const g = new THREE.Group();                         // axis = local +Y
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.13, 20), DARK);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.01, 10, 28).rotateX(Math.PI / 2), shroudMat);
  ring.position.y = -0.065;
  const prop = new THREE.Group();
  prop.position.y = -0.075;
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.004, 0.02), BLADE);
    blade.position.x = 0.04; blade.rotation.x = 0.4;
    const arm = new THREE.Group(); arm.rotation.y = i * Math.PI * 2 / 3; arm.add(blade);
    prop.add(arm);
  }
  g.add(body, ring, prop);
  g.userData.prop = prop;
  return g;
}
// The thrusters are built from the layout (3, 4, 6 or 8 of them: THRUSTER_LAYOUTS in sim/physics.js) and rebuilt when the layout changes.
// A horizontal one (red = left, green = right) points along its thrust direction; a vertical (white) one hangs low on the frame with its propeller up.
const SHROUD = { red: PORT, green: STBD, white: PVC };
const thrusterGroup = new THREE.Group();
rov.add(thrusterGroup);
let rig = [], rigN = 0;                                  // [{ name, kind, node, axis }]: what is built now
function buildThrusters(layout) {
  thrusterGroup.clear();
  rig = layout.map((t) => {
    const node = makeThruster(SHROUD[t.color] || PVC);
    let axis;
    if (t.kind === "h") {                                // sim (x ahead, y left) -> three (x, -depth, -y)
      axis = new THREE.Vector3(t.dx, 0, -t.dy);
      node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);   // local +Y -> its thrust direction
      node.position.set(t.gx, 0, -t.gy);
      if (Math.abs(t.gx) > 0.2) bar([Math.sign(t.gx) * H, 0, -Math.sign(t.gy) * H], [t.gx, 0, -t.gy], 0.012, thrusterGroup);   // a short strut from the corner post
    } else if (t.kind === "c") {                         // a corner thruster tilted 45 degrees: sim (x ahead, y left, z up) -> three (x, z, -y)
      axis = new THREE.Vector3(t.dx, t.dz, -t.dy);
      node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      node.position.set(t.gx, t.gz, -t.gy);
      bar([Math.sign(t.gx) * H, Math.sign(t.gz) * H, -Math.sign(t.gy) * H], [t.gx, t.gz, -t.gy], 0.012, thrusterGroup);   // a short strut from the corner joint
    } else {
      axis = new THREE.Vector3(0, 1, 0);
      node.position.set(t.gx, -H + 0.1, -t.gy);          // low on the frame (THRUSTER_UP / VERT_ARM in rov_physics.py)
      node.rotation.x = Math.PI;                          // propeller end up, so it clears the bar below
      if (Math.abs(t.gx) > 0.1 && Math.abs(t.gy) > 0.1) bar([Math.sign(t.gx) * H, -H, -Math.sign(t.gy) * H], [t.gx, -H, -t.gy], 0.012, thrusterGroup);   // (corner mounts)
    }
    thrusterGroup.add(node);
    if (t.kind === "h" && t.gx === 0) {                  // the original side thrusters: a mid-height rail along the frame, two pipes to two clamps round the thruster
      const sz = -Math.sign(t.gy);
      bar([-H, 0, sz * H], [H, 0, sz * H], 0.013, thrusterGroup);
      for (const dx of [-0.045, 0.045]) { bar([dx, 0, sz * H], [dx, 0, sz * (H + 0.05)], 0.013, thrusterGroup); collar(dx, 0, sz * (H + 0.07), 0.026, 0.085, 0.085); }
    }
    if (t.kind === "v" && t.gy === 0) {                  // vertical thrusters sit on the bottom bar, clamped to it
      collar(t.gx, -H + 0.025, 0, 0.085, 0.04, 0.085);   // saddle between the bar and the thruster body
      collar(t.gx, -H, 0, 0.03, 0.03, 0.07);             // clamp round the bar itself
    }
    return { name: t.name, kind: t.kind, node, axis };
  });
  rigN = layout.length;
}
buildThrusters(layoutFor(4));

// ---- camera: a small housing on a short pipe under the top-front edge, looking forward and tilted down so the
// front of the claw is in view. rovCam is the actual three.js camera (its picture goes to the window under joy2). ----
const camModel = new THREE.Group();                                              // the camera on the model: hidden by ?camera=off
bar([0.25, H, 0], [0.19, H - 0.045, 0], 0.012, camModel);                        // mount: a pipe from the top-front edge
{
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.042, 0.052), DARK);
  housing.position.set(0.18, H - 0.05, 0);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.012, 16).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1d4f7a, roughness: 0.1, metalness: 0.6 }));
  lens.position.set(0.2225, H - 0.05, 0);
  camModel.add(housing, lens);
}
rov.add(camModel);
camModel.visible = cfg.camera;
const rovCam = new THREE.PerspectiveCamera(64, 4 / 3, 0.03, 40);
rovCam.rotation.order = "YXZ";
rovCam.rotation.set(-0.5, -Math.PI / 2, 0);        // look along the ROV's +x (yaw -90 deg), tilted down 0.5 rad (~29 deg)
rovCam.position.set(0.23, H - 0.05, 0);
rov.add(rovCam);

// ---- mounts: every thruster is clamped to a real frame member, with pipes where needed ----
function collar(x, y, z, sx, sy, sz) {              // a dark clamp block
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), DARK);
  m.position.set(x, y, z);
  thrusterGroup.add(m);
}

// ---- front tool, two modes (button / T key): a fixed curved-up "nose", or a claw that opens and closes ----
const toolMount = new THREE.Group();
toolMount.position.set(H, -H, 0);              // on the front bottom PVC bar, where tools usually mount
rov.add(toolMount);
toolMount.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.07), DARK));    // clamp around the bar

const nose = new THREE.Group();                 // simple bill, curving gently upward
const noseCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 0, 0),
  new THREE.Vector3(0.18, 0.012, 0), new THREE.Vector3(0.235, 0.055, 0)]);
nose.add(new THREE.Mesh(new THREE.TubeGeometry(noseCurve, 24, 0.016, 12), METAL));
const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 10), METAL);
noseTip.position.copy(noseCurve.getPoint(1));
nose.add(noseTip);
toolMount.add(nose);

const claw = new THREE.Group();                 // two jaws that pinch from the left and right
claw.add(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.12, 12).rotateZ(Math.PI / 2), METAL).translateX(0.06));
claw.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.095), DARK).translateX(0.145));
const jaws = [];
for (const sgn of [-1, 1]) {                    // -1 = left (three -z), +1 = right
  const jaw = new THREE.Group();
  jaw.position.set(0.17, 0, sgn * 0.03);
  jaw.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.024, 0.018), METAL).translateX(0.07));
  const tip = new THREE.Group();                // fingertip bends inward so closed jaws meet
  tip.position.x = 0.14;
  tip.rotation.y = sgn * 0.55;
  tip.add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.024, 0.018), BLADE).translateX(0.0275));
  jaw.add(tip);
  claw.add(jaw);
  jaws.push({ jaw, sgn });
}
toolMount.add(claw);

// ---------- thruster bubbles (world-space particles) ----------
const NB = 90;
const BUBBLE_TEX = (() => {              // round, soft-edged dot instead of a square
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(16, 16, 2, 16, 16, 15);
  grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.7, "rgba(255,255,255,.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
function makeBubbles() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NB * 3).fill(0).map((_, i) => (i % 3 === 1 ? -1000 : 0)), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.05, transparent: true, opacity: 0.8, depthWrite: false,
    map: BUBBLE_TEX, alphaTest: 0.05 }));
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, vel: new Float32Array(NB * 3), life: new Float32Array(NB), next: 0, acc: 0 };
}
const bubbles = {};                                    // one stream of bubbles per thruster, made when it is first used (t1 ... t8)
for (let i = 1; i <= 8; i++) bubbles["t" + i] = makeBubbles();

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
function emit(b, thruster, localAxis, cmd, dt) {
  // jet leaves the side the water is pushed toward: opposite to thrust
  b.acc += Math.abs(cmd) * 70 * dt;
  const dir = tmp2.copy(localAxis).multiplyScalar(cmd > 0 ? -1 : 1).applyQuaternion(rov.quaternion);
  while (b.acc >= 1) {
    b.acc -= 1;
    const i = b.next; b.next = (b.next + 1) % NB;
    thruster.getWorldPosition(tmp);
    const pa = b.pts.geometry.attributes.position, s = 0.7 + Math.abs(cmd);
    pa.setXYZ(i, tmp.x + dir.x * 0.09 + (Math.random() - .5) * 0.05,
                 tmp.y + dir.y * 0.09 + (Math.random() - .5) * 0.05,
                 tmp.z + dir.z * 0.09 + (Math.random() - .5) * 0.05);
    b.vel[i * 3] = dir.x * s + (Math.random() - .5) * 0.35;
    b.vel[i * 3 + 1] = dir.y * s + (Math.random() - .5) * 0.35;
    b.vel[i * 3 + 2] = dir.z * s + (Math.random() - .5) * 0.35;
    b.life[i] = 0.9 + Math.random() * 0.5;
  }
}
function stepBubbles(b, dt) {
  const pa = b.pts.geometry.attributes.position;
  for (let i = 0; i < NB; i++) {
    if (b.life[i] <= 0) continue;
    b.life[i] -= dt;
    if (b.life[i] <= 0) { pa.setY(i, -1000); continue; }
    const k = Math.exp(-2.2 * dt);                       // water slows them quickly
    b.vel[i * 3] *= k; b.vel[i * 3 + 1] = b.vel[i * 3 + 1] * k + 0.35 * dt; b.vel[i * 3 + 2] *= k;
    let y = pa.getY(i) + b.vel[i * 3 + 1] * dt;
    if (y > -0.01) {                                                  // pops at the surface
      if (fx) drop(pa.getX(i), pa.getZ(i), 0.0025, 0.1);
      pa.setY(i, -1000); b.life[i] = 0; continue;
    }
    pa.setXYZ(i, pa.getX(i) + b.vel[i * 3] * dt, y, pa.getZ(i) + b.vel[i * 3 + 2] * dt);
  }
  pa.needsUpdate = true;
}

// soft shadow on the pool floor under the ROV (helps judge depth)
const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
scene.add(shadow);

// silt puffs kicked up when the ROV bumps the floor
const silt = [];
for (let i = 0; i < 20; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: BUBBLE_TEX, color: 0xcbbd98,
                                                         transparent: true, opacity: 0, depthWrite: false }));
  sp.visible = false; sp.userData = { life: 0, vel: new THREE.Vector3() };
  scene.add(sp); silt.push(sp);
}
function puffSilt(x, z, speed) {
  let n = 8 + Math.round(10 * Math.min(1, speed / 0.6));
  for (const sp of silt) {
    if (n <= 0) break;
    if (sp.userData.life > 0) continue;
    n--;
    const a = Math.random() * Math.PI * 2, r = 0.1 + Math.random() * 0.2;
    const sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
    sp.position.set(sx, -floorAt(sx, sz) + 0.06, sz);
    sp.userData.vel.set(Math.cos(a) * (0.12 + Math.random() * 0.15), 0.05 + Math.random() * 0.12, Math.sin(a) * (0.12 + Math.random() * 0.15));
    sp.userData.life = sp.userData.max = 1.2 + Math.random() * 0.8;
    sp.scale.setScalar(0.12); sp.visible = true;
  }
}
function stepSilt(dt) {
  for (const sp of silt) {
    const u = sp.userData;
    if (u.life <= 0) continue;
    u.life -= dt;
    if (u.life <= 0) { sp.visible = false; continue; }
    sp.position.addScaledVector(u.vel, dt);
    u.vel.multiplyScalar(Math.exp(-1.5 * dt));
    const f = u.life / u.max;
    sp.material.opacity = 0.55 * f;
    sp.scale.setScalar(0.12 + (1 - f) * 0.3);
  }
}
let jPresses = [];                    // when the J key was pressed lately
let wobble = 0;                       // decaying rocking after a splash or a bump
rov.rotation.order = "YXZ";           // yaw first, then roll about the ROV's own forward axis

// ---------- optional add-on: props.js draws the pick-up ring (delete that file to remove it) ----------
let props = null;
import("./music.js").then((m) => m.initMusic()).catch(() => { /* no music */ });
import("./props.js").then((m) => { props = new m.Props(scene, THREE); }).catch(() => { /* no props */ });
let fish = null;                      // optional add-on: fish.js draws the coy fish (delete that file to remove it)
import("./fish.js").then((m) => { fish = new m.Fish(scene, THREE); }).catch(() => { /* no fish */ });
let missionHud = null;                // a mission (?mission=): the score board, the clock and the crew's inventory (missions/common/hud.js); nothing is loaded without one
if (backend.features.mission) import("./missions/common/hud.js").then((m) => { missionHud = m.setupMissionHud({ backend, toast }); }).catch((e) => console.warn("mission panel failed:", e));
let missionView = null;               // the mission's props, drawn (missions/<name>/props3d.js)
if (backend.features.mission) import(`./missions/${cfg.mission}/props3d.js`).then((m) => { missionView = new m.MissionView(scene, THREE); if (missionView.hasLabels === false) $("labels").style.display = "none"; else if (cfg.labels) toggleLabels(); }).catch((e) => console.warn("mission props failed:", e));
function toggleLabels() { if (!missionView || missionView.hasLabels === false) return; missionView.setLabels(!missionView.labelsOn, floorAt); $("labels").classList.toggle("on", missionView.labelsOn); liveCfg.labels = missionView.labelsOn; syncAddress(); toast(missionView.labelsOn ? "Labels on (P turns them off)" : "Labels off"); }
if (backend.features.mission) { $("labels").style.display = ""; $("labels").addEventListener("click", toggleLabels); }
let eels = null;                      // optional joke add-on: eel.js draws the electric eel, the sparks and the smoke (delete that file to remove them)
import("./eel.js").then((m) => { eels = new m.Eels(scene, THREE); }).catch(() => { /* no eel */ });
let crabs = null;                     // optional add-on: crab.js draws the green crabs (delete that file to remove them)
import("./crab.js").then((m) => { crabs = new m.Crabs(scene, THREE); }).catch(() => { /* no crabs */ });
let jets = null;                      // optional add-on: jets.js draws the water outlets and the current (delete that file to remove them)
import("./jets.js").then((m) => { jets = new m.Jets(scene, THREE, { look: cfg.flow, ripple: (x, z, r, k) => { if (fx) drop(x, z, r, k); } }); }).catch(() => { /* no jets */ });

// ---------- state from the sim ----------
const state = { x: -1.5, y: 0, depth: 0.8, yaw: 0, thrusters: 4, t1: 0, t2: 0, t3: 0, t4: 0, claw: 0, speed: 0, pitch: 0, roll: 0, imu: null, buoyancy: 0, joys: [[0, 0], [0, 0]], joy_topics: [] };
const seen = { splash: null, floor: null, eel: "idle" };
const eelProp = () => (state.props || []).find((p) => p.type === "eel");
const eelDead = () => (state.props || []).some((p) => p.locked);       // the eel got the ROV (eel.js) or the mission clock ran out (missions/): nothing works until it is over
const shown = { ...state };
let lastMsg = 0;

{ // hide what this backend cannot do
  const f = backend.features, hide = (sel) => document.querySelectorAll(sel).forEach((e) => { e.style.display = "none"; });
  if (!f.joys) { hide("#joys"); hide("#joyval1, #joyval2"); document.querySelectorAll("#joyval1, #joyval2").forEach((e) => { e.parentElement.style.display = "none"; }); }
  if (!f.imu) hide(".imu");
  if (!f.rings) hide("#help-ring");
  if (!f.current) hide("#help-jets");
  if (!f.claw) { hide("#help-claw"); const t = $("help-tool"); if (t) t.textContent = "B buoyancy   V reset view (or double-click)"; }
  if (!f.claw) { const c = $("claw"); if (c && !f.rings) c.parentElement.style.display = "none"; }
}
backend.connect(handleState);
if (backend.features.serial && backend.link) {          // micro:bit / Pico over USB (browser version only; with the Python sim use nodes/serial_bridge)
  $("serial").style.display = "";
  import("./serial.js").then((m) => m.setupSerial({ link: backend.link, button: $("serial"), panel: $("seriallog") })).catch(() => { $("serial").style.display = "none"; });
}
function handleState(s) {
  if (!s.regions) return;
  const key = JSON.stringify(s.regions);
  if (key !== regionsKey) {                                  // the pool's shape (first message, or the sim changed it)
    regionsKey = key; setRegions(s.regions); buildPool();
    if (!userMoved && typeof view !== "undefined") {          // re-centre the camera on the new shape, in whatever view we're in
      if (view === "orbit") resetView(); else if (view === "top") setView("top");
    }
  }
  Object.assign(state, s);
  lastMsg = performance.now();
  const eel = eelProp();
  if (eel && eel.mode !== seen.eel) {
    if (eel.mode === "bite") { held.clear(); sendCommand(); wobble = 1; }
    seen.eel = eel.mode;
  }
  if (s.tool && s.tool !== tool && performance.now() - toolAsked > 600) setTool(s.tool, false);   // sim changed it
  if (seen.splash === null) { seen.splash = s.splash_n; seen.floor = s.floor_n; }   // ignore history
  if (s.splash_n !== seen.splash) {                       // top of the ROV crossed the surface
    seen.splash = s.splash_n;
    if (fx) drop(state.x, -state.y, 0.015 + 0.06 * Math.min(1, s.splash_v), 0.35);
    wobble = Math.max(wobble, 0.4 + Math.min(0.6, s.splash_v));
  }
  if (s.floor_n !== seen.floor) {                         // bumped the pool floor
    seen.floor = s.floor_n;
    puffSilt(state.x, -state.y, s.floor_v);
    wobble = Math.max(wobble, 0.3 + Math.min(0.5, s.floor_v));
  }
}

let hudN = 0;                                           // the thruster bars on show
function buildHud(layout) {
  $("thrusters").innerHTML = layout.map((t) => `<div class="row"><span class="lbl">${t.name} ${t.label}</span><div class="bar"><b></b><i id="b-${t.name}"></i></div><span class="num" id="n-${t.name}">0.00</span></div>`).join("");
  hudN = layout.length;
  $("help-t6").style.display = layout.length > 4 ? "" : "none";
  $("help-t8").style.display = layout.length > 6 ? "" : "none";
}
buildHud(layoutFor(4));
function syncRig() {                                    // the sim's layout changed (Config, or the server's --thrusters): rebuild the model and the bars
  const n = state.thrusters || 4;
  if (n !== rigN) { buildThrusters(state.layout || layoutFor(n)); for (const k in bubbles) bubbles[k].life.fill(0); }
  if (n !== hudN) buildHud(state.layout || layoutFor(n));
}
function updateHud() {
  syncRig();
  drawSwitches();
  const live = performance.now() - lastMsg < 1000;
  $("dot").className = live ? "ok" : "";
  $("status").textContent = live ? backend.name : "waiting for sim...";
  for (const { name: n } of rig) {
    const v = state[n] || 0, el = $("b-" + n);
    el.style.width = Math.abs(v) * 50 + "%";
    el.style.transform = v < 0 ? "translateX(-100%)" : "none";
    el.style.background = v < 0 ? "#f95" : "#4d8";
    $("n-" + n).textContent = v.toFixed(2);
  }
  // keyboard help when the sim takes keys; the ROS topic list when ROS is driving it (both can be on at once)
  $("keyhelp").style.display = state.keys ? "block" : "none";
  $("topics").style.display = (!state.keys || state.ros) ? "block" : "none";
  $("topics").classList.toggle("side", !!(state.keys && state.ros));
  const rings = (state.props || []).filter((p) => p.type === "ring");
  const nHooked = rings.filter((p) => p.hooked).length;
  $("claw").textContent = tool === "nose" ? "(nose: fixed)" :
    Math.round(state.claw * 100) + "% open" + (rings.some((p) => p.held) ? " (holding 1 ring)" : rings.some((p) => p.inJaws) ? " (ring between jaws: close!)" : "");
  if (tool === "nose") $("claw").textContent = nHooked ? `nose: ${nHooked} ring${nHooked > 1 ? "s" : ""} hooked` : "nose: fixed";
  const im = state.imu;
  if (im) {
    const f = (v) => { const r = Math.abs(v) < 0.0005 ? 0 : v; return (r >= 0 ? "+" : "-") + Math.abs(r).toFixed(3).padStart(6, " "); };
    const deg = im.pitch * 180 / Math.PI;
    $("pitch").textContent = (deg >= 0 ? "+" : "") + deg.toFixed(1) + "\u00b0" + (deg > 0.5 ? " nose down" : deg < -0.5 ? " nose up" : " level");
    $("tilt").setAttribute("transform", `rotate(${deg.toFixed(1)} 20 10)`);
    $("accel").textContent = `${f(im.ax)} ${f(im.ay)} ${f(im.az)}`;
    const g = 9.81, sp = Math.sin(im.pitch), cp = Math.cos(im.pitch);      // gravity as the tilted accelerometer sees it
    const rr = im.roll || 0, sr = Math.sin(rr), cr = Math.cos(rr);          // heeling over leans gravity into the y axis too
    $("accel0").textContent = `${f(im.ax + g * sp)} ${f(im.ay - g * cp * sr)} ${f(im.az - g * cp * cr)}`;
    const rdeg = rr * 180 / Math.PI;
    $("rollv").textContent = (rdeg >= 0 ? "+" : "") + rdeg.toFixed(1) + "\u00b0" + (rdeg > 0.5 ? " right side down" : rdeg < -0.5 ? " left side down" : " level");
    $("gyro").textContent = `${f(im.gx)} ${f(im.gy)} ${f(im.gz)}`;
  }
  const bu = state.buoyancy ?? 0;
  showFoam(bu);
  $("current").textContent = "Current: " + (jetsRunning() ? "on" : "off");
  $("current").classList.toggle("on", jetsRunning());
  joys.forEach((j, i) => {
    const jy = (state.joys && state.joys[i]) || [0, 0];
    if (!j.down) j.knob.style.transform = `translate(${-jy[0] * JOY_REACH}px, ${-jy[1] * JOY_REACH}px)`;   // show the shared value
    $("joyval" + j.n).textContent = `${jy[0] >= 0 ? "+" : "-"}${Math.abs(jy[0]).toFixed(2)} ${jy[1] >= 0 ? "+" : "-"}${Math.abs(jy[1]).toFixed(2)}`;
    $("joycap" + j.n).textContent = state.ros ? (state.joy_topics && state.joy_topics[i]) || `joy${j.n} (not published)` : `joy${j.n} (no ROS)`;
  });
  const hasJets = (state.props || []).some((p) => p.type === "jets" && p.on);   // the water is running (the outlets are in the wall either way)
  $("row-current").style.display = hasJets ? "" : "none";
  if (hasJets && state.water) $("currentv").textContent = Math.hypot(state.water[0], state.water[1]).toFixed(2) + " m/s";
  $("depth").textContent = state.depth.toFixed(2) + " m";
  $("heading").textContent = Math.round(((state.yaw * 180 / Math.PI) % 360 + 360) % 360) + "°";
}

// ---------- keyboard (only when the server is keyboard_sim.py: state.keys) ----------
const held = new Set();
let clawCmd = 0, lastSent = "";
let hOnly = cfg.controls !== "all";                                            // "H-bridge only": only the three switches work (H key / the badge on the box)
const hLocked = cfg.explicit.has("controls");                 // ?controls= in the address decides the mode: the H key and the badge do nothing then
try { hOnly = localStorage.getItem("rovHOnly") === "on"; } catch (e) { /* no storage: keep default */ }
if (hLocked) hOnly = cfg.controls !== "all";
function setHOnly(on, send = true) {
  hOnly = on;
  if (!hLocked) try { localStorage.setItem("rovHOnly", on ? "on" : "off"); } catch (e) { /* ignore */ }
  const b = $("hmode");
  b.classList.toggle("on", on);
  b.textContent = on ? "H-bridge only" : "all keys";
  $("keyhelp").classList.toggle("honly", on);
  if (send) sendCommand();                                    // thrusters held by an extra key stop at once
}
const pointerSw = [0, 0, 0];                                  // the on-screen switch box: -1 / 0 / +1 per switch while the mouse holds it
function sendCommand() {
  const body = JSON.stringify(computeCommand(held, pointerSw, clawCmd, { hOnly, thrusters: state.thrusters || 4 }));
  if (body === lastSent) return;
  lastSent = body;
  backend.cmd(JSON.parse(body));
}
window.addEventListener("keydown", (e) => {
  if (document.getElementById("configui")) return;                    // the ?config panel is open: typing in it must not drive the ROV
  if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.code === "KeyL" || e.code === "KeyW" || e.code === "KeyD" || e.code === "Period")) {      // Ctrl + L / W / D (Ctrl + . also widens): the pool grows (never shrinks), the ROV stays where it is
    e.preventDefault();
    if (e.repeat || !backend.growPool || document.getElementById("configui")) return;
    const what = { KeyL: "length", KeyW: "width", Period: "width", KeyD: "depth" }[e.code], r = backend.growPool(what);
    if (r) { userMoved = false; toast(`Pool: ${poolSizeText(r[0], r[1])}, ${r[2]} m deep`); } else toast(`The pool cannot get any ${what === "depth" ? "deeper" : what === "length" ? "longer" : "wider"}`);
    return;
  }
  if (missionHud && missionHud.modal) return;                          // the inventory is open: it has the keyboard
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === "KeyV" && !e.repeat) { resetView(); return; }
  if (eelDead()) { e.preventDefault(); return; }
  if (e.code === "KeyP" && !e.repeat && missionView && missionView.hasLabels !== false) { toggleLabels(); return; }                      // plaques on the floor beside each prop
  if (backend.features.mission && !e.repeat) {                                // the mission's crew keys
    if (e.code === "KeyG") { backend.missionDeliver(); return; }
    if (e.code === "Tab" && missionHud) { e.preventDefault(); missionHud.toggleInventory(); return; }
  }
  if (e.code === "KeyL" && !e.repeat) { if (backend.features.eel) backend.summonEel(); return; }
  if (e.code === "KeyB" && !e.repeat) { nextBuoyancy(); return; }
  if (e.code === "KeyT" && !e.repeat) { if (backend.features.claw) setTool(tool === "claw" ? "nose" : "claw"); return; }
  if (e.code === "KeyN" && !e.repeat) { if (backend.features.rings) dropRing(); return; }
  if (e.code === "KeyJ" && !e.repeat) {
    if (jets) toast("Water look: " + jets.cycleLook() + " (J changes it)");
    const now = performance.now();                                    // (easter egg: J pressed over and over)
    jPresses = jPresses.filter((t) => now - t < 5000); jPresses.push(now);
    if (jPresses.length >= 8) { jPresses = []; if (backend.features.eel) backend.summonEel(); }
    return;
  }
  if (!state.keys) return;
  if (GAME_KEYS.has(e.code)) { held.add(e.code); e.preventDefault(); }
  else if (e.code === "KeyH" && !e.repeat) { if (!hLocked) setHOnly(!hOnly); return; }
  else if (e.code === "KeyX") held.clear();
  else return;
  sendCommand();
});
// ---------- N: drop a new pool ring into the water where the mouse is (it sinks) ----------
let toastTimer = 0;
function toast(text) {
  const t = $("toast");
  t.textContent = text; t.style.display = "block";
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.display = "none"; }, 2600);
}
let mouse = null;                                              // where the pointer is over the 3D view (null when it is over a panel or outside the window)
window.addEventListener("pointermove", (e) => { mouse = e.target === renderer.domElement ? { x: e.clientX, y: e.clientY } : null; });
document.documentElement.addEventListener("pointerleave", () => { mouse = null; });
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _water = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
function waterUnderMouse() {                                   // the point of the water surface under the pointer, as sim (x, y), or null if it is not over the pool
  if (!mouse) return null;
  const r = renderer.domElement.getBoundingClientRect();
  _ndc.set(((mouse.x - r.left) / r.width) * 2 - 1, -((mouse.y - r.top) / r.height) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  if (!_ray.ray.intersectPlane(_water, _hit) || !insidePool(_hit.x, _hit.z)) return null;
  return { x: _hit.x, y: -_hit.z };                            // three.js z is the sim's -y
}
function dropRing() {
  if (eelDead()) return;
  const p = waterUnderMouse();
  if (!p) { toast("Point the mouse at the water of the pool (move it a little first), then press N."); return; }
  const n = (state.props || []).filter((q) => q.type === "ring").length;
  if (n >= MAX_RINGS) { toast(`The pool already has ${MAX_RINGS} rings: that is the most. (Reset puts it back.)`); return; }
  if (typeof backend.dropRing !== "function") { toast("This page is a mix of old and new files: reload it with Ctrl+Shift+R (Cmd+Shift+R on a Mac)."); return; }
  try {
    Promise.resolve(backend.dropRing(p.x, p.y)).then(
      (r) => toast(r === null ? "No ring was dropped (the rings add-on is not loaded)." : `Ring dropped: ${n + 1} in the pool.`),
      (e) => toast("Could not drop a ring: " + (e && e.message ? e.message : e)));
  } catch (e) { console.error(e); toast("Could not drop a ring: " + e.message); }
}
window.addEventListener("keyup", (e) => { if (held.delete(e.code)) sendCommand(); });
window.addEventListener("blur", () => { held.clear(); sendCommand(); });   // never leave a thruster stuck on

// ---------- the switch box: three momentary DPDT switches (see controls.js). Press the top half of a switch for +, the bottom for -; it springs back ----------
const swEls = SWITCHES.map((_, i) => document.querySelector(`.sw[data-i="${i}"]`));
swEls.forEach((el, i) => {
  const slot = el.querySelector(".swslot");
  const set = (v) => { if (pointerSw[i] !== v) { pointerSw[i] = v; sendCommand(); } };
  const fromPointer = (e) => {
    const r = slot.getBoundingClientRect();
    const d = SWITCHES[i].orient === "h" ? (e.clientX - (r.left + r.width / 2)) / r.width : -(e.clientY - (r.top + r.height / 2)) / r.height;   // + toward the plus end
    set(d > 0.12 ? 1 : d < -0.12 ? -1 : 0);
  };
  let down = false;
  slot.addEventListener("pointerdown", (e) => { if (!state.keys) return; down = true; slot.setPointerCapture(e.pointerId); fromPointer(e); e.preventDefault(); });
  slot.addEventListener("pointermove", (e) => { if (down) fromPointer(e); });
  const release = () => { down = false; set(0); };
  slot.addEventListener("pointerup", release);
  slot.addEventListener("pointercancel", release);
  window.addEventListener("blur", release);
});
$("hmode").addEventListener("click", () => { if (!hLocked) setHOnly(!hOnly); });
if (hLocked) $("hmode").style.cursor = "default";                   // (set by the page address; no tooltip, it would cover the pool)
setHOnly(hOnly, false);
function drawSwitches() {                                       // the levers show the commands the sim really has (from the page, ROS or a micro:bit): forward, stop or reverse, never half way
  const real = switchPositions(state, state.thrusters || 4);
  real.map((v, i) => pointerSw[i] || v).forEach((v, i) => {
    const lever = swEls[i].querySelector(".swlever");
    lever.style.transform = SWITCHES[i].orient === "h" ? `translateX(${v * 26}px)` : `translateY(${-v * 22}px)`;
    lever.classList.toggle("on", v !== 0);
  });
}

// ---------- tool mode (claw / nose): the sim owns it, this just shows it and asks to change it ----------
let tool = backend.defaultTool || "claw", toolAsked = 0;
function setTool(t, send = true) {
  if (eelDead()) return;
  tool = t;
  claw.visible = t === "claw"; nose.visible = t === "nose";
  if (send) { toolAsked = performance.now(); backend.tool(t); }
}
setTool(backend.features.claw ? tool : "nose", false);       // no claw in this backend: the fixed nose

// ---------- buoyancy: floats -> neutral -> sinks (a pool setting, not a ROS topic) ----------
function nextBuoyancy() {
  if (eelDead()) return;
  const b = state.buoyancy ?? 0;
  const next = b > 0.05 ? "neutral" : b < -0.05 ? "positive" : "negative";   // + -> 0 -> - -> +
  backend.buoyancy(next);
}
if (backend.features.current && backend.setCurrent) {                // the toolbar's Current button: water out of the wall outlets, on or off
  $("current").style.display = "";
  $("current").addEventListener("click", () => { const on = !jetsRunning(); backend.setCurrent(on); liveCfg.current = on; syncAddress(); });
}

// ---------- two on-screen joysticks (joy1, joy2): drag with the mouse; the sim publishes each as sensor_msgs/Joy ----------
// Same convention as a real joy_node: axes[0] is LEFT/right with LEFT positive, axes[1] is up/down with UP positive.
const JOY_REACH = 46 - 15;                       // how far a knob centre can travel (pad radius - knob radius), px
const joys = [1, 2].map((n) => {
  const pad = document.querySelector(`.joypad[data-n="${n}"]`), knob = pad.querySelector(".joyknob");
  const j = { n, pad, knob, axes: [0, 0], dirty: false, down: false };
  const move = (x, y) => {                       // x right, y down on screen, each -1..1
    knob.style.transform = `translate(${x * JOY_REACH}px, ${y * JOY_REACH}px)`;
    const r2 = (v) => Math.round(v * 100) / 100 + 0;   // + 0 turns -0 into 0
    j.axes = [r2(-x), r2(-y)];                   // screen right = axis 0 negative; screen up = axis 1 positive
    j.dirty = true;
  };
  const fromPointer = (e) => {
    const r = pad.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / JOY_REACH, y = (e.clientY - (r.top + r.height / 2)) / JOY_REACH;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }               // stay inside the circle
    move(x, y);
  };
  const release = () => { if (!j.down) return; j.down = false; pad.classList.remove("drag"); move(0, 0); };   // springs back
  pad.addEventListener("pointerdown", (e) => { j.down = true; pad.setPointerCapture(e.pointerId); pad.classList.add("drag"); fromPointer(e); });
  pad.addEventListener("pointermove", (e) => { if (j.down) fromPointer(e); });
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointercancel", release);
  window.addEventListener("blur", release);
  return j;
});
setInterval(() => {                              // send each stick at most ~30 times a second, and always the final value
  for (const j of joys) {
    if (!j.dirty) continue;
    j.dirty = false;
    backend.joy(j.n, j.axes);
  }
}, 33);

// ---------- views ----------
// A narrow window (e.g. VS Code's side panel) sees less of the pool, so back the camera off to fit it.
const fitFactor = () => Math.max(1, 1.5 / Math.max(window.innerWidth / window.innerHeight, 0.3));
let userMoved = false;                     // once you orbit yourself, we stop auto-fitting the camera
// Where the camera looks by default: the middle of the pool, backed off in proportion to its size (1 for the original 6 x 3 m pool).
const poolCenter = () => new THREE.Vector3((bbox.x0 + bbox.x1) / 2, -0.4 * maxDepth, (bbox.z0 + bbox.z1) / 2);
const poolScale = () => Math.sqrt((bbox.x1 - bbox.x0) * (bbox.z1 - bbox.z0) / 18);
function overviewCamera() {                  // the whole pool in view, from a corner
  controls.target.copy(poolCenter());
  camera.position.set(-2.6, 2.4, 3.0).multiplyScalar(fitFactor() * poolScale()).add(controls.target);
  controls.maxDistance = Math.max(16, 12 * fitFactor() * poolScale());        // (a big pool needs more room to back out)
  controls.update();
}
function resetView() {
  setView("orbit");
  userMoved = false;
  overviewCamera();
}
renderer.domElement.addEventListener("dblclick", () => { if (view === "deck") { deck.pan.set(0, 0, 0); deck.zoom = 1.0; } else resetView(); });
let view = "orbit";
/** The rectangle of the pool region the ROV is over (or the nearest one): the edges the Deck view's person stands at. */
function deckRegion(x, z) {
  const inR = regions.filter((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
  if (inR.length) return inR.reduce((a, b) => (b.d > a.d ? b : a));
  const dist = (r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
  return regions.reduce((a, b) => (dist(b) < dist(a) ? b : a));
}
const deck = { side: null, eye: new THREE.Vector3(), focus: new THREE.Vector3(), zoom: 1.0, pan: new THREE.Vector3() };       // the Deck view: where the person stands and what they look at
renderer.domElement.addEventListener("wheel", (e) => { if (view !== "deck") return; e.preventDefault(); zoomBy(e.deltaY > 0 ? 1 / 1.12 : 1.12); }, { passive: false });
// Orbit view: Ctrl (or Shift, or the right button) + drag slides the whole view along the water (left / right / north / south) instead of tilting it; the height never changes.
{
  let pan = null;
  window.addEventListener("pointerdown", (e) => {
    if (view !== "orbit" || e.target !== renderer.domElement || !(e.ctrlKey || e.shiftKey || e.button === 2) || document.getElementById("configui")) return;
    e.stopImmediatePropagation(); e.preventDefault();                                        // (OrbitControls does not get this drag)
    pan = { x: e.clientX, y: e.clientY }; userMoved = true;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
  }, true);
  window.addEventListener("pointermove", (e) => {
    if (!pan || view !== "orbit") return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y; pan.x = e.clientX; pan.y = e.clientY;
    const f = controls.target.clone().sub(camera.position); f.y = 0; if (f.lengthSq() < 1e-8) return; f.normalize();
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)), k = 0.0022 * camera.position.distanceTo(controls.target);
    const d = right.multiplyScalar(-dx * k).addScaledVector(f, dy * k);                      // grab the water and move it with the mouse
    controls.target.add(d); camera.position.add(d); controls.update();
  }, true);
  const stop = (e) => { if (!pan) return; pan = null; try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ } };
  window.addEventListener("pointerup", stop, true); window.addEventListener("pointercancel", stop, true);
  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
}
/** The toolbar's + and - (also used by the wheel in the Deck view): zoom whatever the current view is. f > 1 zooms in. */
function zoomBy(f) {
  if (view === "deck") deck.zoom = Math.max(0.35, Math.min(2.5, deck.zoom / f));
  else if (view === "orbit") {
    const v = camera.position.clone().sub(controls.target), len = Math.max(controls.minDistance, Math.min(controls.maxDistance, v.length() / f));
    camera.position.copy(controls.target).add(v.setLength(len)); userMoved = true; controls.update();
  } else if (view === "follow") followK = Math.max(0.4, Math.min(3, followK / f));
  else if (view === "top") topK = Math.max(0.3, Math.min(2.5, topK / f));
}
let followK = 1.0, topK = 1.0;                 // how far the Follow and Top cameras stand back (the + and - buttons)
$("zoomin").addEventListener("click", () => zoomBy(1.25));
$("zoomout").addEventListener("click", () => zoomBy(1 / 1.25));
// the Deck view: drag with the mouse to look around a little (the view still follows the ROV); double-click puts it back
{
  let drag = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { if (view === "deck" && e.button === 0) { drag = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); } });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!drag || view !== "deck") return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    const f = deck.focus.clone().sub(deck.eye); f.y = 0; if (f.lengthSq() < 1e-6) return; f.normalize();
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)), k = 0.0035 * camera.position.distanceTo(deck.focus);
    deck.pan.addScaledVector(right, -dx * k).addScaledVector(f, dy * k);                       // grab the water and move it
    if (deck.pan.length() > 2.5) deck.pan.setLength(2.5);
  });
  const end = (e) => { drag = null; try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ } };
  renderer.domElement.addEventListener("pointerup", end); renderer.domElement.addEventListener("pointercancel", end);
}
function setView(v) {
  const was = view;
  view = v;
  controls.enabled = v === "orbit";
  if (v !== "deck" && camera.fov !== FOV0) { camera.fov = FOV0; camera.updateProjectionMatrix(); }
  document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  const pc = poolCenter();
  if (v === "deck") { deck.pan.set(0, 0, 0); deck.side = null; deck.eye.set(rov.position.x, 1.8, rov.position.z + 4); deck.focus.copy(rov.position); }        // (start where the ROV is: it then slides to the edge)
  if (v === "top") { camera.position.set(pc.x, 7.5 * topK * fitFactor() * poolScale(), pc.z + 0.01); camera.lookAt(pc.x, 0, pc.z); }
  if (v === "orbit") { controls.target.copy(pc); if (was !== "orbit" && typeof overviewCamera === "function") { overviewCamera(); userMoved = false; } }       // coming back from Follow or Top: the whole pool again, not wherever the chase camera was
}
document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
let fxUser = fx;                      // what the Water FX button says; a low quality tier can switch it off without changing this
function setFx(on, byUser = true) {
  fx = on;
  if (byUser) fxUser = on;
  $("fx").classList.toggle("on", on);
  if (byUser) try { localStorage.setItem("rovWaterFx", on ? "on" : "off"); } catch (e) { /* ignore */ }
}
$("fx").addEventListener("click", () => setFx(!fx));
setFx(fx);
$("reset").addEventListener("click", () => {
  backend.reset();
  held.clear(); clawCmd = 0; sendCommand();
});
setView(startView(location.search, cfg.mission));                 // /?view=orbit|deck|follow|top (a mission starts on the deck)
{ const c = new URLSearchParams(location.search).get("cam");               // e.g. /?cam=6,-1,0
  const tg = new URLSearchParams(location.search).get("target");            // e.g. /?cam=..&target=-1,-1,0
  if (tg) controls.target.set(...tg.split(",").map(Number));
  const tl = new URLSearchParams(location.search).get("tool");              // /?tool=nose
  if (tl) setTool(tl === "nose" ? "nose" : "claw");   // asks the sim to switch
  const bz = new URLSearchParams(location.search).get("buoyancy");          // /?buoyancy=positive|neutral|negative
  if (bz) backend.buoyancy(bz);
  if (c) { camera.position.set(...c.split(",").map(Number)); userMoved = true; }   // an explicit camera sticks
  else if (fitFactor() > 1) resetView(); }

// the toolbar can wrap onto two rows in a narrower window: keep the switch box / camera column below whatever height it ends up
function layoutRightColumn() {
  const col = $("rightcol"), bar = $("btns");
  col.style.top = window.innerWidth > 640 ? bar.offsetTop + bar.offsetHeight + 8 + "px" : "";    // (a narrow window has its own layout, see the CSS)
}
new ResizeObserver(layoutRightColumn).observe($("btns"));
window.addEventListener("resize", layoutRightColumn);
layoutRightColumn();

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  const bw = renderer.domElement.width, bh = renderer.domElement.height;
  const rw = Math.max(2, bw), rh = Math.max(2, bh);     // full resolution: this picture has no multisampling
  rt.setSize(rw, rh);
  rtDepth.image.width = rw; rtDepth.image.height = rh; rtDepth.dispose();   // setSize doesn't resize the depth texture
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
controls.addEventListener("start", () => { userMoved = true; });
controls.addEventListener("change", () => {                  // do not let the view be panned away from the pool altogether
  const lo = new THREE.Vector3(bbox.x0 - 3, -maxDepth, bbox.z0 - 3), hi = new THREE.Vector3(bbox.x1 + 3, 1.5, bbox.z1 + 3);
  const t = controls.target, c = t.clone().clamp(lo, hi);
  if (!c.equals(t)) { const d = c.sub(t); controls.target.add(d); camera.position.add(d); }
});
let refit = 0;
function onResize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPR));   // zoom changes devicePixelRatio
  resize();
  clearTimeout(refit);                     // wait for the panel to stop changing size, then re-fit
  refit = setTimeout(() => { if (!userMoved && view === "orbit") resetView(); }, 150);
}
window.addEventListener("resize", onResize);
new ResizeObserver(onResize).observe(document.documentElement);
document.addEventListener("visibilitychange", () => { if (!document.hidden) onResize(); });
resize();
setTimeout(onResize, 400);                 // VS Code's Simple Browser can lay out late

// ---------- main loop ----------
let prev = performance.now(), lastClawSend = 0;
const off = new THREE.Vector3(), want = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  perfSample(now);
  const dt = Math.max(0, Math.min((now - prev) / 1000, 0.1));   // first frame can be negative
  prev = now;
  const t = now / 1000;
  const a = 1 - Math.exp(-dt * 20);                 // smooth the 30 Hz updates
  for (const k of Object.keys(state)) {
    if (k === "yaw") {
      let d = state.yaw - shown.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      shown.yaw += d * a;
    } else if (typeof state[k] === "number") shown[k] += (state[k] - shown[k]) * a;
  }

  rov.position.set(shown.x, -shown.depth, -shown.y);
  rov.rotation.y = shown.yaw;
  wobble *= Math.exp(-dt * 1.6);
  rov.rotation.x = shown.roll + 0.10 * wobble * Math.sin(t * 7);   // roll > 0 = the top goes to the right (a current pushing it over); rocks after a splash or a bump
  rov.rotation.z = -shown.pitch + 0.06 * wobble * Math.sin(t * 5.3 + 1);   // pitch > 0 = nose down (a hanging ring)
  rov.updateMatrixWorld(true);
  // spin props (visual speed ~ command)
  syncRig();
  for (const t of rig) t.node.userData.prop.rotation.y += -(state[t.name] || 0) * 40 * dt;
  // claw jaws swing outward to open (0 closed .. 0.7 rad open)
  for (const { jaw, sgn } of jaws) jaw.rotation.y = -sgn * shown.claw * 0.7;

  const ex = new THREE.Vector3(1, 0, 0), ey = new THREE.Vector3(0, 1, 0);
  const dClaw = (held.has("BracketRight") ? 1 : 0) - (held.has("BracketLeft") ? 1 : 0);   // [ ] nudge the servo
  if (dClaw && state.keys && backend.features.claw) {
    clawCmd = clamp01(clawCmd + dClaw * 0.8 * dt);
    if (now - lastClawSend > 50) { lastClawSend = now; sendCommand(); }
  }
  for (const t of rig) emit(bubbles[t.name], t.node, t.axis, state[t.name] || 0, dt);
  for (const k in bubbles) stepBubbles(bubbles[k], dt);

  const floorD = floorAt(rov.position.x, rov.position.z);
  shadow.position.set(rov.position.x, -floorD + 0.01, rov.position.z);
  const hgt = Math.max(0, floorD - shown.depth);
  shadow.scale.setScalar(1 + hgt * 0.2);
  shadow.material.opacity = clamp01(0.4 - hgt * 0.12);

  if (fx) {
    if (shown.depth < 0.25 + 0.12)                   // top of the ROV at/near the surface: it stirs the water
      drop(shown.x, -shown.y, 0.1 * state.speed * dt, 0.3);
  }
  animateWater(t, dt);
  stepSilt(dt);
  if (props) props.update(state.props, dt);
  if (fish) fish.update(state.props, dt, t);
  if (crabs) crabs.update(state.props, dt, t);
  if (eels) eels.update(state.props, dt, t, rov);
  if (missionHud) missionHud.update(state);
  if (missionView) { missionView.update(state.props, dt, t, floorAt); }
  if (scenery) scenery.update(t);
  { const eel = eelProp(); if (eel && eel.zap) wobble = Math.max(wobble, 0.9); }        
  if (jets) jets.update(state.props, dt);
  for (const m of solids) {                          // x-ray: fade what is between us and the pool
    const mat = m.material, target = m.userData.hidesWhen(camera.position) ? 0.14 : 1;
    mat.opacity += (target - mat.opacity) * (1 - Math.exp(-dt * 8));
    mat.depthWrite = mat.opacity > 0.98;
  }

  if (view === "deck") {                                  // a person on the deck at the pool's edge, looking down at the ROV and at what its nose is working on
    const rect = deckRegion(rov.position.x, rov.position.z);                                                       // the water's edges where the ROV is (not the stairs sticking out of the wall)
    deck.side = nearestSide(rect, { x: rov.position.x, z: rov.position.z }, deck.side, 1.0, cfg.mission !== "none" ? 1 : null);       // (a mission: the east wall, with the stairs, is where the crew stands)
    const eye = deckEye(rect, deck.side, rov.position).eye;                                                       // standing outside the wall, leaning out over the water as far as it takes to see the ROV
    const ahead = new THREE.Vector3(0.35, -0.12, 0).applyAxisAngle(ey, shown.yaw).add(deck.pan);                                 // look a little ahead of the ROV: that is where the nose works
    deck.focus.lerp(want.copy(rov.position).add(ahead), 1 - Math.exp(-dt * 4));
    deck.eye.lerp(want.set(...eye), 1 - Math.exp(-dt * 2.5));
    camera.position.copy(deck.eye);
    camera.lookAt(deck.focus);
    const d = camera.position.distanceTo(deck.focus), fov = Math.max(14, Math.min(50, 2 * Math.atan(1.3 * deck.zoom / d) * 180 / Math.PI));   // about 2.6 m across at the ROV, whatever the distance
    if (Math.abs(fov - camera.fov) > 0.1) { camera.fov = fov; camera.updateProjectionMatrix(); }
  } else if (view === "follow") {
    off.set(-1.25 * followK, 0.55 * (0.6 + 0.4 * followK), 0).applyAxisAngle(ey, shown.yaw);
    want.copy(rov.position).add(off);
    camera.position.lerp(want, 1 - Math.exp(-dt * 4));
    camera.lookAt(rov.position);
  } else if (view === "orbit") {
    controls.update();
  }
  // under the surface: blue fog; above: clear sky
  const under = camera.position.y < 0 && insidePool(camera.position.x, camera.position.z);
  scene.background = under ? WATER : SKY;
  scene.fog = under ? UNDER_FOG : null;

  updateHud();
  renderScene();
  if (camEvery && now - lastCamDraw > camEvery) { lastCamDraw = now; drawRovCamera(); }       // ~15 pictures a second (fewer on slow machines)
}

const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.004);
const _wp = new THREE.Vector3();
// Draw `cam` into `outRT` (null = the screen). With Water FX on this is two passes: first the part of the scene on the far
// side of the water surface into `refractRT` (with its depth), then everything, the surface bending what pass 1 saw.
function renderView(cam, refractRT, outRT, size) {
  const showFx = fx && water.fx;
  water.fx.visible = showFx; water.simple.visible = !showFx; water.under.visible = !showFx;
  if (showFx) {
    // pass 1: the scene without the water surface, on a clear sky background (no underwater fog)
    water.fx.visible = false;
    const bg = scene.background, fog = scene.fog;
    scene.background = SKY; scene.fog = null;
    // Keep only what is on the far side of the water surface (below it if we look down into the pool,
    // above it if we look up from underwater). Otherwise a part of the ROV that sticks out of the water is
    // drawn once for real and once more, displaced, inside the refracted picture: a double image.
    cam.getWorldPosition(_wp);
    clipPlane.normal.set(0, _wp.y >= 0 ? -1 : 1, 0); clipPlane.constant = 0.004;
    renderer.clippingPlanes = [clipPlane];
    renderer.setRenderTarget(refractRT);
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    renderer.clippingPlanes = [];
    scene.background = bg; scene.fog = fog;
    water.fx.visible = true;
    const u = water.mat.uniforms;
    u.tScene.value = refractRT.texture;
    u.tDepth.value = refractRT.depthTexture;
    cam.updateMatrixWorld();
    u.uVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    u.uInvVP.value.copy(u.uVP.value).invert();
    u.uScreen.value.copy(size);
  }
  renderer.setRenderTarget(outRT);
  renderer.render(scene, cam);             // pass 2
  renderer.setRenderTarget(null);
}
const _screen = new THREE.Vector2();
function renderScene() {
  renderer.getDrawingBufferSize(_screen);
  renderView(camera, rt, null, _screen);
}

// ---------- the ROV camera's picture, in the window under joy2 ----------
// Rendered off-screen at 320 x 240 (about 15 times a second), turned into ordinary sRGB bytes, and copied into a small canvas.
const CAM_W = 320, CAM_H = 240;
const camDepth = new THREE.DepthTexture(CAM_W, CAM_H);
const camRefract = new THREE.WebGLRenderTarget(CAM_W, CAM_H, { type: THREE.HalfFloatType, depthTexture: camDepth });
const camOut = new THREE.WebGLRenderTarget(CAM_W, CAM_H, { type: THREE.HalfFloatType });
const camBytes = new THREE.WebGLRenderTarget(CAM_W, CAM_H, { type: THREE.UnsignedByteType, depthBuffer: false });
const camSize = new THREE.Vector2(CAM_W, CAM_H);
const blitScene = new THREE.Scene(), blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const blitMat = new THREE.ShaderMaterial({         // linear -> sRGB: rendering to a target leaves colours linear
  uniforms: { tex: { value: null } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: `uniform sampler2D tex; varying vec2 vUv;
    void main() {
      vec3 c = clamp(texture2D(tex, vUv).rgb, 0.0, 1.0);
      gl_FragColor = vec4(mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)), 1.0);
    }`, depthTest: false, depthWrite: false });
blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat));
const camPixels = new Uint8Array(CAM_W * CAM_H * 4), camImage = new ImageData(CAM_W, CAM_H);
const camCtx = $("camview").getContext("2d");
let lastCamDraw = 0;
function drawRovCamera() {
  rov.updateMatrixWorld(true);
  rovCam.getWorldPosition(_wp);
  const under = _wp.y < 0 && insidePool(_wp.x, _wp.z);
  // the camera sees solid walls: undo the x-ray fading (set for the main camera) while we draw, then put it back
  const saved = solids.map((m) => [m.material.opacity, m.material.depthWrite]);
  for (const m of solids) { m.material.opacity = 1; m.material.depthWrite = true; }
  const bg = scene.background, fog = scene.fog;
  scene.background = under ? WATER : SKY; scene.fog = under ? UNDER_FOG : null;
  renderView(rovCam, camRefract, camOut, camSize);
  blitMat.uniforms.tex.value = camOut.texture;
  renderer.setRenderTarget(camBytes);
  renderer.render(blitScene, blitCam);
  renderer.readRenderTargetPixels(camBytes, 0, 0, CAM_W, CAM_H, camPixels);
  renderer.setRenderTarget(null);
  for (let y = 0; y < CAM_H; y++)                  // pixel rows come back bottom-up: flip them
    camImage.data.set(camPixels.subarray((CAM_H - 1 - y) * CAM_W * 4, (CAM_H - y) * CAM_W * 4), y * CAM_W * 4);
  camCtx.putImageData(camImage, 0, 0);
  solids.forEach((m, k) => { m.material.opacity = saved[k][0]; m.material.depthWrite = saved[k][1]; });
  scene.background = bg; scene.fog = fog;
}
const UNDER_FOG = new THREE.FogExp2(0x0b5f8a, 0.22);
const clamp01 =(v) => Math.max(0, Math.min(1, v));

// ---------- quality: stay smooth on slow machines (school Chromebooks) ----------
// Tier 0 = everything. Each step down drops the most expensive thing: Water FX (a second full render), then the ROV camera
// window gets slower and the picture coarser, then the camera window goes away. "Auto" starts high (or one down on a weak
// machine) and only ever steps DOWN, when the frame rate stays low. The Quality button can pin High or Low instead.
const TIERS = [
  { name: "High", fx: true, cam: 66, pr: 2 },
  { name: "Medium", fx: false, cam: 66, pr: 2 },
  { name: "Low", fx: false, cam: 250, pr: 1.25 },
  { name: "Lowest", fx: false, cam: 0, pr: 1 },
];
const LOW_FPS = Number(new URLSearchParams(location.search).get("lowfps")) || 28;   // (?lowfps=1000 pretends the machine is slow, for testing)
let qualityMode = "auto", tier = 0, camEvery = 66, graceUntil = 0, winStart = 0, winFrames = 0, lastFrameT = 0, lastFps = 0;
try { const q = localStorage.getItem("rovQuality"); if (q === "auto" || q === "high" || q === "low") qualityMode = q; } catch (e) { /* ignore */ }
const weakMachine = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
function applyTier(t) {
  tier = t;
  const T = TIERS[t];
  setFx(T.fx ? fxUser : false, false);
  camEvery = cfg.camera ? T.cam : 0; maxPR = T.pr;                       // no camera on this ROV (?camera=off): never draw its picture
  $("cam").style.display = camEvery ? "" : "none";
  winStart = 0; graceUntil = performance.now() + 1500;          // let shaders compile before measuring again
  $("quality").textContent = qualityMode === "auto" ? `Quality: Auto (${T.name})` : `Quality: ${T.name}`;
  onResize();
}
const qualityParam = new URLSearchParams(location.search).get("quality");       // ?quality=high|low|lowest|auto beats the saved choice
if (qualityParam === "high" || qualityParam === "low" || qualityParam === "auto") qualityMode = qualityParam;
if (qualityParam === "lowest") qualityMode = "low";
function startTier() { return qualityParam === "lowest" ? 3 : qualityMode === "high" ? 0 : qualityMode === "low" ? 2 : weakMachine ? 1 : 0; }
function perfSample(now) {
  const gap = now - lastFrameT; lastFrameT = now;
  if (document.hidden || gap > 500) { winStart = 0; return; }       // tab was hidden or the machine stalled: not a fair sample
  if (now < graceUntil) return;
  if (!winStart) { winStart = now; winFrames = 0; return; }
  winFrames++;
  if (now - winStart >= 2000) {
    lastFps = winFrames * 1000 / (now - winStart);
    winStart = now; winFrames = 0;
    if (qualityMode === "auto" && lastFps < LOW_FPS && tier < TIERS.length - 1) applyTier(tier + 1);
  }
}
$("quality").addEventListener("click", () => {
  qualityMode = qualityMode === "auto" ? "high" : qualityMode === "high" ? "low" : "auto";
  try { localStorage.setItem("rovQuality", qualityMode); } catch (e) { /* ignore */ }
  applyTier(startTier());
});
applyTier(startTier());

// ---------- ?selftest: drive the ROV by itself and put PASS / FAIL in the page title (for automatic checks) ----------
if (new URLSearchParams(location.search).has("selftest")) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fail = (m) => { backend.cmd({ t1: 0, t2: 0, t3: 0, t4: 0, claw: 0 }); document.title = "FAIL: " + m; };
  document.title = "RUNNING";
  (async () => {
    await wait(1500);
    if (!lastMsg) return fail("no state from the sim");
    const x0 = state.x, y0 = state.y;
    backend.cmd({ t1: 0.8, t2: 0.8, t3: 0, t4: 0, claw: 0 });
    await wait(2500);
    if (!(Math.hypot(state.x - x0, state.y - y0) > 0.08)) return fail(`did not drive forward (${x0.toFixed(2)} -> ${state.x.toFixed(2)})`);        // (a mission starts the ROV facing the other way)
    const d1 = state.depth;
    backend.cmd({ t1: 0, t2: 0, t3: -0.8, t4: -0.8, claw: 0 });
    await wait(2500);
    if (!(state.depth > d1 + 0.2)) return fail(`did not dive (${d1.toFixed(2)} -> ${state.depth.toFixed(2)})`);
    backend.cmd({ t1: 0, t2: 0, t3: 0, t4: 0, claw: 0 });
    if (backend.features.fish && !(state.props || []).some((p) => p.type === "fish")) return fail("no fish in the state");
    if (backend.features.rings) {                       // the N key: point at the water, press N, a ring appears and sinks
      const ringsNow = () => (state.props || []).filter((p) => p.type === "ring");
      const before = ringsNow().length;
      const c = new THREE.Vector3((bbox.x0 + bbox.x1) / 2, 0, (bbox.z0 + bbox.z1) / 2).project(camera);       // the middle of the pool on screen
      renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: (c.x + 1) / 2 * innerWidth, clientY: (1 - c.y) / 2 * innerHeight, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyN", bubbles: true }));
      await wait(700);
      if (before < MAX_RINGS && ringsNow().length !== before + 1) return fail(`N did not drop a ring (${before} -> ${ringsNow().length}; ${$("toast").textContent})`);
      if (before < MAX_RINGS) {
        const mine = ringsNow().at(-1), d0 = mine.depth;
        await wait(1500);
        const d1 = ringsNow().at(-1).depth;
        if (!(d1 > d0 + 0.05)) return fail(`the dropped ring does not sink (${d0.toFixed(2)} -> ${d1.toFixed(2)})`);
      }
    }
    if (backend.setThrusters) {                                       // the Config dialog's thruster modes: the model, the bars and the keys follow the layout
      for (const n of [3, 6, 8, 4]) {
        backend.setThrusters(n);
        for (let k = 0; k < 40 && state.thrusters !== n; k++) await wait(100);   // (the new layout arrives with the next state)
        syncRig(); updateHud();                                                    // (a slow computer draws frames late: do not wait for one)
        if (rig.length !== n || thrusterGroup.children.length < n) return fail(`${n} thrusters: the model has ${rig.length} (state ${state.thrusters}, layout ${(state.layout || []).length}, rov ${(window.__rov || {}).thrusters})`);
        if ($("thrusters").querySelectorAll(".bar").length !== n) return fail(`${n} thrusters: the HUD has ${$("thrusters").querySelectorAll(".bar").length} bars`);
        backend.reset(); await wait(300);                                         // (back at the start, away from the wall)
        const x1 = state.x, y1 = state.y;
        backend.cmd(computeCommand(new Set(["KeyW"]), [0, 0, 0], 0, { thrusters: n }));
        await wait(1200);
        backend.cmd(computeCommand(new Set(), [0, 0, 0], 0, { thrusters: n }));
        if (!(Math.hypot(state.x - x1, state.y - y1) > 0.05)) return fail(`${n} thrusters: W did not drive forward (${x1.toFixed(2)} -> ${state.x.toFixed(2)})`);
      }
    }
    if (backend.features.eel) {
      backend.reset(); await wait(300);
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL", bubbles: true }));
      for (let k = 0; k < 600 && !eelDead(); k++) await wait(100);
      if (!eelDead()) return fail("the eel never got to the ROV");
      await wait(300);
      const x1 = state.x;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }));
      await wait(800);
      if (Math.abs(state.x - x1) > 0.05 || state.t1 !== 0) return fail(`the stunned ROV still answers the keys (${x1.toFixed(2)} -> ${state.x.toFixed(2)}, t1 ${state.t1})`);
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", bubbles: true }));
      for (let k = 0; k < 200 && eelDead(); k++) await wait(100);
      if (eelDead()) return fail("the ROV never woke up again");
    }
    if (backend.features.mission && cfg.mission === "scout2026") {      // the Scout mission: its panel, the props drawn, the board
      for (let k = 0; k < 60 && !(missionView && missionHud && missionView.items.size >= 8); k++) await wait(100);
      const mp = (state.props || []).find((p) => p.type === "mission");
      if (!document.getElementById("mission") || !mp || mp.board.items.length < 10) return fail("the mission panel or its state is missing");
      if (!missionView || missionView.items.size < 8) return fail(`the mission props are not drawn (${missionView ? missionView.items.size : 0})`);
    }
    if (backend.setPoolSize && jets && jets.sys) {                    // the drawn outlets must follow the wall when the pool is resized
      for (const [L, W, D] of [[1, 3, 4], [2, 2, 6], [1, 1, 2]]) {            // (length, width, depth)
        backend.setPoolSize(L, W, D);
        const drawnRight = () => { const os = state.props.find((p) => p.type === "jets").outlets; return !!jets.sys && os.every((o, k) => Math.hypot(jets.sys[k].origin.x - o.x, jets.sys[k].origin.y + o.depth, jets.sys[k].origin.z + o.y) < 1e-6); };
        for (let k = 0; k < 40 && !drawnRight(); k++) await wait(100);       // (a slow computer draws the new outlets a little later)
        const outlets = state.props.find((p) => p.type === "jets").outlets;
        if (!jets.sys) return fail("the outlets were not drawn after the pool was resized");
        for (let k = 0; k < outlets.length; k++) {
          const o = outlets[k], d = jets.sys[k].origin;                // the drawn outlet (three.js: x, -depth, -y)
          if (Math.hypot(d.x - o.x, d.y + o.depth, d.z + o.y) > 1e-6) return fail(`${L}x${W}: the outlet is drawn at (${d.x.toFixed(2)}, ${(-d.y).toFixed(2)}, ${(-d.z).toFixed(2)}) but sits at (${o.x.toFixed(2)}, ${o.depth.toFixed(2)}, ${o.y.toFixed(2)})`);
        }
      }
    }
    {                                                                  // the Config dialog: the "right now" settings must really change things
      const q = (id) => document.getElementById(id), wantTool = tool === "nose" ? "claw" : "nose";
      const choose = (el, v) => { el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); };
      $("config").click();
      await wait(300);
      if (!q("configui")) return fail("the Config button did not open the dialog");
      const radio = document.querySelector(`#configui input[name="cfg-tool"][value="${wantTool}"]`);
      if (radio && !radio.disabled) {                                  // the tool
        radio.click(); await wait(400);
        if (state.tool !== wantTool) return fail(`the dialog's tool choice did not change the tool (${state.tool}, wanted ${wantTool})`);
        document.querySelector(`#configui input[name="cfg-tool"][value="${wantTool === "nose" ? "claw" : "nose"}"]`).click(); await wait(400);
      }
      if (!q("cfg-pool").disabled) {                                   // the pool size
        choose(q("cfg-pool"), "1x2"); await wait(500);
        const m = state.regions.reduce((a, b) => (b[4] > a[4] ? b : a));
        if (m[3] - m[2] !== 6) return fail(`the dialog's pool size did not resize the pool (${m[3] - m[2]} m wide, wanted 6)`);
        choose(q("cfg-pool"), "1x1"); await wait(500);
      }
      if (!q("cfg-current").disabled) {                                // the water
        q("cfg-current").click(); await wait(400);
        const on = () => state.props.some((p) => p.type === "jets" && p.on);
        if (!on()) return fail("the dialog's Run the water box did not start the water");
        q("cfg-current").click(); await wait(400);
        if (on()) return fail("unticking Run the water did not stop it");
      }
      if (jets && !q("cfg-flow").disabled) {                           // how it is drawn
        choose(q("cfg-flow"), "streaks"); await wait(200);
        if (jets.look !== "streaks") return fail(`the dialog's water look did not change it (${jets.look})`);
        choose(q("cfg-flow"), "mix"); await wait(100);
      }
      q("cfg-close").click(); await wait(100);
      if (q("configui")) return fail("the dialog did not close");
    }
    document.title = `PASS (${backend.name}, tool ${tool}, quality ${TIERS[tier].name}, ${lastFps ? lastFps.toFixed(0) + " fps" : "fps not measured"})`;
  })();
}

window.__rov = { state, backend, camera, controls, jets: () => jets, rings: () => (state.props || []).filter((p) => p.type === "ring") };      // read-only hook for automatic checks (see devtools-driven tests)

// ---------- ?config: a panel to set all of these and make the link ----------
// The Config dialog (configui.js): the toolbar's Config button, or ?config. The "right now" settings (tool, water, pool size, thruster power) are changed through `live`.
const liveCfg = { ...cfg };                                     // the page's settings as they are NOW (the address is kept in step with them)
const mainPoolSize = () => { const m = regions.reduce((a, b) => (b.d > a.d ? b : a)); return [Math.round((m.x1 - m.x0) / 6), Math.round((m.z1 - m.z0) / 3), m.d]; };
const jetsRunning = () => (state.props || []).some((p) => p.type === "jets" && p.on);
function syncAddress() {                                         // a reload or a shared link then keeps these settings
  const sp = new URLSearchParams(toQuery(liveCfg, location.search));
  if (tool !== (backend.defaultTool || "claw")) sp.set("tool", tool); else sp.delete("tool");
  const q = sp.toString();
  try { history.replaceState(null, "", location.pathname + (q ? "?" + q : "")); } catch (e) { /* the address is only a convenience */ }
}
const live = {
  tool: { get: () => tool, set: (t) => { if (t === "nose" || backend.features.claw) setTool(t); } },
  current: backend.features.current && backend.setCurrent ? { get: jetsRunning, set: (on) => backend.setCurrent(on) } : null,
  flow: { get: () => (jets ? jets.look : liveCfg.flow), set: (v) => { if (jets) jets.setLook(v); } },
  pool: backend.setPoolSize ? { get: mainPoolSize, set: (L, W, D) => { backend.setPoolSize(L, W, D); userMoved = false; } } : null,   // (puts everything back at the start; the camera refits)
  buoyancy: { get: () => { const b = state.buoyancy ?? 0; return b > 0.05 ? "positive" : b < -0.05 ? "negative" : "neutral"; }, set: (m) => backend.buoyancy(m) },
  speed: backend.setSpeed ? { get: () => liveCfg.speed, set: (v) => backend.setSpeed(v) } : null,
  thrusters: backend.setThrusters ? { get: () => state.thrusters || 4, set: (n) => backend.setThrusters(n) } : null,
  changed: (c) => { for (const k of ["current", "flow", "speed", "thrusters", "poollength", "poolwidth", "pooldepth"]) liveCfg[k] = c[k]; syncAddress(); },
};
async function openConfig() {
  try { (await import("./configui.js")).showConfig({ cfg: liveCfg, configurable: backend.configurable || {}, live }); }
  catch (e) { console.warn("config dialog failed:", e); }
}
$("config").addEventListener("click", openConfig);
if (cfg.open) openConfig();

requestAnimationFrame(frame);
