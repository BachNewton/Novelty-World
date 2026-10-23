import * as THREE from "three";
import { drum, ring, rod, sculpt, type Vec3 } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, FACE_UP, itemModel, life, linkChain, piece } from "./item";

/*
 * The Medallion (omen): a warding medal, the one thing the Pentagram
 * Chamber, the Crypt and the Graveyard can't touch you through. A broad
 * disc of pale silver on a fine chain, a raised rim round its face and on it
 * a five-pointed star in a ring, the old sign against what walks in those
 * rooms, standing proud of a darker field so it shows. It reads by the disc
 * hanging below the fist on its chain, the way it's held out to ward
 * something off, and by its silver; the Amulet of the Ages, the other
 * pendant, is held up above the fist, gold round a violet stone. Built at
 * three times life-size, as every small charm is. Held upright, the chain
 * gathered in the fist and the disc hanging under it, its face to the front.
 */

/** The disc, and the chain from the fist down to its bail. */
const DISC = { radius: life(0.024), half: 0.0065 };
const CHAIN = { top: 0.035, bottom: -0.064, link: 0.014, wire: 0.0021 };
const BAIL = CHAIN.bottom - 0.006;
const middle: Vec3 = [0, BAIL - 0.008 - DISC.radius, 0];

/** The star's five points, round the disc's middle, the first straight up. */
const points = (radius: number): Vec3[] =>
  Array.from({ length: 5 }, (_, k) => {
    const angle = Math.PI / 2 + (k / 5) * Math.PI * 2;
    return [middle[0] + radius * Math.cos(angle), middle[1] + radius * Math.sin(angle), DISC.half];
  });

/** The disc: its rim, a darker field, the star drawn point to point across it, the ring round the star, and the bail it hangs from. */
function discGeometry(): THREE.BufferGeometry {
  const r = DISC.radius;
  const shape = sculpt()
    .add(drum(middle, r, DISC.half, 0.004, [Math.PI / 2, 0, 0]), "stoneLight")
    .add(ring([middle[0], middle[1], DISC.half * 0.9], r - 0.006, 0.0042, [Math.PI / 2, 0, 0]), "stoneLight", 0.002)
    .add(ring([middle[0], middle[1], DISC.half * 0.9], r * 0.7, 0.0028, [Math.PI / 2, 0, 0]), "stoneLight", 0.0015);
  const star = points(r * 0.68);
  for (let k = 0; k < 5; k++) shape.add(rod(star[k], star[(k + 2) % 5], 0.0034), "stoneLight", 0.0015);
  return shape
    // The field the star stands on, darker so the raised silver reads.
    .paint((x, y, z) => Math.max(DISC.half - 0.0006 - z, Math.hypot(x - middle[0], y - middle[1]) - (r - 0.011)), "stone")
    .add(ring([0, BAIL, 0], 0.0075, 0.0028, [0, 0, Math.PI / 2]), "stoneLight", 0.002)
    .geometry(0.0018);
}

/** The fine chain, from inside the fist down to the bail. */
function chainGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(linkChain([0, CHAIN.top, 0], [0, CHAIN.bottom, 0], { length: CHAIN.link, wire: CHAIN.wire }), "stoneLight")
    .geometry(0.0011);
}

const PARTS = figureParts("item:medallion", () => ({ disc: discGeometry(), chain: chainGeometry() }));

function medallion(): THREE.Group {
  const parts = PARTS.get();
  const disc = piece(parts.disc, "medallion", SHINES.silver);
  const links = piece(parts.chain, "medallion chain", SHINES.silver);
  return assembled("medallion", [disc, links], [{ between: [disc, links], at: [0, CHAIN.bottom, 0], radius: 0.02 }]);
}

export const MEDALLION = itemModel({
  card: "medallion",
  parts: [PARTS],
  held: () => ({ object: medallion(), handle: 0.006, carry: "upright" }),
  plate: FACE_UP,
});
