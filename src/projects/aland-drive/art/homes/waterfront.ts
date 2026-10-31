import { finished, RuralMesh, type RuralPart } from "../rural/mesh";
import { bigDoorIn, deck, doorIn, farBlock, flatBlock, jetty, wallOf, windowIn, type Block, type WallFrame } from "./exterior";
import type { Home } from "./home";
import { bedroom, garage, kitchen, livingRoom, sauna, type Style } from "./rooms";

/*
 * The top rung: a modern house on the rocks, a long box of dark larch under a red one
 * slid out over it, a wall of glass to the water, a terrace on piers, a
 * garage for four cars along the road, and a glass sauna by the jetty.
 */

const SWAP_M = 260;
const REACH_M = 1600;
const SHORE_Z = -11;

const LOWER: Block = { x: 0, z: 0, halfWide: 5, halfLong: 11, ridgeAlong: "x", eaves: 3.2, ridge: 3.2, overhang: 0.1, wall: "tar-boards" };
const UPPER: Block = { x: 3, z: -1.2, halfWide: 4.6, halfLong: 8, ridgeAlong: "x", floor: 3.5, eaves: 6.4, ridge: 6.4, overhang: 0.7, wall: "red-boards" };
const GARAGE: Block = { x: -6, z: 10.2, halfWide: 3.9, halfLong: 6.6, ridgeAlong: "x", eaves: 2.9, ridge: 2.9, overhang: 0.3, wall: "grey-boards" };
const SAUNA: Block = { x: -12, z: -9.5, halfWide: 1.8, halfLong: 2.3, ridgeAlong: "x", floor: 0.3, eaves: 2.7, ridge: 2.7, overhang: 0.5, wall: "tar-boards" };

/** A full-height wall of glass in slim dark frames. */
function glassWall(mesh: RuralMesh, wall: WallFrame, from: number, to: number, floor: number, tall: number, bays: number, frame: RuralPart = "tractor-dark") {
  const pane = (a0: number, y0: number, a1: number, y1: number, out: number, part: RuralPart) => mesh.face([wall.at(a0, y0, out), wall.at(a1, y0, out), wall.at(a1, y1, out), wall.at(a0, y1, out)], part);
  pane(from, floor, to, floor + tall, 0.03, "tractor-glass");
  for (let bay = 0; bay <= bays; bay++) {
    const a = from + ((to - from) * bay) / bays;
    pane(a - 0.035, floor, a + 0.035, floor + tall, 0.05, frame);
  }
  pane(from, floor, to, floor + 0.08, 0.05, frame);
  pane(from, floor + tall - 0.08, to, floor + tall, 0.05, frame);
}

function near() {
  const mesh = new RuralMesh();
  mesh.box([-11.6, -0.5, -5.6], [11.6, 0.12, 5.6], "stone", { open: true });
  flatBlock(mesh, LOWER);
  flatBlock(mesh, UPPER, "trim");
  const [lowFront, lowBack, lowLeft] = [wallOf(LOWER, "front"), wallOf(LOWER, "back"), wallOf(LOWER, "left")];
  glassWall(mesh, lowBack, -10.6, 10.6, 0.12, 2.95, 9);
  const upBack = wallOf(UPPER, "back");
  glassWall(mesh, upBack, -7.6, 7.6, 3.6, 2.7, 7);
  const upFront = wallOf(UPPER, "front");
  for (const along of [-6, -3, 0, 3, 6]) windowIn(mesh, upFront, along, { wide: 1.8, tall: 1.6, sill: 4.3, panes: [1, 1], frame: "tractor-dark" });
  glassWall(mesh, wallOf(UPPER, "right"), -3.6, 3.6, 3.6, 2.7, 3);
  glassWall(mesh, lowLeft, -3.5, 3.5, 0.12, 2.95, 3);
  glassWall(mesh, lowFront, 2.5, 10.5, 0.12, 2.95, 4);
  doorIn(mesh, lowFront, 1.1, { wide: 1.3, tall: 2.5, floor: 0.12, part: "mill-timber-dark", frame: "tractor-dark" });
  // The pale concrete fin that frames the door, and the canopy off it.
  mesh.box([-0.2, 0, 5.05], [0.2, 3.1, 8.2], "stone", { open: true });
  mesh.box([-0.2, 2.8, 5.05], [2.6, 3.0, 7.6], "stone");

  // The terrace to the water, on concrete piers, with a glass balustrade.
  deck(mesh, -11, -11, 11, -5.1, 0.12, "deck-pale");
  mesh.box([3, 0, -11.4], [11, 0.32, -5.1], "deck-pale", { open: true });
  for (const x of [-10, -5, 0, 5, 10]) mesh.box([x - 0.25, -2, -11.2], [x + 0.25, 0.1, -10.7], "stone", { open: true });
  const edge: WallFrame = { at: (along, up, out = 0) => [along, up, -11 - out] };
  glassWall(mesh, edge, -11, 2.5, 0.12, 0.95, 8, "tractor-steel");
  mesh.box([-11, 0.12, -7.5], [-6, 0.56, -5.7], "stone", { open: true });
  // A bench and a table on the deck.
  mesh.box([4, 0.32, -9], [7, 0.76, -8.2], "deck", { open: true });
  mesh.box([4, 0.32, -7], [6.2, 0.75, -6.2], "tractor-dark", { open: true });

  flatBlock(mesh, GARAGE);
  const garageFront = wallOf(GARAGE, "front");
  for (const along of [-4.65, -1.55, 1.55, 4.65]) bigDoorIn(mesh, garageFront, along, { wide: 2.7, tall: 2.3, part: "tar-boards", frame: "tractor-dark", ribs: 6 });
  mesh.box([-13, -0.2, 14.1], [1, 0.05, 20], "stone", { open: true, shade: 1.1 });

  flatBlock(mesh, SAUNA);
  glassWall(mesh, wallOf(SAUNA, "back"), -2.2, 2.2, 0.3, 2.35, 3);
  deck(mesh, -15, -15, -9, -11.8, 0.42, "deck-pale");
  mesh.tube([-12.9, 3, -9.5], [-12.9, 3.8, -9.5], 0.1, 5, {}, "tractor-steel");
  jetty(mesh, -12, -15, -26, { wide: 2, bays: 3, y: 0.42 });
  return mesh;
}

