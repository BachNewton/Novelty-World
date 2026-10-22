import * as THREE from "three";
import { candelabra, pitHaze, pitShell, table } from "../kit";
import { BALLROOM_SHELL, ballroomParquet, BALUSTRADE, baluster, balustradeRun, giltChair } from "../kit/ballroom";
import { lightAnchor } from "../light-anchor";
import { paletteHex, type PaletteKey } from "../palette";
import { INNER, TILE, onWall, type RoomDefinition } from "../room";
import { batch, box, flat, group, projectUvs } from "../shapes";
import { shiny, SHINES } from "../shine";
import { woodPlanks } from "../textures";

/** Where the balustrade stands, along the walkway's edge, and where the drop into the Ballroom opens beyond it. */
const RAIL_X = 0.8;
const WELL = { x: [0.87, INNER] as [number, number], z: [-INNER, INNER] as [number, number] };
/** How far down the Ballroom's floor lies: a storey. */
const DEPTH = 3.2;
/** The lining's thickness, standing inside the edge of the floor it lines. */
const LINING = 0.04;
/** Where the ballroom's panelling starts, a metre up from its floor. */
const DADO = -DEPTH + 1;
/** The gap where the balustrade gave way, along z. */
const GAP: [number, number] = [0.1, 1.2];
/** The chairs set along the rail to watch the dancing below, by z; the one between the last two went over with the rail. */
const WATCHERS = [-1.45, -0.6, 1.5];

/** How the drop's sides are lit, by depth: the gallery's dim light at the lip, dark below it, then the ballroom's candlelight rising from its floor. */
const DEPTH_LIGHT: [y: number, colour: PaletteKey, strength: number][] = [
  [0, "moonDark", 0.5],
  [-0.3, "void", 1],
  [-1.1, "ember", 0.35],
  [-2.1, "amber", 0.75],
  [-DEPTH, "amber", 1.05],
];

function depthLight(y: number): THREE.Color {
  const below = DEPTH_LIGHT.findIndex(([at]) => at < y);
  const [y1, c1, s1] = DEPTH_LIGHT[below === -1 ? DEPTH_LIGHT.length - 1 : below];
  const [y0, c0, s0] = DEPTH_LIGHT[Math.max(0, (below === -1 ? DEPTH_LIGHT.length : below) - 1)];
  const t = y0 === y1 ? 0 : (y0 - y) / (y0 - y1);
  return new THREE.Color(paletteHex(c0)).multiplyScalar(s0).lerp(new THREE.Color(paletteHex(c1)).multiplyScalar(s1), t);
}

/**
 * The drop into the Ballroom: the hall's walls falling away below the
 * walkway's edge, papered and then panelled as the Ballroom is, down to a
 * glimpse of its medallion, all lit by its candles far below rather than by
 * the house's fill, which would flatten the drop into a tray. Warm haze
 * hangs in it, and a shell in the background's colour round it hides it from
 * outside the room. Two lights just under the floor throw the ballroom's
 * glow up through the balustrade.
 */
function drop(): THREE.Group {
  const paper = BALLROOM_SHELL.wall();
  const panels = BALLROOM_SHELL.wainscot();
  const meshes: THREE.Mesh[] = [];
  const side = (x0: number, x1: number, z0: number, z1: number) => {
    for (const [texture, top, bottom] of [[paper, -0.01, DADO], [panels, DADO, -DEPTH]] as const) {
      const height = top - bottom;
      // Laid out from the panelling's own foot, so its panels sit whole between the ballroom's floor and its rail.
      const geometry = new THREE.BoxGeometry(x1 - x0, height, z1 - z0, 1, 12, 1).translate((x0 + x1) / 2, height / 2, (z0 + z1) / 2);
      projectUvs(geometry, texture);
      geometry.translate(0, bottom, 0);
      const position = geometry.getAttribute("position");
      const colours: number[] = [];
      for (let i = 0; i < position.count; i++) colours.push(...depthLight(position.getY(i)).toArray());
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
      meshes.push(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, fog: false })));
    }
  };
  const [x0, x1] = WELL.x;
  const [z0, z1] = WELL.z;
  side(x0, x0 + LINING, z0, z1);
  side(x1 - LINING, x1, z0, z1);
  // The ends run between the sides, so their faces never share a plane in the corners.
  side(x0 + LINING, x1 - LINING, z0, z0 + LINING);
  side(x0 + LINING, x1 - LINING, z1 - LINING, z1);
  const parquet = ballroomParquet();
  const floor = new THREE.BoxGeometry(x1 - x0 - LINING * 2, 0.01, z1 - z0 - LINING * 2).translate((x0 + x1) / 2, -DEPTH, (z0 + z1) / 2);
  projectUvs(floor, parquet);
  const floorLight = depthLight(-DEPTH).toArray();
  floor.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: floor.getAttribute("position").count }, () => floorLight).flat(), 3));
  meshes.push(new THREE.Mesh(floor, new THREE.MeshBasicMaterial({ map: parquet, vertexColors: true, fog: false })));
  const haze = (y: number, opacity: number) => pitHaze({ x: [x0 + LINING, x1 - LINING], z: [z0 + LINING, z1 - LINING], y, colour: "amber", opacity });
  return group(
    ...meshes,
    haze(-0.5, 0.06),
    haze(-1.5, 0.12),
    haze(-2.5, 0.2),
    pitShell({ x: [x0 - 0.06, TILE / 2], z: [-TILE / 2, TILE / 2], bottom: -DEPTH - 0.1 }),
    lightAnchor({ colour: "amber", intensity: 6, range: 6.5, flicker: 0.1, kind: "glow" }, [2.2, -0.7, -1.3]),
    lightAnchor({ colour: "amber", intensity: 6, range: 6.5, flicker: 0.1, kind: "glow" }, [2.2, -0.7, 1.3]),
  );
}

