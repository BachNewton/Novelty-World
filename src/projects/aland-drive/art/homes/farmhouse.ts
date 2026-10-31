import { finished, RuralMesh } from "../rural/mesh";
import { bigDoorIn, chimney, doorIn, downpipe, farBlock, flagpole, foundation, gabledBlock, gravelApron, picketFence, porch, roofSeams, wallOf, windowIn, woodpile, type Block } from "./exterior";
import type { Home } from "./home";
import { bedroom, garage, kitchen, livingRoom, sauna, type Style } from "./rooms";

/*
 * The second rung: a two-storey red farmhouse with a glazed porch, its barn across the
 * yard, which is the garage, and a sauna in a lean-to at the barn's end.
 */

const SWAP_M = 260;
const REACH_M = 1600;

const HOUSE: Block = { x: -7, z: 0, halfWide: 4.2, halfLong: 6.5, ridgeAlong: "x", floor: 0.5, eaves: 5.3, ridge: 7.6, overhang: 0.45 };
const BARN: Block = { x: 11, z: -1.5, halfWide: 5, halfLong: 7, ridgeAlong: "x", eaves: 4, ridge: 7.2, overhang: 0.4 };
const LEAN_TO: Block = { x: 20.5, z: -1.5, halfWide: 2.4, halfLong: 2.5, ridgeAlong: "z", eaves: 2.4, ridge: 3.3, overhang: 0.3 };

function near() {
  const mesh = new RuralMesh();
  foundation(mesh, -13.6, -4.3, -0.4, 4.3, 0.55);
  gabledBlock(mesh, HOUSE);
  const [front, back, left, right] = [wallOf(HOUSE, "front"), wallOf(HOUSE, "back"), wallOf(HOUSE, "left"), wallOf(HOUSE, "right")];
  doorIn(mesh, front, 0, { floor: 0.5, glazed: true });
  for (const along of [-4.6, -2.3, 2.3, 4.6]) {
    windowIn(mesh, front, along, { wide: 1, tall: 1.4, sill: 1.25, dressed: true });
    windowIn(mesh, back, along, { wide: 1, tall: 1.4, sill: 1.25 });
  }
  for (const along of [-4.6, -2.3, 0, 2.3, 4.6]) {
    windowIn(mesh, front, along, { wide: 0.9, tall: 1.15, sill: 3.65 });
    windowIn(mesh, back, along, { wide: 0.9, tall: 1.15, sill: 3.65 });
  }
  for (const wall of [left, right]) {
    windowIn(mesh, wall, -1.6, { wide: 0.9, tall: 1.2, sill: 1.3 });
    windowIn(mesh, wall, 1.6, { wide: 0.9, tall: 1.2, sill: 1.3 });
    windowIn(mesh, wall, 0, { wide: 0.8, tall: 1, sill: 5.6, panes: [2, 2] });
  }
  porch(mesh, -7, 4.2, { wide: 3, deep: 1.8, eaves: 3, rise: 3.7, floor: 0.5 });
  chimney(mesh, -9.5, 0, 6.2, 8.5, 0.38);
  chimney(mesh, -3.5, 0, 6.2, 8.5, 0.38);
  roofSeams(mesh, HOUSE, 22);
  downpipe(mesh, front, -6.4, 5.3);
  downpipe(mesh, front, 6.4, 5.3);

  gabledBlock(mesh, BARN);
  mesh.box([3.8, -0.4, -6.7], [18.2, 0.35, 3.7], "stone", { open: true });
  const barnFront = wallOf(BARN, "front");
  bigDoorIn(mesh, barnFront, -3.2, { wide: 2.7, tall: 2.5, part: "red-boards", cross: true });
  bigDoorIn(mesh, barnFront, 0, { wide: 2.7, tall: 2.5, part: "red-boards", cross: true });
  bigDoorIn(mesh, barnFront, 3.2, { wide: 2.7, tall: 2.5, part: "red-boards", cross: true });
  const barnEnd = wallOf(BARN, "left");
  windowIn(mesh, barnEnd, 0, { wide: 1.4, tall: 1.4, sill: 4.3, panes: [3, 3] });
  bigDoorIn(mesh, wallOf(BARN, "back"), 0, { wide: 3.4, tall: 2.8, part: "grey-boards", cross: true });
  for (const along of [-5.5, -2, 2, 5.5]) windowIn(mesh, wallOf(BARN, "back"), along, { wide: 0.9, tall: 0.6, sill: 2.2, panes: [3, 1] });
  roofSeams(mesh, BARN, 20);
  // The hay door in the roof's dormer.
  mesh.box([9.8, 4, 3.2], [12.2, 5.3, 4], "red-boards", { open: true });
  mesh.face([[9.5, 5.3, 4.4], [12.5, 5.3, 4.4], [11, 6.4, 4.4]], "trim");
  mesh.face([[9.6, 5.25, 4.41], [12.4, 5.25, 4.41], [11, 6.3, 4.41]], "red-boards");
  bigDoorIn(mesh, { at: (along, up, out = 0) => [11 + along, 4 + up, 4 + out] }, 0, { wide: 1.4, tall: 1.1, part: "tar-boards", cross: true });

  gabledBlock(mesh, LEAN_TO);
  doorIn(mesh, wallOf(LEAN_TO, "front"), -0.9, { wide: 0.8, tall: 1.9 });
  windowIn(mesh, wallOf(LEAN_TO, "front"), 1, { wide: 0.7, tall: 0.5, sill: 1.2, panes: [1, 1] });
  chimney(mesh, 21.5, -1.5, 2.7, 3.9, 0.12, "tractor-dark");

  woodpile(mesh, 19.5, 2.5, 3);
  flagpole(mesh, -15.5, 7);
  picketFence(mesh, [-16, 0, 11], [3, 0, 11], 50);
  gravelApron(mesh, -1, 3.8, 18, 14);
  return mesh;
}

