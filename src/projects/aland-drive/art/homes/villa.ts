import type { V3 } from "../roadside/mesh";
import { finished, RuralMesh } from "../rural/mesh";
import { bigDoorIn, chimney, deck, doorIn, downpipe, farBlock, foundation, gabledBlock, gravelApron, picketFence, railing, roofSeams, steps, wallOf, windowIn, type Block } from "./exterior";
import type { Home } from "./home";
import { bedroom, garage, kitchen, livingRoom, sauna, type Style } from "./rooms";

/*
 * The third rung: a Mariehamn wooden villa from the sailing-ship years. Pale walls,
 * a red tin roof, a cross gable with fretwork over a long glazed-in veranda, and a
 * red coach house for two cars. The rural kit has boards only in red, grey and tar,
 * so the pale walls are plain, with belts of trim to carry the boarded look.
 */

const SWAP_M = 240;
const REACH_M = 1500;

const WALL = "thwart";
const ROOF = "antifoul";
const HOUSE: Block = { x: -3, z: 0, halfWide: 5, halfLong: 7.5, ridgeAlong: "x", floor: 0.7, eaves: 6, ridge: 8.8, overhang: 0.6, wall: WALL, roof: ROOF };
const CROSS: Block = { x: -3, z: 2.6, halfWide: 2.6, halfLong: 3.2, ridgeAlong: "z", floor: 0.7, eaves: 6, ridge: 8.3, overhang: 0.5, wall: WALL, roof: ROOF };
const COACH: Block = { x: 11.4, z: 1, halfWide: 3.6, halfLong: 3.9, ridgeAlong: "z", eaves: 2.8, ridge: 4.6, overhang: 0.35 };

/** The sawn lace of a gable: a king post and a fan of rays under the barge boards. */
function fretwork(mesh: RuralMesh, x: number, z: number, ridge: number, wide: number) {
  const foot = ridge - 1.5;
  mesh.beam([x, foot, z], [x, ridge - 0.1, z], 0.1, 0.08, "trim");
  mesh.beam([x - wide, foot, z], [x + wide, foot, z], 0.1, 0.08, "trim");
  for (const side of [-1, 1]) {
    for (const reach of [0.33, 0.66]) mesh.beam([x, foot + 0.05, z], [x + side * wide * reach, foot + 1.4 * (1 - reach), z], 0.05, 0.05, "trim");
  }
}

