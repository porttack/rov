// plaques.js — the little signs on the pool floor beside each prop (key P / the Labels button): the task number, what the prop is, and the real-world thing it stands for.
// Wall-relative spots like layout.js (u out from the wall, v to the left). Edit the words here. No DOM, no three.js (the view draws them).
export const PLAQUES = [
  { id: "p11", task: "1.1", title: "Basket stars and corals", text: "Bring each one to the deck.", real: "Real world: cold-water coral gardens on the seabed (Seabed 2030).", spot: [2.25, 1.5] },
  { id: "p12", task: "1.2", title: "Transect", text: "Fly the pipe end to end.", real: "Real world: researchers fly a line over the seabed and count what they see.", spot: [0.75, 0.5] },
  { id: "p21", task: "2.1", title: "Green crabs", text: "Remove them: to the deck.", real: "Real world: an invasive crab that harms eelgrass and shellfish.", spot: [2.25, -1.5] },
  { id: "p22", task: "2.2", title: "Iceberg", text: "Press a marker onto each leg.", real: "Real world: SmartAtlantic tracks icebergs near oil platforms.", spot: [1.75, -2.5] },
  { id: "p23", task: "2.3", title: "Lobster pot", text: "Push the red handle round.", real: "Real world: a sonar release floats the buoy: no rope for whales.", spot: [4.25, -2.5] },
  { id: "p24a", task: "2.4", title: "eDNA sensors", text: "Old one out; new one upright in the square.", real: "Real world: eDNA is DNA animals leave in the water.", spot: [0.75, -1.5] },
  { id: "p24b", task: "2.4", title: "Observatory", text: "Plug the connector into the port.", real: "Real world: the Holyrood subsea observatory.", spot: [3.25, -2.5] },
  { id: "p31a", task: "3.1", title: "Power connector", text: "Lift it off its stand.", real: "Real world: a wind farm's subsea power cable.", spot: [0.75, 1.5] },
  { id: "p31b", task: "3.1", title: "Waypoint", text: "Run the wire between the posts.", real: "Real world: cables follow a planned route.", spot: [3.25, 2.5] },
  { id: "p31c", task: "3.1", title: "Oil platform port", text: "Push the Velcro tip in.", real: "Real world: powers an offshore oil platform.", spot: [4.75, 2.5] },
];

// A plaque is two floor tiles (the tiles are 0.5 m): 1.0 m along the pool's width and 0.5 m along its length, fixed in place with the top of the text pointing away from the wall
// (so it reads the right way up for someone on the deck looking out over the pool). Its middle snaps to the tile grid: x to the middle of a tile, z (= -y) to a tile edge.
export const TILE = 0.5, PLAQUE_ALONG = 2 * TILE, PLAQUE_ACROSS = TILE;
/** The snapped middle [x, y] (sim coordinates) of a plaque wanted near (x, y). The tiles start at the pool's corner, a multiple of 0.5 m. */
export function snapPlaque(x, y) {
  const sx = Math.round((x - TILE / 2) / TILE) * TILE + TILE / 2, sz = Math.round(-y / TILE) * TILE;
  return [sx, -sz];
}
