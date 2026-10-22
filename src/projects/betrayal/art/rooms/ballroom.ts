import * as THREE from "three";
import { candelabra } from "../kit";
import { BALLROOM_SHELL, ballroomParquet, BALUSTRADE, baluster, balustradeRun, giltChair } from "../kit/ballroom";
import { crossLanes, onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, group } from "../shapes";
import { shiny, SHINES } from "../shine";

/** Where the four torchères stand, in the corners round the medallion. */
const TORCHERE = 2.05;
/** Where the fallen section of the Gallery's balustrade came down, in the room's top-right quarter. */
const FALL: [number, number] = [1.15, -1.35];

/**
 * A tall standing candelabrum: a gilt shaft on three splayed feet, carrying
 * five candles at head height, with one light for all of them. Seen from
 * every side alike.
 */
function torchere(): THREE.Group {
  const gilt = shiny(flat("brass"), SHINES.gilt);
  const result = group(
    cylinder(0.1, 0.12, gilt, [0, 0, 0], { top: 0.07, sides: 8 }),
    cylinder(0.032, 1.2, gilt, [0, 0.12, 0], { top: 0.024, sides: 6 }),
    cylinder(0.05, 0.06, gilt, [0, 0.6, 0], { sides: 8 }),
    cylinder(0.06, 0.05, gilt, [0, 1.3, 0], { top: 0.11, sides: 8 }),
  );
  for (let i = 0; i < 3; i++) {
    const foot = box([0.05, 0.05, 0.3], gilt, [0, 0, 0.15]);
    foot.rotation.y = (i * 2 * Math.PI) / 3;
    result.add(foot);
  }
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  const lamp = candelabra({ arms: 5, intensity: 2.5 });
  lamp.position.y = 1.35;
  result.add(lamp);
  return result;
}

/**
 * What came down from the Gallery above: a length of its balustrade lying on
 * its face at the edge of the medallion, the snapped end of its handrail,
 * loose balusters flung about it, and the gilt chair that went over with it,
 * on its side with a leg broken off. The Gallery's gap is where it came from.
 */
function fallenBalustrade(): THREE.Group {
  const b = batch();
  const { rail } = BALUSTRADE;
  // The section, laid over on its face: its height runs along −z, its depth stands up off the floor.
  const lying = new THREE.Matrix4().makeRotationY(0.35).multiply(new THREE.Matrix4().makeTranslation(-0.45, rail.depth / 2, 0.5)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  balustradeRun(b, 0, 0.9, lying);
  // The snapped end of the handrail, broken off and lying beyond it, and a splinter of it.
  b.add([0.45, rail.height, rail.depth], BALUSTRADE.colours.rail, new THREE.Matrix4().makeRotationY(-0.9).setPosition(0.5, rail.height / 2, -0.4));
  b.add([0.2, 0.04, 0.05], BALUSTRADE.colours.rail, new THREE.Matrix4().makeRotationY(0.4).setPosition(-0.5, 0.02, -0.55));
  // Loose balusters, each where it rolled, at its own angle about its length, a corner sunk in the floor's give.
  for (const [x, z, turn, roll] of [[0.7, 0.35, 0.3, 0.3], [-0.35, 0.45, -Math.PI / 2, 0.9]]) {
    const pose = new THREE.Matrix4().makeTranslation(x, 0.045, z).multiply(new THREE.Matrix4().makeRotationY(turn)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationY(roll));
    baluster(b, pose);
  }
  // The chair that went over the rail with it, lying on its side by the section, one front leg snapped off beside it.
  const chair = giltChair();
  chair.rotation.z = Math.PI / 2;
  chair.position.set(0, 0.245, 0);
  const fallen = group(chair);
  fallen.rotation.y = 0.35;
  fallen.position.set(0.35, 0, 0.6);
  const leg = box([0.05, 0.42, 0.05], shiny(flat("brass"), SHINES.gilt), [0, 0, 0]);
  leg.rotation.z = Math.PI / 2;
  leg.rotation.y = 0.8;
  leg.position.set(0.55, 0.025, 0.45);
  return group(b.mesh(), fallen, leg);
}

/** The Ballroom: a great inlaid medallion in the middle of a dark parquet
 *  floor, a gilt torchère in each corner, gilt chairs along the walls, and at
 *  the medallion's edge the length of balustrade and the chair that fell from
 *  the Gallery above. Ground floor, formal: the hall the Gallery overlooks,
 *  and dressed as it is. */
export const BALLROOM: RoomDefinition = {
  id: "ballroom",
  floor: ballroomParquet,
  ...BALLROOM_SHELL,
  props: [
    { build: fallenBalustrade, at: FALL },
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => ({ build: torchere, at: [x * TORCHERE, z * TORCHERE] as [number, number] })),
    ...[-1.55, -1.0, 1.0, 1.55].map((along) => ({ build: giltChair, ...onWall("top", along, { out: 0.32 }) })),
    ...[-1.55, -1.0, 1.55].map((along) => ({ build: giltChair, ...onWall("bottom", along, { out: 0.32 }) })),
    // The fourth chair along the bottom, pulled out and turned to the medallion, as if someone sat to watch.
    { build: giltChair, name: "watchingChair", at: [-0.85, 1.95], turn: 160 },
  ],
  focus: [FALL[0], 0.3, FALL[1]],
  prime: [-1.2, 1.1],
  keepClear: [{ from: FALL, to: FALL, radius: 0.75 }],
  lanes: crossLanes(),
};
