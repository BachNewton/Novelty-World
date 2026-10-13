import * as THREE from "three";
import { chair, chamberstick, pictureFrame, rug, table } from "../kit";
import { flame } from "../kit/flame";
import { solidLathe, vessel } from "../kit/vessel";
import { lightAnchor } from "../light-anchor";
import { paletteHex, RAMPS } from "../palette";
import { onWall, type RoomDefinition } from "../room";
import { box, cylinder, flat, group, textured } from "../shapes";
import { shiny, shinyAll, SHINES } from "../shine";
import { marble, panelling, wallpaper, woodPlanks } from "../textures";

const SEED = "dining-room";

/** The long table: where it stands, and its size. It runs along x. */
const TABLE = { at: [-0.5, 0.5] as [number, number], length: 3.0, width: 1.1, height: 0.76 };
/** How far the cloth hangs past the table's edge, and how far it falls. */
const CLOTH = { over: 0.06, drop: 0.34, thick: 0.01 };
/** The places laid down each side, by x from the table's middle. */
const PLACES = [-0.75, 0, 0.75];
/** How far a side chair's middle stands from the table's middle, across it. */
const CHAIR_OUT = 0.86;
/** The chairs' wood: a step lighter than the house's, so they read against the floor. */
const CHAIR_WOOD = RAMPS.wood.slice(1);

/** The tablecloth over the long table: a pale sheet and its hanging sides, the
 *  sides standing just outside the sheet so no faces share a plane. */
function tablecloth(): THREE.Group {
  const { length, width, height } = TABLE;
  const linen = flat("bone");
  const halfL = length / 2 + CLOTH.over;
  const halfW = width / 2 + CLOTH.over;
  const fall = height - CLOTH.drop;
  return group(
    box([halfL * 2, CLOTH.thick, halfW * 2], linen, [0, height, 0]),
    // The long sides run past the ends, and the ends stand between them.
    box([halfL * 2 + CLOTH.thick * 2, CLOTH.drop + 0.016, CLOTH.thick], linen, [0, fall, halfW + CLOTH.thick / 2]),
    box([halfL * 2 + CLOTH.thick * 2, CLOTH.drop + 0.016, CLOTH.thick], linen, [0, fall, -halfW - CLOTH.thick / 2]),
    box([CLOTH.thick, CLOTH.drop + 0.016, halfW * 2], linen, [halfL + CLOTH.thick / 2, fall, 0]),
    box([CLOTH.thick, CLOTH.drop + 0.016, halfW * 2], linen, [-halfL - CLOTH.thick / 2, fall, 0]),
  );
}

/** One place laid at the table: a pewter charger with a brass goblet beside it. `tipped` lays the goblet on its side. */
function place(x: number, z: number, facing: 1 | -1, tipped = false): THREE.Object3D[] {
  const top = TABLE.height + CLOTH.thick;
  const pewter = shiny(flat("stone"), SHINES.pewter);
  const brass = shiny(flat("brass"), SHINES.brass);
  const charger = cylinder(0.13, 0.012, pewter, [x, top, z], { top: 0.14, sides: 10 });
  const well = cylinder(0.08, 0.004, pewter, [x, top + 0.012, z], { sides: 10 });
  const cup = vessel([[0.04, 0], [0.04, 0.01], [0.008, 0.02], [0.008, 0.08], [0.035, 0.1], [0.045, 0.16]], brass, { wall: 0.005, depth: 0.05, sides: 8 });
  const gx = x + 0.17 * facing;
  const gz = z - 0.1 * facing;
  if (tipped) {
    cup.rotation.z = Math.PI / 2 - 0.12;
    cup.position.set(gx + 0.08, top + 0.045, gz);
  } else {
    cup.position.set(gx, top, gz);
  }
  return [charger, well, cup];
}

/** The banquet table, laid for eight under a pale cloth, with a silver cloche
 *  in the middle. One goblet lies tipped. It runs along x. */
function banquetTable(): THREE.Group {
  const { length, width, height } = TABLE;
  const result = group(table({ length, width, height }), tablecloth());
  const across = width / 2 - 0.2;
  for (const x of PLACES) {
    result.add(...place(x, -across, -1, x === 0), ...place(x, across, 1));
  }
  // The head and the foot, laid across the ends.
  const end = length / 2 - 0.2;
  for (const [x, facing] of [[-end, 1], [end, -1]] as const) {
    const [charger, well, cup] = place(x, 0, facing);
    cup.position.set(x + 0.1 * facing, cup.position.y, 0.17 * facing);
    result.add(charger, well, cup);
  }
  result.add(cloche());
  return result;
}

