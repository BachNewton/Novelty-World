import * as THREE from "three";
import { ellipsoid, loft, ring, rod, sculpt, type Section, type Vec3 } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, FACE_UP, itemModel, life, onPlate, piece } from "./item";

/*
 * The Amulet of the Ages (item): an ancient sun-amulet that lends its
 * wearer a little of everything, and takes far more if it is lost. A disc
 * of old bronze-gold ringed with twelve short rays, its face a raised rim
 * round a great violet stone, on a dark leather cord. It reads by its
 * sunburst held up over the fist, its cord hanging in a loop below, and the
 * violet at its heart; the Medallion, the other pendant, hangs below the
 * fist as a plain silver disc, and the Holy Symbol's gold is a cross. Built
 * at three times life-size, as every small charm is. Held upright, the cord
 * gathered in the fist and the amulet held up over it by its bail, its face
 * to the front.
 */

/** The amulet's disc and its rays; the bail under it, where the cord runs through, and its middle over the fist. */
const DISC = { radius: life(0.0125), half: 0.0075, rays: 12, reach: life(0.0185) };
const BAIL = 0.056;
const MIDDLE: Vec3 = [0, BAIL + 0.009 + DISC.radius, 0];

/** The bronze: the disc, its rim, the twelve rays round it, and the bail. */
function bronzeGeometry(): THREE.BufferGeometry {
  const [, my] = MIDDLE;
  const shape = sculpt()
    .add(ellipsoid(MIDDLE, [DISC.radius, DISC.radius, DISC.half]), "brass")
    .add(ring([0, my, DISC.half * 0.4], DISC.radius - 0.004, 0.0045, [Math.PI / 2, 0, 0]), "brass", 0.002);
  for (let k = 0; k < DISC.rays; k++) {
    const angle = (k / DISC.rays) * Math.PI * 2 + Math.PI / DISC.rays;
    const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
    // Each ray a tapering spike out from under the rim.
    shape.add(rod([dx * DISC.radius * 0.8, my + dy * DISC.radius * 0.8, 0], [dx * DISC.reach, my + dy * DISC.reach, 0], 0.0075, 0.0022), "brass", 0.004);
  }
  return shape.add(ring([0, BAIL, 0], 0.0075, 0.003, [0, 0, Math.PI / 2]), "brass", 0.003).geometry(0.0016);
}

/** The violet stone, domed in the middle of the disc, deeper at its edge. */
function stoneGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(ellipsoid([MIDDLE[0], MIDDLE[1], DISC.half * 0.6], [DISC.radius * 0.62, DISC.radius * 0.62, 0.011]), "violet")
    .paint((x, y) => Math.hypot(x - MIDDLE[0], y - MIDDLE[1]) - 0.5 * DISC.radius, "violet")
    .paint((x, y) => 0.5 * DISC.radius - Math.hypot(x - MIDDLE[0], y - MIDDLE[1]), "bruiseLight")
    .geometry(0.0016);
}

/** The cord: up through the bail, both ends down through the fist, and the loop they make hanging below it. */
function cordGeometry(): THREE.BufferGeometry {
  const strand = (side: 1 | -1): Section[] =>
    (
      [
        [side * 0.004, BAIL, 0],
        [side * 0.004, 0.02, 0],
        [side * 0.003, -0.045, 0],
        [side * 0.018, -0.085, 0.002],
        [side * 0.02, -0.11, 0.003],
        [side * 0.008, -0.13, 0.002],
      ] as Vec3[]
    ).map((at) => ({ at, radius: 0.0032, colour: "woodDark" }));
  return loft([...strand(-1), { at: [0, -0.134, 0.002], radius: 0.0032, colour: "woodDark" }, ...strand(1).reverse()], { sides: 8 });
}

const PARTS = figureParts("item:amulet-of-the-ages", () => ({ bronze: bronzeGeometry(), stone: stoneGeometry(), cord: cordGeometry() }));

/** The amulet, on its cord or (on the floor, where the cord would only shrink it to fit the plate) without. */
function amulet(corded: boolean): THREE.Group {
  const parts = PARTS.get();
  const bronze = piece(parts.bronze, "amulet", SHINES.brass);
  const stone = piece(parts.stone, "amulet stone", SHINES.glass);
  const set = { between: [bronze, stone] as [THREE.Mesh, THREE.Mesh], at: [...MIDDLE] as THREE.Vector3Tuple, radius: DISC.radius };
  if (!corded) return assembled("amulet of the ages", [bronze, stone], [set]);
  const cord = piece(parts.cord, "amulet cord");
  return assembled("amulet of the ages", [bronze, stone, cord], [set, { between: [bronze, cord], at: [0, BAIL, 0], radius: 0.016 }]);
}

export const AMULET_OF_THE_AGES = itemModel({
  card: "amulet-of-the-ages",
  parts: [PARTS],
  held: () => ({ object: amulet(true), handle: 0.007, carry: "upright" }),
  plate: FACE_UP,
  floor: () => onPlate(amulet(false), FACE_UP),
});
