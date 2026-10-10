import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { cobweb } from "../kit";
import { lightAnchor } from "../light-anchor";
import { paletteHex, type PaletteKey } from "../palette";
import { INNER, onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group, lightMaterial } from "../shapes";
import { bricks, flagstones, svgTexture, TEXELS_PER_METRE } from "../textures";

const hex = paletteHex;

/** The circle's middle, and its radius: it fills the cell, so its line runs
 *  between every standing spot and the one door, just inside the doorway. */
const CENTRE: [number, number] = [-0.25, 0];
const RADIUS = 2.35;
/** Where the star's points lie, from the middle, and their bearings in
 *  degrees from +x: a gap between two points faces the door on the right. */
const POINT_REACH = 2.05;
const POINTS = [36, 108, 180, 252, 324];
/** The point whose candle has been knocked over and gone out. */
const FALLEN = 252;

function pointAt(bearing: number, reach = POINT_REACH): [number, number] {
  const a = THREE.MathUtils.degToRad(bearing);
  return [CENTRE[0] + Math.cos(a) * reach, CENTRE[1] + Math.sin(a) * reach];
}

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
}

/**
 * The circle and its star, laid in light on the floor: a double ring with
 * marks between its lines, and the five-pointed star drawn in one stroke
 * inside it. Light, not paint, so the stone shows through the colour.
 */
