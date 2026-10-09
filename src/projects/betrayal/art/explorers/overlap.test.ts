import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { animationOf } from "../animate";
import { figureMaterial, form, painted } from "../forms";
import { stubCanvas } from "../headless";
import { banshee, spider } from "../monsters";
import { group } from "../shapes";
import { fightingFaces } from "./fighting-faces";
import { STANDING, type Gait } from "./figure";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { zoe } from "./zoe";

/** Each figure posed at moments through its idle, standing, in full stride
 *  and running, and the monsters standing and stunned: its own parts may pass
 *  into each other, as a figure's joints do, but no two of its faces may fight. */
const EXPLORERS = { longfellow, ox, zoe };
const MOMENTS = [0, 2, 5, 9, 14, 21];

beforeAll(stubCanvas);

function posedAt(figure: THREE.Object3D, seconds: number): THREE.Object3D {
  figure.traverse((object) => animationOf(object)?.(seconds));
  return figure;
}

function sphere(colour: "blood" | "moon", radius = 0.1): THREE.Mesh {
  return form(figureMaterial(), painted(new THREE.SphereGeometry(radius, 32, 16), colour));
}

describe("the fighting-faces check", () => {
  it("finds two parts of different colour in one place", () => {
    expect(fightingFaces(group(sphere("blood"), sphere("moon")))).toHaveLength(1);
  });

  it("passes parts that only pass into each other", () => {
    const apart = sphere("moon");
    apart.position.x = 0.05;
    expect(fightingFaces(group(sphere("blood"), apart))).toEqual([]);
  });

  it("passes a fight a third part covers", () => {
    expect(fightingFaces(group(sphere("blood"), sphere("moon"), sphere("blood", 0.15)))).toEqual([]);
  });
});

/** A figure's first check pays for meshing its parts, which under a full test run's load can pass five seconds. */
const LIMIT = { timeout: 15_000 };

describe("figures", () => {
  const striding: Gait = () => ({ phase: Math.PI / 2, amount: 1 });
  const running: Gait = () => ({ phase: Math.PI / 2, amount: 1, running: true });
  for (const [name, build] of Object.entries(EXPLORERS)) {
    for (const [how, gait] of [["standing", STANDING], ["walking", striding], ["running", running]] as const) {
      it(`${name}, ${how}, has no fighting faces`, LIMIT, () => {
        const figure = build(name, gait);
        for (const at of MOMENTS) expect(fightingFaces(posedAt(figure, at)).map((finding) => `${at}s: ${finding}`)).toEqual([]);
      });
    }
  }
  for (const [name, build] of Object.entries({ banshee, spider })) {
    for (const stunned of [false, true]) {
      it(`the ${name}${stunned ? ", stunned," : ""} has no fighting faces`, LIMIT, () => {
        const figure = build(name, STANDING, { stunned });
        for (const at of MOMENTS) expect(fightingFaces(posedAt(figure, at)).map((finding) => `${at}s: ${finding}`)).toEqual([]);
      });
    }
  }
});
