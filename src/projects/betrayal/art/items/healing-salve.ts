import * as THREE from "three";
import { drum, ellipsoid, ring, rod, sculpt, type Solid } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, itemModel, o, piece } from "./item";

/*
 * The Healing Salve (item): a stoneware crock of ointment, glazed cream with
 * a brown band round its shoulder, its mouth covered with a square of warm
 * ochre linen tied round the neck with twine, a frill of it hanging
 * below the tie. It reads by the squat pot under its bright, frilled cloth top, warm
 * colours (amber is human warmth), apart from the Medical Kit's bag and
 * the glass bottles. Gripped round the pot and carried upright; on the
 * floor it stands.
 */

/** Along the pot from the grip: its foot, its shoulder, its neck, and its rim; its radius round the body and the neck. */
const POT = { foot: o(-0.018), shoulder: o(0.032), neck: o(0.04), rim: o(0.047), radius: o(0.019), throat: o(0.015) };
/** The cloth: how far it domes over the rim, the tie round the neck, how far its frill reaches out and down, and its thickness. */
const CLOTH = { dome: o(0.006), tie: o(0.0405), corner: o(0.0245), drop: o(0.013), thick: o(0.0011) };

/** The crock: a rounded body, its shoulder turning in to a short neck under a thick rim; its band glazed brown. */
function potGeometry(): THREE.BufferGeometry {
  const { foot, shoulder, neck, rim, radius, throat } = POT;
  return sculpt()
    .add(drum([0, (foot + shoulder) / 2, 0], radius, (shoulder - foot) / 2, o(0.006)), "boneLight")
    .add(rod([0, shoulder - o(0.004), 0], [0, rim, 0], throat * 1.08, throat), "boneLight", o(0.006))
    .add(ring([0, rim - o(0.0015), 0], throat, o(0.003)), "boneLight", o(0.002))
    .paint((x, y) => Math.abs(y - (shoulder + neck) / 2 + o(0.004)) - o(0.0075), "woodMid")
    .geometry(o(0.0016));
}

/** The linen: drawn taut over the rim, gathered under the tie, and below it a frill flaring out over the shoulder, its
 *  hem dipping at the square's four corners; and the twine. */
function clothGeometry(): THREE.BufferGeometry {
  const { rim, throat } = POT;
  const over = throat + o(0.0042);
  const gathered = throat + o(0.0042);
  const frill: Solid = {
    distance: (x, y, z) => {
      const angle = Math.atan2(z, x);
      const hem = CLOTH.tie - CLOTH.drop * (0.75 + 0.25 * Math.cos(4 * angle + 0.8));
      const t = THREE.MathUtils.clamp((CLOTH.tie - y) / (CLOTH.tie - hem), 0, 1);
      const radius = THREE.MathUtils.lerp(gathered, CLOTH.corner, Math.sqrt(t));
      const across = Math.abs(Math.hypot(x, z) - radius) - CLOTH.thick;
      return Math.max(across, y - CLOTH.tie, hem - y);
    },
    min: [-CLOTH.corner - CLOTH.thick, CLOTH.tie - CLOTH.drop * 1.1, -CLOTH.corner - CLOTH.thick],
    max: [CLOTH.corner + CLOTH.thick, CLOTH.tie, CLOTH.corner + CLOTH.thick],
  };
  return sculpt()
    .add(ellipsoid([0, rim + o(0.001), 0], [over, CLOTH.dome, over]), "amber")
    .add(rod([0, rim, 0], [0, CLOTH.tie, 0], over, gathered), "amber", o(0.003))
    .add(frill, "amber", o(0.003))
    .add(ring([0, CLOTH.tie, 0], gathered, o(0.0018)), "woodLight", o(0.001))
    .geometry(o(0.0011));
}

const PARTS = figureParts("item:healing-salve", () => ({ pot: potGeometry(), cloth: clothGeometry() }));

function salve(): THREE.Group {
  const parts = PARTS.get();
  const pot = piece(parts.pot, "salve pot", SHINES.glazedChina);
  const cloth = piece(parts.cloth, "salve cloth");
  return assembled("healing salve", [pot, cloth], [{ between: [pot, cloth], at: [0, CLOTH.tie, 0], radius: CLOTH.corner * 1.3 }]);
}

export const HEALING_SALVE = itemModel({
  card: "healing-salve",
  parts: [PARTS],
  held: () => ({ object: salve(), handle: POT.radius, carry: "upright" }),
  plate: { lie: new THREE.Euler(), spin: 0.4 },
});
