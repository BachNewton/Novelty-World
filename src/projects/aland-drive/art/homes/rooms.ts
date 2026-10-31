import type { BufferGeometry } from "three/webgpu";
import { armchair, bed, bookshelf, bucket, ceilingStrip, chair, coffeeTable, curtains, diningSet, floorLamp, kitchenRun, logBasket, nightstand, pendant, picture, plant, rug, saunaBenches, saunaStove, shelfRack, sideTable, sofa, tileStove, towelRail, tyreStack, wallFire, wardrobe, woodStove, workbench, benchLow, type PictureKind } from "./furniture";
import { fitCars, type GarageFit } from "./garage";
import type { InteriorPart, ViewPart } from "./paint";
import { RoomMesh, type V3 } from "./room-mesh";
import { buildShell, type Opening, type ShellSpec } from "./shell";

/*
 * The five rooms, as functions of a home's style and sizes, so every home shares
 * them and differs by numbers and materials. Each room is its own geometry, its own
 * draw call, shown alone with the fixed cameras it comes with. Rooms stand on their
 * own origin, floor at y = 0.
 */

export interface RoomCamera {
  name: string;
  position: V3;
  target: V3;
  fieldOfViewDeg: number;
}

export interface Room {
  id: "living" | "kitchen" | "sauna" | "bedroom" | "garage";
  label: string;
  geometry: BufferGeometry;
  triangles: number;
  cameras: RoomCamera[];
  size: { wide: number; deep: number; tall: number };
  /** A garage's bays. */
  fit?: GarageFit;
}

export interface Style {
  floor: InteriorPart;
  walls: ShellSpec["walls"];
  ceiling: InteriorPart;
  wood: InteriorPart;
  view: ViewPart;
  tall: number;
  beams?: number;
  /** Panes of a window, across and up. */
  panes?: readonly [number, number];
  skirting?: InteriorPart;
}

const EYE_M = 1.45;
/** Up and down: the view is 2.4 wide to 1 tall, so this is already wide across. */
const LENS = 54;

const windowOn = (wall: Opening["wall"], at: number, wide: number, tall: number, sill: number, panes: readonly [number, number] | undefined): Opening => ({ wall, at, wide, tall, sill, kind: "window", panes });
const doorOn = (wall: Opening["wall"], at: number): Opening => ({ wall, at, wide: 0.9, tall: 2.05, sill: 0, kind: "door" });

function finish(id: Room["id"], label: string, mesh: RoomMesh, size: Room["size"], cameras: RoomCamera[], fit?: GarageFit): Room {
  return { id, label, triangles: mesh.triangles, geometry: mesh.build(), cameras, size, fit };
}

const roomMesh = (wide: number, deep: number, tall: number) => new RoomMesh([-wide / 2, 0, -deep / 2], [wide / 2, tall, deep / 2]);

export interface LivingOptions {
  wide: number;
  deep: number;
  fire: "wood" | "tile" | "wall";
  sofaWide?: number;
  fabric?: InteriorPart;
  cushion?: InteriorPart;
  chairFabric?: InteriorPart;
  rugPart?: InteriorPart;
  /** Window width on the north wall, and how many. */
  windows?: readonly (readonly [at: number, wide: number])[];
  windowTall?: number;
  sill?: number;
  pictures?: readonly PictureKind[];
  curtained?: boolean;
  shelfWide?: number;
}