function far() {
  const mesh = new RuralMesh();
  farBlock(mesh, HOUSE);
  farBlock(mesh, BARN);
  farBlock(mesh, LEAN_TO);
  return mesh;
}

const STYLE: Style = { floor: "floor-limed", walls: { rest: "wall-paper", north: "wall-log" }, ceiling: "ceiling", wood: "walnut", view: "view-field", tall: 2.6, beams: 4, panes: [2, 3] };

export const FARMHOUSE: Home = {
  id: "farmhouse",
  name: "Gården",
  tier: 2,
  site: {
    halfPlot: [24, 14],
    shoreZ: null,
    frontDoor: [-7, 0.5, 6.2],
    garageDoor: { at: [11, 0, 3.5], wide: 2.7 },
    views: [
      { name: "front", position: [-20, 4, 32], target: [3, 3, 0], fieldOfViewDeg: 30 },
      { name: "yard", position: [24, 2.2, 22], target: [2, 3, 0], fieldOfViewDeg: 34 },
      { name: "back", position: [12, 5, -36], target: [2, 3, 0], fieldOfViewDeg: 30 },
    ],
  },
  exterior: () => finished(near(), far(), SWAP_M, REACH_M),
  interior: () => [
    livingRoom(STYLE, { wide: 6, deep: 4.8, fire: "wood", sofaWide: 2.4, fabric: "moss", cushion: "mustard", chairFabric: "rust", rugPart: "rug-blue", pictures: ["field", "island", "sea"], windows: [[-1.3, 1.1], [1.3, 1.1]], windowTall: 1.5, sill: 0.75, shelfWide: 1.5 }),
    kitchen({ ...STYLE, walls: "wall-white-panel" }, { wide: 5, deep: 4.2, front: "paint-white", top: "oak", splash: "tile-blue", tableWood: "oak", chairWood: "paint-sage", picture: "field", windowWide: 1.4 }),
    sauna({ wide: 3, deep: 3, view: "view-field", walls: "wall-log", benchWood: "wall-aspen" }),
    bedroom(STYLE, { wide: 4.4, deep: 4.2, bedWide: 1.6, cover: "linen", throwPart: "rug-red", rugPart: "rug-blue", pictureKind: "field", wardrobePart: "paint-sage" }),
    garage({ wide: 9.6, deep: 8.4, tall: 3.6, walls: "wall-boards", doors: [[-3.2, 2.6], [0, 2.6], [3.2, 2.6]], doorTall: 2.4, beams: 4 }),
  ],
};
