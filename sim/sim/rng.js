// rng.js — a small seeded random generator (mulberry32) with the few Python-like helpers the fish uses.
// NOT the same numbers as Python's random.Random: the JS fish behaves like the Python one, but swims its own paths.
export class Rng {
  constructor(seed = 1) { this.a = seed >>> 0; }
  random() {
    this.a = (this.a + 0x6D2B79F5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(a, b) { return a + (b - a) * this.random(); }
  choice(arr) { return arr[Math.floor(this.random() * arr.length)]; }
  /** one weighted pick (Python: random.choices(arr, weights)[0]) */
  weighted(arr, weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this.random() * total;
    for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r < 0) return arr[i]; }
    return arr[arr.length - 1];
  }
}
