import { Vector3, Vector4, type Node } from "three/webgpu";
import { float, smoothstep, uniformArray, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { sharedUniform } from "../art/shared-uniform";
import type { LampLight } from "../art/dealers/material";
import type { LiveSun } from "../art/sun";
import type { Paint } from "../art/dealers/shell";
import { MOST_LAMPS, type Lamp, type RoomLight } from "./interior";

/*
 * A room's lamps as uniforms, so every dealership is lit by one shader, built before the drive: a room's light is
 * numbers written into it on entering. Each lamp is a segment, a point's two ends the same, with an optional cone, so
 * points, spots and strips are one sum. Unused lamps are dark.
 */

/** A spot's light fades over this much of its cone's edge. */
const CONE_SOFTNESS = 0.12;

const linear = (paint: Paint) => {
  const { r, g, b } = themeColor(`--color-aland-drive-${paint}`);
  return new Vector3(r, g, b);
};

export interface RoomLighting extends LampLight {
  set(light: RoomLight): void;
  /** Where the cars take their direct light from, for a car's sun: down, as strong as the room's lamps. */
  readonly overhead: LiveSun["toSun"];
}

export function createRoomLighting(): RoomLighting {
  const blank = () => Array.from({ length: MOST_LAMPS }, () => new Vector4());
  /** From: a point's place, a strip's first end; w its reach. */
  const from = blank();
  /** To: a strip's other end, or the same place again; w the cosine of a spot's cone, below -1 for none. */
  const to = blank();
  /** Its colour at its brightness. */
  const colour = blank();
  /** Where a spot aims. */
  const aim = blank();
  const fromNode = uniformArray<"vec4">(from, "vec4");
  const toNode = uniformArray<"vec4">(to, "vec4");
  const colourNode = uniformArray<"vec4">(colour, "vec4");
  const aimNode = uniformArray<"vec4">(aim, "vec4");
  const ambient = sharedUniform(new Vector3());
  const low = sharedUniform(new Vector3());
  const high = sharedUniform(new Vector3());
  const overhead = sharedUniform(new Vector3(0, 0.3, 0));

  const write = (index: number, lamp: Lamp | undefined) => {
    if (!lamp) {
      from[index].set(0, -1000, 0, 1);
      to[index].set(0, -1000, 0, -2);
      colour[index].set(0, 0, 0, 0);
      aim[index].set(0, -1, 0, 0);
      return;
    }
    const [start, end] = lamp.kind === "strip" ? [lamp.from, lamp.to] : [lamp.at, lamp.at];
    from[index].set(...start, lamp.reachM);
    to[index].set(...end, lamp.kind === "spot" ? Math.cos(((lamp.coneDeg / 2) * Math.PI) / 180) : -2);
    const c = linear(lamp.paint).multiplyScalar(lamp.power);
    colour[index].set(c.x, c.y, c.z, 0);
    const way = lamp.kind === "spot" ? new Vector3(...lamp.aim).normalize() : new Vector3();
    aim[index].set(way.x, way.y, way.z, 0);
  };

  return {
    ambient,
    mirrors: [low, high],
    overhead,
    set(light) {
      for (let index = 0; index < MOST_LAMPS; index++) write(index, light.lamps[index]);
      ambient.value.copy(linear(light.ambientPaint).multiplyScalar(light.ambient));
      low.value.copy(linear(light.mirrors[0]));
      high.value.copy(linear(light.mirrors[1]));
      const brightest = light.lamps.reduce((sum, lamp) => sum + lamp.power, 0) / Math.max(light.lamps.length, 1);
      overhead.value.set(0, 0.25 + 0.4 * brightest, 0);
    },
    at(position, normal, mirrored) {
      let sum: Node<"vec3"> = vec3(0, 0, 0);
      let highlight: Node<"vec3"> = vec3(0, 0, 0);
      for (let index = 0; index < MOST_LAMPS; index++) {
        const a = fromNode.element(index);
        const b = toNode.element(index);
        const along = b.xyz.sub(a.xyz);
        const share = position.sub(a.xyz).dot(along).div(along.dot(along).max(1e-6)).clamp(0, 1);
        const offset = a.xyz.add(along.mul(share)).sub(position);
        const distance = offset.length().max(1e-3);
        const direction = offset.div(distance);
        const falloff = float(1).div(float(1).add(distance.div(a.w).pow(2)));
        const cone = smoothstep(b.w, b.w.add(CONE_SOFTNESS), direction.negate().dot(aimNode.element(index).xyz));
        const reaching = colourNode.element(index).xyz.mul(falloff).mul(cone);
        sum = sum.add(normal === null ? reaching : reaching.mul(normal.dot(direction).max(0)));
        if (mirrored !== null) highlight = highlight.add(reaching.mul(mirrored.dot(direction).max(0).pow(180)));
      }
      return { sum, highlight };
    },
  };
}