function far() {
  const mesh = new RuralMesh();
  farBlock(mesh, LOWER);
  farBlock(mesh, UPPER);
  farBlock(mesh, GARAGE);
  farBlock(mesh, SAUNA);
  mesh.box([-11, 0, -11], [11, 0.15, -5], "deck-pale", { open: true });
  return mesh;
}

const STYLE: Style = { floor: "floor-oak", walls: { rest: "wall-plaster", south: "wall-concrete" }, ceiling: "ceiling", wood: "oak", view: "view-sea", tall: 2.9, panes: [4, 1] };

export const WATERFRONT: Home = {
  id: "waterfront",
  name: "Strandvillan",
  tier: 4,
  site: {
    halfPlot: [17, 28],
    shoreZ: SHORE_Z,
    frontDoor: [1.1, 0.12, 6.4],
    garageDoor: { at: [-6, 0, 14.2], wide: 12 },
    views: [
      { name: "water", position: [16, 2.6, -40], target: [0, 2.8, -2], fieldOfViewDeg: 30 },
      { name: "shore", position: [-26, 1.6, -26], target: [-2, 2.6, -4], fieldOfViewDeg: 30 },
      { name: "road", position: [14, 2.2, 32], target: [-2, 2.4, 6], fieldOfViewDeg: 32 },
    ],
  },
  exterior: () => finished(near(), far(), SWAP_M, REACH_M),
  interior: () => [
    livingRoom(STYLE, { wide: 8, deep: 6, fire: "wall", sofaWide: 3, fabric: "wool", cushion: "navy", chairFabric: "moss", rugPart: "rug-pale", pictures: ["sea"], windows: [[0, 7.4]], windowTall: 2.6, sill: 0.08, curtained: false, shelfWide: 2 }),
    kitchen({ ...STYLE, walls: "wall-plaster" }, { wide: 6.4, deep: 5.8, front: "walnut", top: "concrete", splash: "wall-concrete", tableWood: "oak", chairWood: "black", windowWide: 3.8, windowTall: 1.5, island: true, picture: "island" }),
    sauna({ wide: 3.2, deep: 3.2, view: "view-sea", walls: "wall-aspen", benchWood: "walnut", windowWide: 2.2, windowTall: 1.5, sill: 0.45, tall: 2.4 }),
    bedroom({ ...STYLE, panes: [2, 1] }, { wide: 5, deep: 4.6, bedWide: 1.8, cover: "wool", throwPart: "navy", rugPart: "rug-pale", pictureKind: "island", windowWide: 3.2, windowTall: 2.4, sill: 0.1 }),
    garage({ wide: 12.6, deep: 7.5, tall: 2.8, walls: "wall-concrete", ceiling: "ceiling", doors: [[-4.65, 2.7], [-1.55, 2.7], [1.55, 2.7], [4.65, 2.7]], doorTall: 2.3, view: "view-sea" }),
  ],
};