/** A silver cloche on its platter, shut over whatever was served. */
function cloche(): THREE.Group {
  const top = TABLE.height + CLOTH.thick;
  const silver = shiny(flat("stoneLight"), SHINES.silver);
  const dome = solidLathe([[0.2, 0], [0.2, 0.02], [0.18, 0.1], [0.12, 0.17], [0.05, 0.2], [0, 0.205]], silver, 12);
  dome.position.y = top + 0.02;
  const knob = solidLathe([[0.012, 0], [0.03, 0.02], [0.03, 0.04], [0, 0.05]], shiny(flat("brass"), SHINES.brass), 8);
  knob.position.y = top + 0.22;
  return group(cylinder(0.26, 0.02, shiny(flat("stoneLight"), SHINES.silver), [0, top, 0], { top: 0.28, sides: 12 }), dome, knob);
}

/** A tall taper with a violet flame: the omen's candle. Its base is at y = 0. */
function violetTaper(height: number): THREE.Group {
  const burning = flame("candle", { tint: "violet" });
  burning.position.y = height + 0.012;
  burning.scale.setScalar(1.15);
  return group(
    cylinder(0.026, height, flat("boneDark"), [0, 0, 0], { sides: 6 }),
    cylinder(0.004, 0.02, flat("soot"), [0, height, 0], { sides: 3 }),
    burning,
  );
}

/** A tall five-branched silver candelabrum whose candles burn violet, with
 *  one violet light for all of them. Its arms spread along x. */
function omenCandelabrum(signal: 0 | 1 | 2 | 3): THREE.Group {
  const metal = shiny(flat("stoneLight"), SHINES.silver);
  const result = group(
    cylinder(0.12, 0.03, metal, [0, 0, 0], { top: 0.08, sides: 8 }),
    cylinder(0.03, 0.42, metal, [0, 0.03, 0], { top: 0.02, sides: 6 }),
    cylinder(0.045, 0.04, metal, [0, 0.2, 0], { sides: 6 }),
  );
  const armY = 0.42;
  const spread: [number, number][] = [[-0.26, 0.04], [-0.13, 0.07], [0, 0.12], [0.13, 0.07], [0.26, 0.04]];
  for (const [x, rise] of spread) {
    const tall = 0.2 + (rise > 0.1 ? 0.04 : 0);
    result.add(
      cylinder(0.008, rise, metal, [x, armY, 0], { sides: 4 }),
      cylinder(0.035, 0.022, metal, [x, armY + rise, 0], { top: 0.045, sides: 6 }),
    );
    const taper = violetTaper(tall);
    taper.position.set(x, armY + rise + 0.02, 0);
    result.add(taper);
  }
  result.add(box([0.54, 0.018, 0.018], metal, [0, armY - 0.009, 0]));
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  result.add(lightAnchor({ colour: "violet", intensity: 4.5, range: 7, flicker: 0.2, signal, kind: "candelabra" }, [0, armY + 0.45, 0]));
  return result;
}

/** A dining chair knocked over backwards, lying on its back with its legs to
 *  the table. Unturned, it fell towards +z, from a place facing -z. */
function toppledChair(): THREE.Group {
  const fallen = chair({ wood: CHAIR_WOOD, cushion: "bruise" });
  fallen.rotation.x = -Math.PI / 2;
  // The back posts and front legs and the back's top rail stand up to 0.24 either side of the seat's middle.
  fallen.position.set(0, 0.243, 0);
  const result = group(fallen);
  result.rotation.y = Math.PI;
  return group(result);
}

/** A long sideboard against a wall, its doors panelled, its top laid with a
 *  stack of plates, a decanter and a burnt-down candle. It faces +z. */