function pentagram(): THREE.Group {
  const size = Math.round(RADIUS * 2 * TEXELS_PER_METRE) + 4;
  const c = size / 2;
  const outer = RADIUS * TEXELS_PER_METRE;
  const inner = outer - 6;
  const star = [0, 2, 4, 1, 3]
    .map((k) => {
      const a = THREE.MathUtils.degToRad(POINTS[k]);
      return `${(c + Math.cos(a) * inner).toFixed(1)},${(c + Math.sin(a) * inner).toFixed(1)}`;
    })
    .join(" ");
  const marks = Array.from({ length: 20 }, (_, k) => {
    const a = THREE.MathUtils.degToRad(k * 18 + 9);
    const r = outer - 3;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    return `<rect x="${(x - 1.5).toFixed(1)}" y="${(y - 1.5).toFixed(1)}" width="3" height="3" fill="${hex(k % 5 === 0 ? "violet" : "bruiseLight")}" transform="rotate(${k * 18 + 45} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }).join("");
  const art = svg(
    size,
    size,
    `<rect width="${size}" height="${size}" fill="${hex("void")}"/>
<circle cx="${c}" cy="${c}" r="${outer}" fill="none" stroke="${hex("violet")}" stroke-width="2.5"/>
<circle cx="${c}" cy="${c}" r="${inner}" fill="none" stroke="${hex("bruiseLight")}" stroke-width="1.5"/>
<polygon points="${star}" fill="none" stroke="${hex("violet")}" stroke-width="2.5" stroke-linejoin="miter"/>
<circle cx="${c}" cy="${c}" r="9" fill="none" stroke="${hex("bruise")}" stroke-width="1.5"/>${marks}`,
  );
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size / TEXELS_PER_METRE, size / TEXELS_PER_METRE), lightMaterial(0.95, { map: svgTexture(art, size, size) }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.012;
  plane.userData.noShadow = true;
  return group(plane);
}

/** The column of violet haze standing on the star's heart, bright at the
 *  floor and fading to nothing as it rises: whatever was called is still here. */
function summoning(): THREE.Group {
  const result = group();
  for (const [radius, height, opacity] of [[0.55, 2.6, 0.32], [0.3, 2.0, 0.4]] as const) {
    const geometry = new THREE.CylinderGeometry(radius * 0.8, radius, height, 12, 6, true).translate(0, height / 2 + 0.02, 0);
    const position = geometry.getAttribute("position");
    const colours: number[] = [];
    const violet = new THREE.Color(hex("violet"));
    for (let i = 0; i < position.count; i++) colours.push(...violet.clone().multiplyScalar(Math.pow(1 - position.getY(i) / (height + 0.02), 1.6)).toArray());
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    const shaft = new THREE.Mesh(geometry, lightMaterial(opacity, { vertexColors: true }));
    shaft.userData.noShadow = true;
    result.add(shaft);
  }
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16).rotateX(-Math.PI / 2).translate(0, 0.016, 0), lightMaterial(0.35));
  (pool.material as THREE.MeshBasicMaterial).color.set(hex("bruiseLight"));
  pool.userData.noShadow = true;
  result.add(pool);
  result.add(lightAnchor({ colour: "violet", intensity: 9, range: 7, flicker: 0.06 }, [0, 0.9, 0]));
  return result;
}

/** A black candle on an iron pricket at one of the star's points, burning
 *  with a violet flame. Its light is the flame's. */
function ritualCandle(): THREE.Group {
  const iron = flat("soot");
  const height = 0.22;
  const stand = group(
    cylinder(0.12, 0.03, iron, [0, 0, 0], { top: 0.1, sides: 6 }),
    cylinder(0.02, 0.32, iron, [0, 0.03, 0], { sides: 5 }),
    cylinder(0.08, 0.025, iron, [0, 0.35, 0], { top: 0.1, sides: 6 }),
  );
  const wax = cylinder(0.04, height, flat("sootLight"), [0, 0.375, 0], { sides: 6 });
  const drip = box([0.09, 0.02, 0.09], flat("sootLight"), [0, 0.37, 0]);
  const flameGeometry = new THREE.OctahedronGeometry(0.03, 0).scale(1, 2.4, 1).translate(0, 0.375 + height + 0.06, 0);
  const flame = new THREE.Mesh(flameGeometry, glow("violet"));
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0).scale(1, 2, 1).translate(0, 0.375 + height + 0.045, 0), glow("bruiseLight"));
  const result = group(stand, wax, drip, flame, core);
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  result.add(lightAnchor({ colour: "violet", intensity: 3.6, range: 5, flicker: 0.18 }, [0, 0.375 + height + 0.16, 0]));
  return result;
}

/** The candle at the fallen point: its pricket knocked over, the black
 *  candle snapped off and rolled away, cold. Lies along x. */
function fallenCandle(): THREE.Group {
  const iron = flat("soot");
  const pricket = group(
    cylinder(0.12, 0.03, iron, [0, 0, 0], { top: 0.1, sides: 6 }),
    cylinder(0.02, 0.32, iron, [0, 0.03, 0], { sides: 5 }),
    cylinder(0.08, 0.025, iron, [0, 0.35, 0], { top: 0.1, sides: 6 }),
  );
  pricket.rotation.z = -Math.PI / 2 + 0.06;
  pricket.position.set(-0.05, 0.12, 0);
  const candle = cylinder(0.04, 0.2, flat("sootLight"), [0, 0, 0], { sides: 6 });
  candle.rotation.set(Math.PI / 2, 0, 0.7);
  candle.position.set(0.25, 0.043, 0.28);
  return group(pricket, candle);
}

/** A tall iron lectern, its desk tipped towards the room, an open grimoire
 *  on it with a ribbon hanging. Faces +z. */
function lectern(): THREE.Group {
  const iron = flat("soot");
  const desk = group(
    box([0.55, 0.04, 0.42], flat("woodDark"), [0, 0, 0]),
    box([0.5, 0.05, 0.34], flat("bone"), [0, 0.04, 0]),
    box([0.012, 0.055, 0.346], flat("boneDark"), [0, 0.04, 0]),
    box([0.03, 0.2, 0.004], flat("scarlet"), [0.02, -0.17, 0.172]),
  );
  desk.rotation.x = 0.45;
  desk.position.set(0, 1.08, 0);
  return group(
    cylinder(0.2, 0.05, iron, [0, 0, 0], { top: 0.16, sides: 6 }),
    cylinder(0.035, 1.02, iron, [0, 0.05, 0], { sides: 6 }),
    desk,
  );
}

/** A low iron-bound chest, its lid ajar on its hinge. Faces +z. */
function chest(): THREE.Group {
  const b = batch();
  b.block([0.8, 0.4, 0.45], "wood", [0, 0, 0]);
  for (const x of [-0.3, 0.3]) b.block([0.05, 0.41, 0.46], "soot", [x, -0.002, 0]);
  const lid = batch();
  lid.block([0.82, 0.08, 0.47], "woodMid", [0, 0, 0.235]);
  const top = lid.mesh();
  top.rotation.x = -0.35;
  top.position.set(0, 0.4, -0.225);
  return group(b.mesh(), top);
}

/** Pages torn from the grimoire, lying where they were thrown. */
function pages(): THREE.Group {
  const rng = createRng("pentagram-pages");
  const b = batch();
  for (let k = 0; k < 6; k++) {
    const at = new THREE.Vector3((rng.next() - 0.5) * 0.9, 0.018 + k * 0.0015, (rng.next() - 0.5) * 0.7);
    b.add([0.17, 0.003, 0.22], pick(rng, ["bone", "boneDark", "boneLight"] as PaletteKey[]), new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * Math.PI), new THREE.Vector3(1, 1, 1)));
  }
  return group(b.mesh());
}

/** The Pentagram Chamber: a bare black cellar filled by a great circle and
 *  star laid in violet light, black candles burning violet at its points,
 *  and a column of violet haze standing on its heart. Its line runs between
 *  everyone in the room and the door: leaving means crossing it. */
export const PENTAGRAM_CHAMBER: RoomDefinition = {
  id: "pentagram-chamber",
  floor: () => flagstones({ ramp: ["void", "soot", "sootLight", "ash"], mortar: "void", stonePx: 14, seed: "pentagram" }),
  wall: () => bricks({ ramp: ["sootLight", "ash", "stoneDark"], mortar: "void", wear: 0.25, seed: "pentagram-brick" }),
  trim: "soot",
  props: [
    { build: pentagram, at: CENTRE },
    { build: summoning, at: CENTRE },
    ...POINTS.filter((bearing) => bearing !== FALLEN).map((bearing) => ({ build: ritualCandle, at: pointAt(bearing) })),
    { build: fallenCandle, at: pointAt(FALLEN), turn: 30 },
    { build: lectern, at: [-1.95, -2.35], turn: 35 },
    { build: pages, at: [-1.3, -2.25] },
    { build: chest, ...onWall("bottom", 1.6, { out: 0.4 }) },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [-INNER + 0.29, -INNER + 0.29], y: 3.05, turn: 135, walls: ["left", "top"] },
  ],
  focus: [CENTRE[0], 0.5, CENTRE[1]],
  pawn: [0.75, -0.55],
  spots: [[0.75, 0.6], [-0.3, -0.95], [-0.3, 1.0], [-1.2, -0.45], [-1.2, 0.5]],
};