export function livingRoom(style: Style, options: LivingOptions): Room {
  const { wide, deep, fire, sofaWide = 2, fabric = "linen", cushion = "rust", chairFabric = "mustard", rugPart = "rug-red", windows = [[0, 1.5]], windowTall = 1.3, sill = 0.8, pictures = ["sea", "island"], curtained = true, shelfWide = 1.3 } = options;
  const { tall, wood } = style;
  const mesh = roomMesh(wide, deep, tall);
  const [halfX, halfZ] = [wide / 2, deep / 2];
  buildShell(mesh, { ...style, wide, deep, openings: [...windows.map(([at, w]) => windowOn("north", at, w, windowTall, sill, style.panes)), doorOn("east", halfZ - 0.75)] });

  mesh.place(0, 0.25, 0, (m) => {
    rug(m, { wide: Math.min(wide - 1.6, 3), deep: 2, part: rugPart });
  });
  mesh.place(-0.1, halfZ - 0.55, 2, (m) => {
    sofa(m, { wide: sofaWide, fabric, cushion, wood, seats: sofaWide > 2.2 ? 3 : 2 });
  });
  mesh.place(-0.1, halfZ - 1.65, 0, (m) => {
    coffeeTable(m, { wood });
  });
  mesh.place(-halfX + 0.7, 0, 1, (m) => {
    armchair(m, { fabric: chairFabric, wood });
  });
  if (fire === "wood") {
    mesh.place(halfX - 0.65, -0.35, 3, (m) => {
      woodStove(m, { flueTo: tall });
    });
    mesh.place(halfX - 0.4, -1.35 < -halfZ + 0.3 ? -halfZ + 0.4 : -1.35, 3, (m) => {
      logBasket(m);
    });
  } else if (fire === "tile") {
    mesh.place(halfX - 0.45, -halfZ + 0.45, 3, (m) => {
      tileStove(m, { tall: tall - 0.15 });
    });
  } else {
    mesh.place(halfX - 0.14, -0.3, 3, (m) => {
      wallFire(m);
    });
  }
  mesh.place(-halfX + 0.17, -halfZ + shelfWide / 2 + 0.25, 1, (m) => {
    bookshelf(m, { wide: shelfWide, tall: Math.min(2.1, tall - 0.25), wood });
  });
  mesh.place(-halfX + 0.4, halfZ - 0.4, 0, (m) => {
    floorLamp(m);
  });
  mesh.place(halfX - 0.45, 0.85, 0, (m) => {
    sideTable(m, { wood, lamp: true });
  });
  pictures.forEach((kind, index) => {
    const x = -0.1 + (index - (pictures.length - 1) / 2) * 0.95;
    mesh.place(x, halfZ - 0.012, 2, (m) => {
      picture(m, { kind, wide: 0.8, tall: 0.56 });
    }, 1.55);
  });
  const [firstAt, firstWide] = windows[0];
  if (curtained) {
    for (const [at, w] of windows) {
      mesh.place(at, -halfZ + 0.01, 0, (m) => {
        curtains(m, { wide: w, tall: Math.min(sill + windowTall + 0.15, tall - 0.08) });
      });
    }
  }
  const pendantX = firstAt + firstWide / 2 > halfX - 0.8 ? 0 : -0.1;
  mesh.place(pendantX, 0.2, 0, (m) => {
    pendant(m, { ceiling: tall, drop: 0.75, shadePart: "walnut", power: 0.55 });
  });
  mesh.place(halfX - 0.42, -halfZ + 0.42, 0, (m) => {
    if (fire !== "tile") plant(m);
  });

  const fieldOfViewDeg = LENS;
  return finish("living", "Living room", mesh, { wide, deep, tall }, [
    { name: "from the door", position: [halfX - 0.35, EYE_M, halfZ - 0.35], target: [-halfX * 0.5, 1, -halfZ * 0.45], fieldOfViewDeg },
    { name: "by the fire", position: [-halfX + 0.5, EYE_M - 0.2, halfZ - 1.2], target: [halfX - 0.3, 0.95, -0.4], fieldOfViewDeg },
    { name: "to the window", position: [-0.1, EYE_M - 0.25, halfZ - 0.3], target: [0, 1.25, -halfZ], fieldOfViewDeg: fieldOfViewDeg + 4 },
  ]);
}

