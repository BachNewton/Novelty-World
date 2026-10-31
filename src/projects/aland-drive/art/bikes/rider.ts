import type { Pieces } from "./frame";
import { BODY } from "./rig";
import { piece, type Slot } from "./shapes";

/*
 * A rider in shorts and a T-shirt, as rigid parts. A limb hangs from its joint
 * down -y, the head and torso stand on theirs up +y, the face to -z, and the rig
 * lays each one along its bone.
 */

const { thighM, shinM, upperArmM, foreArmM, torsoM, shoulderHalfM } = BODY;

const armUpper = () =>
  piece((p) => {
    p.loft(
      [
        [-upperArmM * 0.55, 0.05, 0.052],
        [-0.02, 0.058, 0.062],
        [0.045, 0.045, 0.05],
      ],
      6,
      "top",
    );
    p.loft(
      [
        [-upperArmM - 0.015, 0.036, 0.038],
        [-upperArmM * 0.5, 0.041, 0.043],
      ],
      6,
      "skin",
    );
  });

const armLower = () =>
  piece((p) => {
    p.loft(
      [
        [-foreArmM - 0.02, 0.018, 0.03],
        [-foreArmM + 0.02, 0.032, 0.05],
        [-foreArmM + 0.08, 0.027, 0.034],
        [-foreArmM * 0.5, 0.032, 0.036],
        [0.015, 0.034, 0.036],
      ],
      6,
      "skin",
    );
  });

const legUpper = () =>
  piece((p) => {
    p.loft(
      [
        [-thighM * 0.72, 0.074, 0.08],
        [-thighM * 0.3, 0.083, 0.09],
        [0.03, 0.085, 0.09],
      ],
      7,
      "bottom",
    );
    p.loft(
      [
        [-thighM - 0.03, 0.05, 0.054],
        [-thighM * 0.85, 0.056, 0.062],
        [-thighM * 0.65, 0.066, 0.074],
      ],
      7,
      "skin",
    );
  });

const legLower = () =>
  piece((p) => {
    p.loft(
      [
        [-shinM - 0.01, 0.034, 0.038],
        [-shinM * 0.72, 0.04, 0.046, 0.006],
        [-shinM * 0.3, 0.052, 0.058, 0.01],
        [0.02, 0.05, 0.052],
      ],
      7,
      "skin",
    );
  });

const foot = () =>
  piece((p) => {
    p.loft(
      [
        [-0.095, 0.05, 0.14, -0.06],
        [-0.075, 0.052, 0.14, -0.06],
        [-0.045, 0.044, 0.1, -0.035],
        [0, 0.04, 0.05],
      ],
      6,
      "shoe",
    );
  });