function near() {
  const mesh = new RuralMesh();
  foundation(mesh, -10.6, -5.1, 4.6, 5.1, 0.75);
  gabledBlock(mesh, HOUSE);
  const [front, back, left, right] = [wallOf(HOUSE, "front"), wallOf(HOUSE, "back"), wallOf(HOUSE, "left"), wallOf(HOUSE, "right")];
  for (const along of [-6.3, 6.3, 4.3]) {
    windowIn(mesh, front, along, { wide: 1, tall: 1.7, sill: 1.3, panes: [2, 3], dressed: true });
    windowIn(mesh, front, along, { wide: 1, tall: 1.5, sill: 3.75, panes: [2, 3], dressed: true });
  }
  for (const along of [-6, -3.6, -1.2, 1.2, 3.6, 6]) {
    windowIn(mesh, back, along, { wide: 1, tall: 1.7, sill: 1.3, panes: [2, 3] });
    windowIn(mesh, back, along, { wide: 1, tall: 1.5, sill: 3.75, panes: [2, 3] });
  }
  for (const wall of [left, right]) {
    for (const along of [-2.4, 2.4]) {
      windowIn(mesh, wall, along, { wide: 1, tall: 1.7, sill: 1.3, panes: [2, 3], dressed: true });
      windowIn(mesh, wall, along, { wide: 1, tall: 1.5, sill: 3.75, panes: [2, 3], dressed: true });
    }
    windowIn(mesh, wall, 0, { wide: 0.7, tall: 0.9, sill: 6.5, panes: [2, 2] });
  }
  gabledBlock(mesh, CROSS);
  const crossFront = wallOf(CROSS, "front");
  for (const along of [-1.3, 0, 1.3]) windowIn(mesh, crossFront, along, { wide: 0.9, tall: 1.5, sill: 3.75, panes: [2, 3], dressed: true });
  windowIn(mesh, crossFront, 0, { wide: 0.8, tall: 0.8, sill: 6.3, panes: [2, 2] });
  fretwork(mesh, -3, 6.34, 8.4, 2.1);

  // Belts of trim round the storeys, in the place of boards.
  const wallBelt = (from: V3, to: V3) => {
    for (const y of [1.05, 3.45, 5.8]) mesh.beam([from[0], y, from[2]], [to[0], y, to[2]], 0.05, 0.1, "trim");
  };
  wallBelt([-10.53, 0, 5.03], [-5.6, 0, 5.03]);
  wallBelt([-0.4, 0, 5.03], [4.53, 0, 5.03]);
  wallBelt([-10.53, 0, -5.03], [4.53, 0, -5.03]);
  wallBelt([-10.53, 0, -5.03], [-10.53, 0, 5.03]);
  wallBelt([4.53, 0, -5.03], [4.53, 0, 5.03]);

  // The veranda across the cross gable: deck, posts, a roof of its own and glazing.
  const [verandaLeft, verandaRight] = [-6.2, 0.2];
  const verandaFront = 8.2;
  deck(mesh, verandaLeft, 5.8, verandaRight, verandaFront, 0.72);
  mesh.box([verandaLeft - 0.1, 3.2, 5.8], [verandaRight + 0.1, 3.34, verandaFront + 0.1], "trim", { open: false });
  for (const side of [0, 1]) {
    const edge = side === 0 ? verandaLeft : verandaRight;
    mesh.face([[(verandaLeft + verandaRight) / 2, 4.2, 5.8], [(verandaLeft + verandaRight) / 2, 4.2, verandaFront + 0.3], [edge - (side === 0 ? 0.25 : -0.25), 3.34, verandaFront + 0.3], [edge - (side === 0 ? 0.25 : -0.25), 3.34, 5.8]], ROOF, 1.02);
  }
  mesh.face([[verandaLeft - 0.25, 3.34, verandaFront + 0.31], [verandaRight + 0.25, 3.34, verandaFront + 0.31], [(verandaLeft + verandaRight) / 2, 4.2, verandaFront + 0.31]], "trim");
  const verandaWall = wallOf({ x: -3, z: 7.0, halfWide: 3.2, halfLong: 1.2, ridgeAlong: "x" }, "front");
  const bays = 6;
  for (let bay = 0; bay <= bays; bay++) {
    const x = verandaLeft + ((verandaRight - verandaLeft) * bay) / bays;
    mesh.tube([x, 0.72, verandaFront - 0.05], [x, 3.2, verandaFront - 0.05], 0.06, 5, {}, "trim");
    if (bay < bays && bay !== bays / 2 && bay !== bays / 2 - 1) windowIn(mesh, verandaWall, x + 0.53 + 3, { wide: 0.9, tall: 1.3, sill: 1.55, panes: [2, 2] });
  }
  for (const end of [verandaLeft, verandaRight]) {
    mesh.beam([end, 1.5, 5.9], [end, 1.5, verandaFront - 0.05], 0.1, 0.06, "trim");
    windowIn(mesh, { at: (along, up, out = 0) => [end + (end < -3 ? -out : out), up, 7 + (end < -3 ? along : -along)] }, 0, { wide: 1.9, tall: 1.5, sill: 1.55, panes: [3, 2] });
  }
  railing(mesh, [verandaLeft, 0.72, verandaFront - 0.05], [-4, 0.72, verandaFront - 0.05], { posts: 3 });
  railing(mesh, [-2, 0.72, verandaFront - 0.05], [verandaRight, 0.72, verandaFront - 0.05], { posts: 3 });
  doorIn(mesh, wallOf({ x: -3, z: 2.6, halfWide: 2.6, halfLong: 3.2, ridgeAlong: "z" }, "front"), 0, { wide: 1.2, tall: 2.3, floor: 0.72, glazed: true });
  steps(mesh, -3, verandaFront, 0.72, 3, 1.9);
  chimney(mesh, -7, 0, 7, 9.7, 0.42, "field-stone-pink");
  chimney(mesh, 1, 0, 7, 9.7, 0.42, "field-stone-pink");
  roofSeams(mesh, HOUSE, 26);
  roofSeams(mesh, CROSS, 10);
  downpipe(mesh, front, -7.4, 6);
  downpipe(mesh, front, 7.4, 6);

  gabledBlock(mesh, COACH);
  const coachFront = wallOf(COACH, "front");
  bigDoorIn(mesh, coachFront, -1.65, { wide: 2.7, tall: 2.3, part: "red-boards", cross: true });
  bigDoorIn(mesh, coachFront, 1.65, { wide: 2.7, tall: 2.3, part: "red-boards", cross: true });
  windowIn(mesh, coachFront, 0, { wide: 0.8, tall: 0.7, sill: 3, panes: [2, 2], dressed: false });
  windowIn(mesh, wallOf(COACH, "right"), 0, { wide: 1, tall: 0.7, sill: 1.35, panes: [3, 1] });
  roofSeams(mesh, COACH, 10);

  picketFence(mesh, [-14, 0, 11], [7, 0, 11], 72);
  picketFence(mesh, [-14, 0, 11], [-14, 0, -6], 40);
  gravelApron(mesh, 8.4, 4.9, 14.4, 11.2);
  gravelApron(mesh, -4, 9.1, -2, 11.2);
  return mesh;
}