export interface KitchenLayout {
  wide: number;
  deep: number;
  front?: InteriorPart;
  top?: InteriorPart;
  splash?: InteriorPart;
  tableWood?: InteriorPart;
  chairWood?: InteriorPart;
  seat?: InteriorPart;
  windowWide?: number;
  windowTall?: number;
  picture?: PictureKind;
  island?: boolean;
}

export function kitchen(style: Style, { wide, deep, front = "paint-sage", top = "birch", splash = "tile", tableWood = style.wood, chairWood = tableWood, seat = chairWood, windowWide = 1.3, windowTall = 1.2, picture: art = "field", island = false }: KitchenLayout): Room {
  const { tall } = style;
  const mesh = roomMesh(wide, deep, tall);
  const [halfX, halfZ] = [wide / 2, deep / 2];
  const sill = 1;
  buildShell(mesh, { ...style, wide, deep, openings: [windowOn("east", 0.1, windowWide, windowTall, sill, style.panes), doorOn("south", -halfX + 0.8)] });

  mesh.place(-0.05 * wide, -halfZ + 0.31, 0, (m) => {
    kitchenRun(m, { wide: Math.min(wide - 0.5, 4.2), tall, front, top, splash });
  });
  mesh.place(0.1, -halfZ + 1.22, 0, (m) => {
    rug(m, { wide: Math.min(wide - 1.4, 2.4), deep: 0.7, part: "rug-blue", stripes: 3 });
  });
  const tableZ = island ? halfZ - 0.95 : halfZ - 1.15;
  mesh.place(island ? 0.35 : 0.2, tableZ, 0, (m) => {
    diningSet(m, { wide: Math.min(wide - 1.6, 1.8), deep: 0.85, wood: tableWood, chairWood, seat });
  });
  if (island) {
    mesh.place(0, -0.05, 0, (m) => {
      m.solid([-1.05, 0, -0.4], [1.05, 0.88, 0.4], front).solid([-1.15, 0.88, -0.5], [1.15, 0.92, 0.5], top);
    });
    mesh.place(0, -0.05, 0, (m) => {
      for (const x of [-0.8, 0, 0.8]) {
        m.place(x, 0, 0, (lamp) => {
          pendant(lamp, { ceiling: tall, drop: 0.95, power: 0.3, shadePart: "black" });
        });
      }
    });
  } else {
    mesh.place(0.2, tableZ, 0, (m) => {
      pendant(m, { ceiling: tall, drop: tall > 2.6 ? 1.15 : 0.85, power: 0.65, shadePart: "paint-white" });
    });
  }
  mesh.place(-halfX + 0.012, tableZ, 1, (m) => {
    picture(m, { kind: art, wide: 0.8, tall: 0.56 });
  }, 1.55);
  mesh.place(halfX - 0.35, halfZ - 0.3, 0, (m) => {
    plant(m, { tall: 0.8, y: 0 });
  });

  return finish("kitchen", "Kitchen", mesh, { wide, deep, tall }, [
    { name: "from the door", position: [-halfX + 0.5, EYE_M, halfZ - 0.3], target: [halfX * 0.45, 1, -halfZ + 0.5], fieldOfViewDeg: LENS },
    { name: "along the worktop", position: [halfX - 0.4, EYE_M, -halfZ + 1.3], target: [-halfX + 0.3, 0.95, -halfZ + 0.3], fieldOfViewDeg: LENS },
    { name: "from the table", position: [0.2, 1.25, halfZ - 0.25], target: [0, 1.15, -halfZ], fieldOfViewDeg: LENS },
  ]);
}

export interface SaunaLayout {
  wide: number;
  deep: number;
  view: ViewPart;
  windowWide?: number;
  benchWood?: InteriorPart;
  walls?: InteriorPart;
  tall?: number;
  windowTall?: number;
  sill?: number;
}

