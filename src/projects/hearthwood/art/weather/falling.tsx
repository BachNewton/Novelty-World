"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, InstancedBufferGeometry, PlaneGeometry, Vector3, type Mesh } from "three";
import { cameraPosition, cameraProjectionMatrix, cameraViewMatrix, cos, cross, float, hash, instanceIndex, length, max, mix, mod, normalize, positionGeometry, select, sin, smoothstep, uniform, varying, vec2, vec3, vec4 } from "three/tsl";
import { MeshBasicNodeMaterial, type Node } from "three/webgpu";
import type { AtmosphereUniforms } from "../atmosphere";
import { colourUniform } from "../tsl";
import type { WeatherNow } from "./now";

/*
 * What falls from the sky, round the camera: a box of drops or flakes that
 * follows the camera and wraps round it, so the camera is always in the
 * middle of the fall wherever it goes. Every one is placed in the vertex
 * stage from its own index and the clock (where in the box it falls, how
 * fast, how it sways), so nothing is stored or simulated: one quad,
 * instanced as many times as the weather says. Rain is a streak along the
 * way it falls, slanted by the wind; snow is a soft round flake drifting and
 * swaying down. Both are lit by the light of the hour (the sky's and the
 * key light's), so rain is bright by day and dim and blue at night, and a
 * flash of lightning shows every drop.
 */

export interface FallingKind {
  /** How many at the heaviest. */
  count: number;
  /** The box round the camera they fall in, in metres: across, and up and down. */
  box: { across: number; tall: number };
  /** Metres a second they fall, at the slowest and fastest. */
  fall: [number, number];
  /** How far a drop is drawn along its fall, against its width, and its width in metres. */
  streak: number;
  width: number;
  /** How much the wind carries them, against its own speed. */
  carried: number;
  /** How far a flake sways from side to side, in metres. */
  sway: number;
  /** How opaque one is, at most. */
  opacity: number;
  /** Which of the weather's falls it is: rain or snow. */
  share: (now: WeatherNow) => number;
}

function fallingMaterial(kind: FallingKind, colour: Color, air: AtmosphereUniforms) {
  const centre = uniform(new Vector3());
  const wind = uniform(new Vector3());
  const light = colourUniform();
  const box = vec3(kind.box.across, kind.box.tall, kind.box.across);
  const i = float(instanceIndex);
  const seed = vec4(hash(i), hash(i.add(0.37e6)), hash(i.add(0.71e6)), hash(i.add(1.13e6)));
  const time = air.uHwTime;
  const speed = mix(kind.fall[0], kind.fall[1], seed.w);
  const velocity = vec3(wind.x, speed.negate(), wind.z);
  const start = seed.xyz.sub(0.5).mul(box);
  const phase = time.mul(seed.w.add(0.6)).add(seed.x.mul(40));
  const swayed = start.add(velocity.mul(time)).add(vec3(sin(phase), 0, cos(phase.mul(0.8))).mul(kind.sway));
  // Wrapped into the box round the camera, so the fall never runs out.
  const p = mod(swayed.sub(centre).add(box.mul(0.5)), box).sub(box.mul(0.5)).add(centre);
  const toEye = normalize(cameraPosition.sub(p));
  const streaked = kind.streak > 1.5;
  // A streak lies along its fall, turned to the eye; a flake faces the camera square.
  const side: Node<"vec3"> = streaked ? normalize(cross(normalize(velocity), toEye)) : normalize(cross(vec3(0, 1, 0), toEye));
  const along: Node<"vec3"> = streaked ? normalize(velocity) : normalize(cross(toEye, side));
  const corner = positionGeometry.xy;
  const world = p.add(side.mul(corner.x.mul(kind.width))).add(along.mul(corner.y.mul(kind.width * kind.streak)));
  // Thinner at the edges of the box, so it has no edge; none right at the eye, where one would fill the view.
  const edge = max(p.x.sub(centre.x).abs(), p.z.sub(centre.z).abs()).div(kind.box.across);
  const fade = varying(float(1).sub(smoothstep(0.35, 0.5, edge)).mul(smoothstep(0.4, 1.4, length(p.sub(cameraPosition)))));
  const shape = streaked
    ? smoothstep(1, 0, corner.x.abs()).mul(smoothstep(1, 0.3, corner.y.abs()))
    : smoothstep(1, 0.2, length(vec2(corner.x, corner.y)));
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  material.fog = false;
  material.vertexNode = cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(world, 1));
  const alpha = shape.mul(fade).mul(kind.opacity);
  material.colorNode = vec3(colour.r, colour.g, colour.b).mul(light);
  material.opacityNode = select(alpha.lessThan(0.003), float(0), alpha);
  return { material, centre, wind, light };
}

const flash = new Color();

export function Falling({ kind, colour, now, atmosphere, lightning }: { kind: FallingKind; colour: Color; now: WeatherNow; atmosphere: AtmosphereUniforms; lightning: Color }) {
  const mesh = useRef<Mesh>(null);
  const assets = useMemo(() => {
    const quad = new PlaneGeometry(2, 2);
    const geometry = new InstancedBufferGeometry();
    geometry.setIndex(quad.getIndex());
    geometry.setAttribute("position", quad.getAttribute("position"));
    geometry.instanceCount = 0;
    return { geometry, ...fallingMaterial(kind, colour, atmosphere) };
  }, [kind, colour, atmosphere]);
  useEffect(
    () => () => {
      assets.geometry.dispose();
      assets.material.dispose();
    },
    [assets],
  );
  useFrame(({ camera }) => {
    const share = kind.share(now);
    const count = share > 0.002 ? Math.round(kind.count * share) : 0;
    if (mesh.current) {
      (mesh.current.geometry as InstancedBufferGeometry).instanceCount = count;
      mesh.current.visible = count > 0;
    }
    assets.centre.value.copy(camera.position);
    const { wind } = now.weather;
    assets.wind.value.set(wind.x * wind.speed * kind.carried, 0, wind.z * wind.speed * kind.carried);
    assets.light.value
      .copy(atmosphere.uHwSkyLight.value)
      .add(atmosphere.uHwSunLight.value)
      .add(flash.copy(lightning).multiplyScalar(now.flash * 2));
  });
  return <mesh ref={mesh} geometry={assets.geometry} material={assets.material} frustumCulled={false} renderOrder={4} />;
}
