// board.js — the score board of a mission: a list of scored items, each earned or not (and un-earned again when it is lost). No DOM.
export class ScoreBoard {
  /** items: [{ id, label, points, group }] */
  constructor(items) {
    this.items = items.map((i) => ({ ...i, earned: false, at: null }));
    this.byId = new Map(this.items.map((i) => [i.id, i]));
  }
  reset() { for (const i of this.items) { i.earned = false; i.at = null; } }
  /** Mark an item earned (true) or lost (false). `at` is the clock time. Returns true if that changed it. */
  set(id, earned, at = 0) {
    const i = this.byId.get(id);
    if (!i) throw new Error(`no scored item "${id}"`);
    earned = !!earned;
    if (i.earned === earned) return false;
    i.earned = earned; i.at = earned ? at : null;
    return true;
  }
  get(id) { return this.byId.get(id).earned; }
  get total() { return this.items.reduce((s, i) => s + (i.earned ? i.points : 0), 0); }
  get max() { return this.items.reduce((s, i) => s + i.points, 0); }
  data() { return { items: this.items.map((i) => ({ id: i.id, label: i.label, points: i.points, group: i.group, earned: i.earned, at: i.at })), total: this.total, max: this.max }; }
}