export function sauna({ wide, deep, view, windowWide = 0.7, benchWood = "birch", walls = "wall-aspen", tall = 2.25, windowTall = 0.5, sill = 1.2 }: SaunaLayout): Room {
  const mesh = roomMesh(wide, deep, tall);
  const [halfX, halfZ] = [wide / 2, deep / 2];
  buildShell(mesh, { wide, deep, tall, floor: "floor-duckboard", ceiling: "wall-aspen", walls, skirting: "wall-aspen", view, openings: [windowOn("west", -0.1, windowWide, windowTall, sill, [1, 1]), doorOn("south", -halfX + 0.65)] });
  mesh.place(0, -halfZ + 0.3, 0, (m) => {
    saunaBenches(m, { wide, wood: benchWood });
  });
  mesh.place(halfX - 0.45, halfZ - 0.45, 0, (m) => {
    saunaStove(m);
  });
  mesh.place(0.1, halfZ - 0.3, 0, (m) => {
    bucket(m);
  });
  mesh.place(-0.2, -halfZ + 0.012, 0, (m) => {
    m.tube([0, 1.2, 0.02], [0, 1.42, 0.02], 0.05, 6, "steel", { cap: true });
    m.tube([0, 1.2, 0.02], [0, 1.2, 0.021], 0.11, 8, "bulb");
    m.lamp([0, 1.22, 0.3], 0.35);
  }, 0.52);
  mesh.place(halfX - 0.015, -0.1, 3, (m) => {
    towelRail(m);
  });
  return finish("sauna", "Sauna", mesh, { wide, deep, tall }, [
    { name: "from the door", position: [-halfX + 0.5, 1.4, halfZ - 0.2], target: [halfX * 0.4, 0.8, -halfZ + 0.4], fieldOfViewDeg: LENS + 8 },
    { name: "from the top bench", position: [-halfX + 0.35, 1.5, -halfZ + 0.35], target: [halfX - 0.4, 0.75, halfZ - 0.4], fieldOfViewDeg: LENS + 8 },
  ]);
}

export interface BedroomLayout {
  wide: number;
  deep: number;
  bedWide?: number;
  cover?: InteriorPart;
  throwPart?: InteriorPart;
  rugPart?: InteriorPart;
  pictureKind?: PictureKind;
  windowWide?: number;
  windowTall?: number;
  sill?: number;
  wardrobePart?: InteriorPart;
}

export function bedroom(style: Style, { wide, deep, bedWide = 1.6, cover = "wool", throwPart = "navy", rugPart = "rug-pale", pictureKind = "boat", windowWide = 1.2, windowTall = 1.25, sill = 0.85, wardrobePart = "paint-white" }: BedroomLayout): Room {
  const { tall, wood } = style;
  const mesh = roomMesh(wide, deep, tall);
  const [halfX, halfZ] = [wide / 2, deep / 2];
  buildShell(mesh, { ...style, wide, deep, openings: [windowOn("east", -0.1, windowWide, windowTall, sill, style.panes), doorOn("south", halfX - 0.8)] });

  const bedZ = -halfZ + 1.1;
  const bedX = -0.15;
  mesh.place(bedX, bedZ + 1, 0, (m) => {
    rug(m, { wide: bedWide + 1.1, deep: 1.5, part: rugPart, edge: "wool", stripes: 4 });
  });
  mesh.place(bedX, bedZ, 0, (m) => {
    bed(m, { wide: bedWide, cover, throwPart, wood });
  });
  for (const side of [-1, 1]) {
    mesh.place(bedX + side * (bedWide / 2 + 0.3), -halfZ + 0.24, 0, (m) => {
      nightstand(m, { wood });
    });
  }
  mesh.place(bedX, -halfZ + 0.012, 0, (m) => {
    picture(m, { kind: pictureKind, wide: 0.9, tall: 0.6 });
  }, 1.55);
  mesh.place(-halfX + 0.32, halfZ - 1.1, 1, (m) => {
    wardrobe(m, { part: wardrobePart });
  });
  mesh.place(halfX - 0.35, 1.0, 3, (m) => {
    chair(m, { wood, seat: throwPart });
  });
  mesh.place(halfX - 0.01, -0.1, 3, (m) => {
    curtains(m, { wide: windowWide, tall: Math.min(sill + windowTall + 0.15, tall - 0.08), part: "wool" });
  });
  mesh.place(bedX, bedZ + 1, 0, (m) => {
    pendant(m, { ceiling: tall, drop: 0.5, power: 0.3, shadePart: "linen" });
  });
  return finish("bedroom", "Bedroom", mesh, { wide, deep, tall }, [
    { name: "from the door", position: [halfX - 0.5, EYE_M, halfZ - 0.3], target: [-halfX * 0.4, 0.8, -halfZ + 0.6], fieldOfViewDeg: LENS },
    { name: "from the wardrobe", position: [-halfX + 0.45, EYE_M, halfZ - 0.3], target: [halfX * 0.3, 0.9, -halfZ * 0.4], fieldOfViewDeg: LENS },
    { name: "to the window", position: [-halfX + 0.5, 1.2, -0.1], target: [halfX, 1.3, -0.1], fieldOfViewDeg: LENS },
  ]);
}

