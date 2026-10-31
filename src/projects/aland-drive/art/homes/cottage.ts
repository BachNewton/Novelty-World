import { finished, RuralMesh } from "../rural/mesh";
import { bigDoorIn, chimney, deck, doorIn, downpipe, farBlock, flagpole, foundation, gabledBlock, gravelApron, jetty, picketFence, railing, roofSeams, steps, wallOf, windowIn, woodpile, type Block } from "./exterior";
import type { Home } from "./home";
import { bedroom, garage, kitchen, livingRoom, sauna, type Style } from "./rooms";

/*
 * The first rung: a small red cottage on the rocks, a one-car shed beside it, and a
 * sauna on the shore with its own jetty.
 */

const SWAP_M = 220;
const REACH_M = 1400;
const SHORE_Z = -11;

const HOUSE: Block = { x: 0, z: 2, halfWide: 3, halfLong: 4.6, ridgeAlong: "x", floor: 0.3, eaves: 2.9, ridge: 4.7, overhang: 0.4 };
const SHED: Block = { x: 8.3, z: 2.6, halfWide: 2, halfLong: 3.8, ridgeAlong: "z", eaves: 2.6, ridge: 3.7, overhang: 0.3 };
const SAUNA: Block = { x: -6.5, z: -8.2, halfWide: 1.9, halfLong: 2.3, ridgeAlong: "x", floor: 0.15, eaves: 2.2, ridge: 3.3, overhang: 0.35 };

function near() {
  const mesh = new RuralMesh();
  foundation(mesh, -4.75, -1.15, 4.75, 5.15, 0.32);
  gabledBlock(mesh, HOUSE);
  const [front, back] = [wallOf(HOUSE, "front"), wallOf(HOUSE, "back")];
  doorIn(mesh, front, -0.4, { floor: 0.3, glazed: true });
  windowIn(mesh, front, -2.7, { wide: 0.95, tall: 1.15, sill: 1.05 });
  windowIn(mesh, front, 1.8, { wide: 0.95, tall: 1.15, sill: 1.05 });
  windowIn(mesh, front, 3.5, { wide: 0.75, tall: 0.95, sill: 1.15 });
  windowIn(mesh, back, -2.5, { wide: 1.3, tall: 1.3, sill: 0.95 });
  windowIn(mesh, back, 0, { wide: 1.3, tall: 1.3, sill: 0.95 });
  windowIn(mesh, back, 2.6, { wide: 0.95, tall: 1.15, sill: 1.05 });
  windowIn(mesh, wallOf(HOUSE, "left"), 0, { wide: 0.7, tall: 0.8, sill: 3.05, panes: [2, 1] });
  windowIn(mesh, wallOf(HOUSE, "right"), 0, { wide: 0.7, tall: 0.8, sill: 3.05, panes: [2, 1] });
  chimney(mesh, 1.6, 2, 3.6, 5.35);
  steps(mesh, -0.4, 5.15, 0.3, 2);

  gabledBlock(mesh, SHED);
  const shedFront = wallOf(SHED, "front");
  bigDoorIn(mesh, shedFront, 0, { wide: 2.6, tall: 2.2, part: "grey-boards", ribs: 3 });
  windowIn(mesh, wallOf(SHED, "right"), 0, { wide: 0.8, tall: 0.5, sill: 1.5, panes: [2, 1] });

  gabledBlock(mesh, SAUNA);
  const saunaFront = wallOf(SAUNA, "back");
  doorIn(mesh, saunaFront, -1, { wide: 0.75, tall: 1.9, floor: 0.15 });
  windowIn(mesh, saunaFront, 0.9, { wide: 0.7, tall: 0.5, sill: 1.15, panes: [1, 1] });
  chimney(mesh, -7.5, -8.2, 2.7, 3.9, 0.12, "tractor-dark");
  deck(mesh, -9, -13, -4, -10.5, 0.42);
  railing(mesh, [-9, 0.42, -13], [-9, 0.42, -10.5], { posts: 2 });
  jetty(mesh, -6.5, -13, -22, { bays: 3 });
  roofSeams(mesh, HOUSE, 16);
  roofSeams(mesh, SHED, 10);
  roofSeams(mesh, SAUNA, 8);
  downpipe(mesh, front, -4.5, 2.9);
  downpipe(mesh, front, 4.5, 2.9);
  woodpile(mesh, 3.4, -0.3 - 2);
  flagpole(mesh, -8, 6);
  picketFence(mesh, [-11, 0, 9], [5.5, 0, 9], 44);
  gravelApron(mesh, 6.5, 6.4, 10.1, 14);
  return mesh;
}

function far() {
  const mesh = new RuralMesh();
  farBlock(mesh, HOUSE);
  farBlock(mesh, SHED);
  farBlock(mesh, SAUNA);
  mesh.box([-7.3, 0.4, -22], [-5.7, 0.55, -13], "deck-pale", { open: true });
  return mesh;
}

const STYLE: Style = { floor: "floor-pine", walls: { rest: "wall-white-panel", north: "wall-pine" }, ceiling: "ceiling-boards", wood: "pine", view: "view-sea", tall: 2.35, beams: 3, panes: [2, 2] };

export const COTTAGE: Home = {
  id: "cottage",
  name: "Sjöstuga",
  tier: 1,
  site: {
    halfPlot: [12, 24],
    shoreZ: SHORE_Z,
    frontDoor: [-0.4, 0.3, 6.6],
    garageDoor: { at: [8.3, 0, 6.4], wide: 2.6 },
    views: [
      { name: "front", position: [17, 3.6, 25], target: [2, 2, 2], fieldOfViewDeg: 26 },
      { name: "road", position: [-9, 1.7, 24], target: [1, 2.5, 2], fieldOfViewDeg: 30 },
      { name: "water", position: [-20, 2.6, -34], target: [-2, 1.6, -4], fieldOfViewDeg: 30 },
    ],
  },
  exterior: () => finished(near(), far(), SWAP_M, REACH_M),
  interior: () => [
    livingRoom(STYLE, { wide: 4.8, deep: 4, fire: "wood", sofaWide: 1.8, fabric: "linen", cushion: "navy", chairFabric: "moss", pictures: ["sea", "boat"], windows: [[-0.9, 1.3], [1.0, 1.3]], shelfWide: 1 }),
    kitchen(STYLE, { wide: 3.6, deep: 3.4, front: "paint-blue", top: "pine", tableWood: "pine", seat: "pine", picture: "island" }),
    sauna({ wide: 2.4, deep: 2.8, view: "view-shore" }),
    bedroom({ ...STYLE, walls: "wall-white-panel" }, { wide: 3.4, deep: 3.6, bedWide: 1.4, cover: "wool", throwPart: "rust", pictureKind: "island", wardrobePart: "pine" }),
    garage({ wide: 3.7, deep: 7.4, tall: 2.5, walls: "wall-boards", doors: [[0, 2.6]], view: "view-shore" }),
  ],
};