function sideboard(): THREE.Group {
  const width = 1.5;
  const depth = 0.48;
  const height = 0.86;
  const body = shiny(textured(woodPlanks({ ramp: RAMPS.wood, plankPx: 8, seed: `${SEED}:sideboard`, glints: false })), SHINES.polishedWood);
  const frame = shiny(flat("woodDark"), SHINES.polishedWood);
  const panel = shiny(flat("wood"), SHINES.polishedWood);
  const result = group(
    box([width, 0.08, depth - 0.04], frame, [0, 0, -0.02]),
    box([width - 0.04, height - 0.12, depth - 0.06], body, [0, 0.08, -0.02]),
    box([width + 0.06, 0.04, depth + 0.02], frame, [0, height - 0.04, 0]),
  );
  for (const x of [-0.5, 0, 0.5]) {
    result.add(box([0.42, 0.52, 0.02], panel, [x, 0.16, depth / 2 - 0.04]));
    result.add(box([0.04, 0.04, 0.03], shiny(flat("brass"), SHINES.brass), [x + (x < 0 ? 0.15 : x > 0 ? -0.15 : 0.15), 0.42, depth / 2 - 0.035]));
  }
  for (let i = 0; i < 5; i++) {
    result.add(cylinder(0.12, 0.014, shiny(flat("stone"), SHINES.pewter), [-0.45, height + i * 0.014, -0.02], { top: 0.13, sides: 10 }));
  }
  const decanter = solidLathe([[0.07, 0], [0.08, 0.04], [0.07, 0.12], [0.025, 0.17], [0.022, 0.24], [0.035, 0.26], [0, 0.27]], shiny(flat("bloodDark"), SHINES.glass), 8);
  decanter.position.set(0.15, height, -0.05);
  const light = chamberstick({ height: 0.07, intensity: 1.2, range: 5 });
  light.position.set(0.5, height, 0.02);
  const brass = new THREE.Color(paletteHex("brass"));
  shinyAll(light, SHINES.brass, (material) => material instanceof THREE.MeshLambertMaterial && material.color.equals(brass));
  result.add(decanter, light);
  return result;
}

/** The Dining Room: a long table laid for a dinner nobody ate, under a pale
 *  cloth, lit by two candelabra whose candles burn violet; the host's chair
 *  turned away to the window, and a guest's chair knocked over. A ground-floor
 *  room in the formal zone: chequered marble, wine-dark damask, panelling. */
export const DINING_ROOM: RoomDefinition = {
  id: "dining-room",
  // Nearly flat: veins and joints are lines too fine to read at this pixel size, so only a broad, faint chequer of two near tones shows.
  floor: () => marble({ square: 32, chequer: true, pale: "boneDark", dark: "stoneLight", grout: "boneDark", veins: 0, seed: SEED }),
  wall: () => wallpaper({ ground: "bloodDark", stripe: "woodDark", motif: "blood", seed: SEED }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: SEED, glints: false }),
  trim: "woodDark",
  props: [
    { build: () => rug({ width: 4.4, length: 2.9, field: "bruiseDark", border: "soot", motif: "bruise", fringe: "boneDark" }), name: "rug", at: TABLE.at },
    { build: banquetTable, at: TABLE.at },
    { build: () => omenCandelabrum(1), name: "omenCandelabrum", at: [TABLE.at[0] - 0.8, TABLE.at[1]], y: TABLE.height + CLOTH.thick },
    { build: () => omenCandelabrum(3), name: "omenCandelabrum", at: [TABLE.at[0] + 0.8, TABLE.at[1]], y: TABLE.height + CLOTH.thick },
    ...PLACES.map((x) => ({ build: () => chair({ wood: CHAIR_WOOD, cushion: "bruise" }), name: "chair", at: [TABLE.at[0] + x, TABLE.at[1] - CHAIR_OUT] as [number, number] })),
    ...PLACES.filter((x) => x !== -0.75).map((x) => ({ build: () => chair({ wood: CHAIR_WOOD, cushion: "bruise" }), name: "chair", at: [TABLE.at[0] + x, TABLE.at[1] + CHAIR_OUT] as [number, number], turn: 180 })),
    { build: toppledChair, at: [TABLE.at[0] - 0.7, TABLE.at[1] + CHAIR_OUT + 0.25], turn: -25 },
    // The host's chair, at the head, turned its back on the feast to face the window.
    { build: () => chair({ wood: CHAIR_WOOD, cushion: "bruise", back: 1.3 }), name: "hostChair", at: [TABLE.at[0] - TABLE.length / 2 - 0.42, TABLE.at[1]], turn: -100 },
    { build: () => chair({ wood: CHAIR_WOOD, cushion: "bruise" }), name: "chair", at: [TABLE.at[0] + TABLE.length / 2 + 0.33, TABLE.at[1]], turn: -90 },
    { build: sideboard, ...onWall("top", -1.75, { out: 0.3 }) },
    { build: () => pictureFrame({ picture: "hunt" }), ...onWall("right", -1.75, { y: 1.35 }) },
    { build: () => pictureFrame({ picture: "couple, one turned away", frame: "woodLight" }), ...onWall("bottom", 0.9, { y: 1.3 }) },
  ],
  focus: [-0.5, 0.9, 0.5],
  prime: [1.0, -1.6],
  // Round the table: along the top, down the right past the foot, and along
  // the bottom as far as the fallen chair.
  lanes: [
    [[0, -2.2], [0, -1.15]],
    [[-2.3, -1.15], [0, -1.15], [2.0, -1.15], [2.0, 0], [2.0, 2.15], [-0.6, 2.15]],
    [[2.2, 0], [2.0, 0]],
  ],
};
