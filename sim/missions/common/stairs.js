// stairs.js — where the pool's stairs are (shared by the missions). No DOM.
import { POOL_REGIONS, POOL_WATER } from "../../sim/physics.js";
/** The stairs as one rectangle [x0, x1, y0, y1], or null. */
export function stairsRect() {
  const st = POOL_REGIONS.slice(POOL_WATER.length);
  if (!st.length) return null;
  return [Math.min(...st.map((r) => r[0])), Math.max(...st.map((r) => r[1])), Math.min(...st.map((r) => r[2])), Math.max(...st.map((r) => r[3]))];
}