export function riderPieces(): Pieces {
  return {
    pelvis: piece((p) => {
      p.loft(
        [
          [-0.11, 0.09, 0.06, -0.01],
          [-0.06, 0.15, 0.095, 0],
          [0.02, 0.16, 0.1, 0],
          [0.1, 0.15, 0.1],
        ],
        8,
        "bottom",
      );
    }),
    torso: piece((p) => {
      p.loft(
        [
          [0, 0.15, 0.1],
          [torsoM * 0.3, 0.155, 0.1],
          [torsoM * 0.62, 0.18, 0.115, -0.01],
          [torsoM * 0.86, 0.19, 0.105],
          [torsoM * 0.99, 0.115, 0.07, 0.005],
          [torsoM * 1.03, 0.055, 0.055, 0.005],
        ],
        8,
        "top",
      );
    }),
    head: piece((p) => {
      p.loft(
        [
          [-0.04, 0.05, 0.05],
          [0.03, 0.05, 0.052],
        ],
        6,
        "skin",
      );
      p.loft(
        [
          [0.02, 0.05, 0.06, -0.02],
          [0.055, 0.074, 0.088, -0.015],
          [0.11, 0.092, 0.104, -0.012],
          [0.165, 0.094, 0.106, -0.008],
          [0.215, 0.068, 0.08, -0.004],
          [0.235, 0.02, 0.024],
        ],
        8,
        "skin",
      );
      p.box([0, 0.105, -0.112], [0.012, 0.024, 0.016], "skin");
    }),
    hairShort: piece((p) => {
      p.loft(
        [
          [0.11, 0.098, 0.1, 0.03],
          [0.17, 0.101, 0.114, 0],
          [0.225, 0.074, 0.088, -0.002],
          [0.25, 0.024, 0.03],
        ],
        8,
        "hair",
      );
    }),
    hairLong: piece((p) => {
      p.loft(
        [
          [-0.1, 0.075, 0.03, 0.09],
          [0.04, 0.105, 0.065, 0.07],
          [0.17, 0.104, 0.114, 0.002],
          [0.228, 0.076, 0.09],
          [0.252, 0.024, 0.03],
        ],
        8,
        "hair",
      );
    }),
    helmet: piece((p) => {
      p.loft(
        [
          [0.14, 0.112, 0.136, 0.01],
          [0.19, 0.116, 0.14, 0.008],
          [0.24, 0.092, 0.118, 0.004],
          [0.273, 0.03, 0.05],
        ],
        8,
        "helmet",
      );
      p.box([0.05, 0.24, 0.01], [0.008, 0.02, 0.075], "dark");
      p.box([-0.05, 0.24, 0.01], [0.008, 0.02, 0.075], "dark");
      for (const side of [1, -1]) {
        p.tube(
          [
            [side * 0.098, 0.14, 0],
            [side * 0.06, 0.03, -0.045],
          ],
          0.005,
          3,
          "dark",
        );
      }
    }),
    upperArmLeft: armUpper(),
    upperArmRight: armUpper(),
    foreArmLeft: armLower(),
    foreArmRight: armLower(),
    thighLeft: legUpper(),
    thighRight: legUpper(),
    shinLeft: legLower(),
    shinRight: legLower(),
    footLeft: foot(),
    footRight: foot(),
  };
}

/** Three-sided limbs, a box of a body and a four-sided head. */
export function riderPiecesFar(): Pieces {
  const limb = (length: number, slot: Slot, radius: number) =>
    piece((p) => {
      p.loft(
        [
          [-length, radius * 0.8, radius * 0.8],
          [0, radius, radius],
        ],
        3,
        slot,
      );
    });
  const shoe = () =>
    piece((p) => {
      p.loft(
        [
          [-0.095, 0.05, 0.13, -0.05],
          [0, 0.03, 0.05],
        ],
        3,
        "shoe",
      );
    });
  return {
    torso: piece((p) => {
      p.loft(
        [
          [-0.1, 0.15, 0.1],
          [torsoM, shoulderHalfM + 0.02, 0.1],
        ],
        4,
        "top",
      );
    }),
    head: piece((p) => {
      p.loft(
        [
          [0, 0.075, 0.08],
          [0.235, 0.09, 0.1],
        ],
        4,
        "skin",
      );
    }),
    hairShort: piece((p) => {
      p.loft(
        [
          [0.12, 0.122, 0.13, 0.015],
          [0.255, 0.05, 0.06],
        ],
        4,
        "hair",
      );
    }),
    hairLong: piece((p) => {
      p.loft(
        [
          [-0.06, 0.1, 0.05, 0.1],
          [0.255, 0.1, 0.12],
        ],
        4,
        "hair",
      );
    }),
    helmet: piece((p) => {
      p.loft(
        [
          [0.14, 0.128, 0.15, 0.01],
          [0.275, 0.05, 0.07],
        ],
        4,
        "helmet",
      );
    }),
    upperArmLeft: limb(upperArmM, "top", 0.055),
    upperArmRight: limb(upperArmM, "top", 0.055),
    foreArmLeft: limb(foreArmM, "skin", 0.04),
    foreArmRight: limb(foreArmM, "skin", 0.04),
    thighLeft: limb(thighM, "bottom", 0.085),
    thighRight: limb(thighM, "bottom", 0.085),
    shinLeft: limb(shinM, "skin", 0.055),
    shinRight: limb(shinM, "skin", 0.055),
    footLeft: shoe(),
    footRight: shoe(),
  };
}
