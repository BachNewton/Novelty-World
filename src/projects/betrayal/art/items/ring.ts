import * as THREE from "three";
import { ball, drum, ellipsoid, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { life } from "./charm";
import { FRONT_UP } from "./front-up";
import { assembled, itemModel, piece } from "./item";

/*
 * The Ring (omen): a heavy silver ring set with a great violet stone, the
 * ring that lets its wearer strike at the mind instead of the body. A broad
 * pale band, shoulders swelling up to a raised collet, and in it a domed
 * violet cabochon. It reads by the bright circle standing up out of the fist
 * with its stone on top, and the violet of magic in it; the Medallion, the
 * other silver charm, hangs as a broad disc below the fist on a chain. Built
 * at three times life-size, as every small charm is. Held upright, its band
 * pinched in the top of the fist and its hole to the front.
 */

/** The band, round its middle over the fist, a little more than its inner radius above the grip so its foot lies in the top of the fist. */
const BAND = { inner: life(0.009), outer: life(0.0118), half: life(0.0032) };
const MIDDLE = 0.072;
/** The collet on the band's crown, and the stone set in it. */
const CROWN = MIDDLE + BAND.outer - 0.002;

/** The band, its shoulders and the collet, all silver. */
function bandGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(drum([0, MIDDLE, 0], BAND.outer, BAND.half, 0.0035, [Math.PI / 2, 0, 0]), "stoneLight")
    // The shoulders, swelling where the band rises to its crown.
    .add(ball([0.013, CROWN - 0.006, 0], 0.011), "stoneLight", 0.008)
    .add(ball([-0.013, CROWN - 0.006, 0], 0.011), "stoneLight", 0.008)
    .add(drum([0, CROWN + 0.004, 0], 0.0185, 0.007, 0.003), "stoneLight", 0.004)
    .carve(drum([0, MIDDLE, 0], BAND.inner, BAND.half * 3, 0, [Math.PI / 2, 0, 0]), { blend: 0.003 })
    .geometry(0.0016);
}

/** The cabochon, a dome of violet stone standing up out of the collet. */
function stoneGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(ellipsoid([0, CROWN + 0.01, 0], [0.0155, 0.0125, 0.0155]), "violet")
    // Deeper where it sits in the collet.
    .paint((_, y) => y - (CROWN + 0.006), "bruiseLight")
    .geometry(0.0014);
}

const PARTS = figureParts("item:ring", () => ({ band: bandGeometry(), stone: stoneGeometry() }));

function magicRing(): THREE.Group {
  const parts = PARTS.get();
  const band = piece(parts.band, "ring", SHINES.silver);
  const stone = piece(parts.stone, "ring stone", SHINES.glass);
  return assembled("ring", [band, stone], [{ between: [band, stone], at: [0, CROWN + 0.008, 0], radius: 0.024 }]);
}

export const RING = itemModel({
  card: "ring",
  parts: [PARTS],
  held: () => ({ object: magicRing(), handle: 0.008, carry: "upright" }),
  plate: FRONT_UP,
});