export interface GarageLayout {
  wide: number;
  deep: number;
  tall: number;
  walls: ShellSpec["walls"];
  floor?: InteriorPart;
  ceiling?: InteriorPart;
  /** Garage doors along the +z wall, each `[at, wide]`. */
  doors: readonly (readonly [at: number, wide: number])[];
  doorTall?: number;
  view?: ViewPart;
  /** Beams in the roof. */
  beams?: number;
}

/** The depth kept behind the cars for the bench. */
const GARAGE_BACK_M = 0.75;

export function garage({ wide, deep, tall, walls, floor = "floor-concrete", ceiling = "ceiling-boards", doors, doorTall = 2.2, view = "view-field", beams = 0 }: GarageLayout): Room {
  const mesh = roomMesh(wide, deep, tall);
  const [halfX, halfZ] = [wide / 2, deep / 2];
  const fit = fitCars(wide, deep, GARAGE_BACK_M);
  const openings: Opening[] = [...doors.map(([at, w]): Opening => ({ wall: "south", at, wide: w, tall: doorTall, sill: 0, kind: "garage-door" })), windowOn("west", 0, 1.1, 0.7, 1.35, [3, 1]), doorOn("east", -halfZ + 1.1)];
  buildShell(mesh, { wide, deep, tall, floor, ceiling, walls, skirting: "concrete", view, openings, beams });

  mesh.place(-halfX + 1.35, -halfZ + 0.31, 0, (m) => {
    workbench(m, { wide: Math.min(2.2, wide * 0.5) });
  });
  mesh.place(halfX - 0.95, -halfZ + 0.27, 0, (m) => {
    shelfRack(m, { wide: Math.min(1.5, wide * 0.3) });
  });
  if (wide > 5) {
    mesh.place(0.1, -halfZ + 0.38, 0, (m) => {
      tyreStack(m);
    });
  }
  mesh.place(halfX - 0.25, -0.2, 3, (m) => {
    benchLow(m, { wide: 0.6 });
  });
  for (const slot of fit.slots) {
    mesh.place(slot.x, slot.z + 0.5, 0, (m) => {
      ceilingStrip(m, { ceiling: tall, power: 0.9 });
    });
    mesh.block([slot.x - 0.85, 0.2, slot.z - 2], [slot.x + 0.85, 1.1, slot.z + 2]);
  }
  return finish("garage", "Garage", mesh, { wide, deep, tall }, [
    { name: "from the door", position: [halfX - 0.4, EYE_M + 0.2, halfZ - 0.3], target: [-halfX * 0.3, 0.8, -halfZ + 1], fieldOfViewDeg: LENS + 4 },
    { name: "from the bench", position: [-halfX + 0.5, EYE_M + 0.15, -halfZ + 0.9], target: [halfX * 0.3, 0.8, halfZ - 0.6], fieldOfViewDeg: LENS + 4 },
  ], fit);
}