/**
 * The balustrade along the walkway's edge, running from wall to wall, broken
 * through where the rail gave way: the handrail snapped and hanging into the
 * gap, a baluster dangling from it, the plinth's broken end jutting, and the
 * boards at the edge splintered and sagging over the drop. Its run is along z.
 */
function balustrade(): THREE.Group {
  const b = batch();
  const along = new THREE.Matrix4().makeTranslation(RAIL_X, 0, 0).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
  balustradeRun(b, -INNER, GAP[0] + INNER, along);
  balustradeRun(b, GAP[1], INNER - GAP[1], along);
  const { height, rail, plinth, colours } = BALUSTRADE;
  // The handrail's broken end, hinged down into the gap from where it snapped.
  const hanging = new THREE.Matrix4().makeTranslation(RAIL_X, height - rail.height / 2, GAP[0]).multiply(new THREE.Matrix4().makeRotationX(-0.95));
  b.add([rail.depth - 0.012, rail.height - 0.01, 0.42], colours.rail, hanging.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.2)));
  // A baluster still nailed to it, swinging out over the drop.
  baluster(b, new THREE.Matrix4().makeTranslation(RAIL_X + 0.06, 0.32, GAP[0] + 0.3).multiply(new THREE.Matrix4().makeRotationZ(-0.5)).multiply(new THREE.Matrix4().makeRotationX(0.3)));
  // The other side: the plinth's torn end and a splinter of rail.
  b.add([plinth.depth - 0.012, plinth.height - 0.012, 0.16], colours.plinth, new THREE.Matrix4().makeRotationY(0.25).setPosition(RAIL_X + 0.02, plinth.height / 2, GAP[1] - 0.07));
  b.add([rail.depth, rail.height, 0.2], colours.rail, new THREE.Matrix4().makeRotationZ(0.35).setPosition(RAIL_X + 0.03, height - 0.06, GAP[1] - 0.08));
  // Splintered boards at the edge, sagging over the drop, butted to the floor's edge.
  for (const [z, reach, sag] of [[0.35, 0.24, 0.35], [0.55, 0.16, 0.2], [0.78, 0.3, 0.5]]) {
    b.add([reach, 0.03, 0.15], "woodMid", new THREE.Matrix4().makeTranslation(WELL.x[0], -0.015, z).multiply(new THREE.Matrix4().makeRotationZ(-sag)).multiply(new THREE.Matrix4().makeTranslation(reach / 2, 0, 0)));
  }
  return group(b.mesh());
}

/** A gilt settee against a wall, long and low, its seat and back in the ballroom chairs' red velvet. It faces +z. */
function settee(): THREE.Group {
  const gilt = shiny(flat("brass"), SHINES.gilt);
  const velvet = flat("blood");
  const result = group(
    box([1.5, 0.12, 0.55], gilt, [0, 0.3, 0]),
    box([1.44, 0.1, 0.5], velvet, [0, 0.42, 0.02]),
    box([1.5, 0.5, 0.08], gilt, [0, 0.42, -0.26]),
    box([1.4, 0.4, 0.04], velvet, [0, 0.47, -0.21]),
  );
  for (const x of [-0.7, 0.7]) {
    result.add(box([0.07, 0.3, 0.07], gilt, [x, 0, 0.22]), box([0.07, 0.3, 0.07], gilt, [x, 0, -0.22]));
    result.add(box([0.08, 0.22, 0.5], gilt, [x * 1.04, 0.52, 0]));
  }
  return result;
}

/** The Gallery: a walkway along a gilt-papered hall, its balustrade looking
 *  down a storey into the Ballroom, broken through where a length of it gave
 *  way, with the chairs set out to watch the dancing and a gap among them.
 *  The Ballroom's candlelight rises through the rail. Upper floor: wood
 *  boards, in the Ballroom's dress, since they are one tall hall. */
export const GALLERY: RoomDefinition = {
  id: "gallery",
  floor: () => woodPlanks({ seed: "gallery", glints: false }),
  ...BALLROOM_SHELL,
  floorOpenings: [WELL],
  props: [
    { build: drop, at: [0, 0] },
    { build: balustrade, at: [0, 0], contacts: [{ with: "drop", because: "the splintered boards and a dangling baluster hang over its lip" }] },
    ...WATCHERS.map((z) => ({ build: giltChair, at: [RAIL_X - 0.42, z] as [number, number], turn: 90 })),
    { build: () => table({ length: 1.1, width: 0.42, height: 0.8 }), name: "console", ...onWall("left", 1.3, { out: 0.23 }) },
    { build: () => candelabra({ arms: 3, intensity: 3 }), at: [-INNER + 0.23, -1.3], y: 0.8, turn: 90 },
    { build: settee, ...onWall("left", -1.0, { out: 0.3 }) },
  ],
  focus: [RAIL_X, 0.6, (GAP[0] + GAP[1]) / 2],
  prime: [-1.3, 0.3],
  keepClear: [{ from: [RAIL_X - 0.45, GAP[0] + 0.1], to: [RAIL_X - 0.45, GAP[1] - 0.1], radius: 0.3 }],
  // Down the walkway, inside the chairs set along the rail.
  lanes: [[[0, -2.2], [-0.55, -1.5], [-0.55, 1.5], [0, 2.2]]],
};
