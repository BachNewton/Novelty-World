import * as THREE from "three";
import { ball, drum, ellipsoid, intersect, ring, rod, roundBox, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, itemModel, o, piece } from "./item";

/*
 * The Idol (item): a squat little god carved from pale stone, worn smooth
 * where hands have rubbed it for luck; each rub costs a little of the mind.
 * A big round head crowned with a crescent moon, its horns up, heavy ears, a
 * wide grin and two inset violet stones for eyes, over a fat seated body on
 * a round base. It reads by its big head and the crescent over it standing
 * up out of the fist, and its grey stone, the violet of the occult in its
 * eyes (inlaid stones, not lights); the Holy Symbol, the other thing held up
 * on a stem, is a gold cross, and the Skull is bare bone with no body under
 * it. Held upright round its middle, its face to the front.
 */

/** Up the idol from the grip: its base under the fist, its belly's radius in the fist, its neck, and its head's middle. */
const IDOL = { base: o(-0.04), belly: 0.026, neck: o(0.028), head: o(0.058) };
const HEAD = [o(0.027), o(0.026), o(0.024)] as const;
/** The crescent on the crown: the circle it is cut from, standing over the head. */
const MOON = { centre: [0, IDOL.head + HEAD[1] + 0.034, -0.004] as [number, number, number], radius: 0.044 };
const EYES = { y: IDOL.head + 0.004, x: o(0.0105), z: HEAD[2] * 0.84 };

/** The stone: the base, the seated body the fist closes round, the head with its brow, ears and grin, and the crescent on its crown. */
function stoneGeometry(): THREE.BufferGeometry {
  return (
    sculpt()
      .add(drum([0, IDOL.base + 0.008, 0], o(0.023), 0.009, 0.005), "stoneLight")
      .add(rod([0, IDOL.base + 0.016, 0.004], [0, IDOL.neck, 0], IDOL.belly * 1.12, IDOL.belly * 0.82), "stoneLight", 0.012)
      // The knees drawn up in front, under the fist.
      .add(ellipsoid([0, IDOL.base + 0.02, 0.024], [0.03, 0.014, 0.014]), "stoneLight", 0.01)
      .add(ellipsoid([0, IDOL.head, 0], [...HEAD]), "stoneLight", 0.014)
      // Heavy ears, and the brow over the eyes.
      .add(ellipsoid([HEAD[0] * 0.98, IDOL.head - 0.004, -0.004], [0.012, 0.022, 0.009]), "stoneLight", 0.006)
      .add(ellipsoid([-HEAD[0] * 0.98, IDOL.head - 0.004, -0.004], [0.012, 0.022, 0.009]), "stoneLight", 0.006)
      .add(rod([-EYES.x * 1.6, EYES.y + 0.013, EYES.z - 0.002], [EYES.x * 1.6, EYES.y + 0.013, EYES.z - 0.002], 0.0065), "stoneLight", 0.008)
      // The headdress: a band round the brow, and a crescent moon standing on the crown, its horns up.
      .add(ring([0, IDOL.head + HEAD[1] * 0.55, -0.002], HEAD[0] * 0.86, 0.0065), "stone", 0.004)
      .add(intersect(ring(MOON.centre, MOON.radius, 0.011, [Math.PI / 2, 0, 0]), roundBox([0, MOON.centre[1] - 0.05, -0.004], [0.08, 0.05 - 0.008, 0.02], 0)), "stoneLight", 0.01)
      // The grin, a wide dark mouth under a broad nose.
      .add(ellipsoid([0, IDOL.head - 0.006, HEAD[2] * 0.95], [0.008, 0.007, 0.007]), "stoneLight", 0.006)
      .carve(roundBox([0, IDOL.head - 0.022, HEAD[2] * 0.95], [0.021, 0.0035, 0.01], 0.003), { colour: "soot", blend: 0.003 })
      // The sockets the stones are set in.
      .carve(ball([EYES.x, EYES.y, EYES.z + 0.006], 0.0085), { colour: "stoneDark", blend: 0.002 })
      .carve(ball([-EYES.x, EYES.y, EYES.z + 0.006], 0.0085), { colour: "stoneDark", blend: 0.002 })
      .geometry(0.0022)
  );
}

/** The eyes, two violet stones set in the sockets. */
function eyesGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(ellipsoid([EYES.x, EYES.y, EYES.z + 0.002], [0.0072, 0.0064, 0.005]), "violet")
    .add(ellipsoid([-EYES.x, EYES.y, EYES.z + 0.002], [0.0072, 0.0064, 0.005]), "violet")
    .geometry(0.0012);
}

const PARTS = figureParts("item:idol", () => ({ stone: stoneGeometry(), eyes: eyesGeometry() }));

function idol(): THREE.Group {
  const parts = PARTS.get();
  const stone = piece(parts.stone, "idol");
  const eyes = piece(parts.eyes, "idol eyes", SHINES.glass);
  return assembled("idol", [stone, eyes], [{ between: [stone, eyes], at: [0, EYES.y, EYES.z], radius: 0.03 }]);
}

/** Held round its middle; on the floor it has toppled back, its face turned up. */
export const IDOL_MODEL = itemModel({
  card: "idol",
  parts: [PARTS],
  held: () => ({ object: idol(), handle: IDOL.belly, carry: "upright" }),
  plate: { lie: new THREE.Euler(-1.1, 0, 0), spin: 0.5 },
});