function far() {
  const mesh = new RuralMesh();
  farBlock(mesh, HOUSE);
  farBlock(mesh, CROSS);
  farBlock(mesh, COACH);
  mesh.box([-6.2, 0, 5.8], [0.2, 3.3, 8.2], WALL, { open: true });
  mesh.face([[-6.5, 3.3, 8.4], [0.5, 3.3, 8.4], [0.5, 3.3, 5.8], [-6.5, 3.3, 5.8]], ROOF);
  return mesh;
}

const STYLE: Style = { floor: "floor-dark", walls: { rest: "wall-paper", south: "wall-sage" }, ceiling: "ceiling", wood: "walnut", view: "view-town", tall: 3.2, panes: [2, 3], skirting: "paint-white" };

export const VILLA: Home = {
  id: "villa",
  name: "Villa Esplanad",
  tier: 3,
  site: {
    halfPlot: [16, 13],
    shoreZ: null,
    frontDoor: [-3, 0.72, 9],
    garageDoor: { at: [11.4, 0, 4.9], wide: 6 },
    views: [
      { name: "front", position: [-18, 3.5, 30], target: [-1, 3.6, 2], fieldOfViewDeg: 30 },
      { name: "gate", position: [-3, 1.6, 22], target: [-3, 3.9, 4], fieldOfViewDeg: 36 },
      { name: "garden", position: [20, 4, -24], target: [1, 3, 0], fieldOfViewDeg: 32 },
    ],
  },
  exterior: () => finished(near(), far(), SWAP_M, REACH_M),
  interior: () => [
    livingRoom(STYLE, { wide: 6.4, deep: 5, fire: "tile", sofaWide: 2.5, fabric: "navy", cushion: "mustard", chairFabric: "rust", rugPart: "rug-red", pictures: ["boat", "sea", "island"], windows: [[-1.5, 1.2], [1.5, 1.2]], windowTall: 2, sill: 0.7, shelfWide: 1.8 }),
    kitchen({ ...STYLE, walls: "wall-white-panel" }, { wide: 4.8, deep: 4.2, front: "paint-white", top: "walnut", splash: "tile-blue", tableWood: "walnut", chairWood: "walnut", seat: "linen", windowTall: 1.7, picture: "boat" }),
    sauna({ wide: 2.8, deep: 3, view: "view-town", benchWood: "birch", walls: "wall-aspen" }),
    bedroom(STYLE, { wide: 4.6, deep: 4.4, bedWide: 1.8, cover: "wool", throwPart: "mustard", rugPart: "rug-red", pictureKind: "sea", windowWide: 1.3, windowTall: 1.9, sill: 0.75, wardrobePart: "walnut" }),
    garage({ wide: 6.8, deep: 7.6, tall: 2.7, walls: "wall-white-panel", doors: [[-1.65, 2.7], [1.65, 2.7]], doorTall: 2.3, view: "view-town" }),
  ],
};
