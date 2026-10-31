import { AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, MeshBasicNodeMaterial, Vector3 } from "three/webgpu";
import { float, fract, mix, positionGeometry, sin, smoothstep, uniform, varying } from "three/tsl";
import { nightColour, type F, type Night } from "./night";

/*
 * The aurora: a curtain low on the northern horizon, one coarse strip of a cylinder round the eye, added over the sky.
 * It's rare and faint on purpose: this far south it's a pale green band that a good night shows and most don't. Folds
 * are a few sines along the arc, so there's no texture and no marching; the rays are one more sine stretched up it.
 */

const SPAN_DEG = 110;
const COLUMNS = 40;
const LOW_DEG = 2;
const HIGH_DEG = 24;
const TRUE_NORTH_GRID_DEG = 6.25;
const DRIFT = 0.016;
const STRENGTH = 0.3;
/** About one night in this many has one at all. */
const NIGHTS_PER_AURORA = 12;

/** How strong tonight's aurora is, 0 to 1, by the night's number: the same night always gives the same answer, and most give none. */
export function auroraTonight(nightNumber: number) {
  const value = Math.sin(nightNumber * 127.1) * 43758.5453;
  const roll = value - Math.floor(value);
  return roll < 1 / NIGHTS_PER_AURORA ? 0.45 + roll * NIGHTS_PER_AURORA * 0.55 : 0;
}

function stripGeometry(reach: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  const low = (LOW_DEG * Math.PI) / 180;
  const high = (HIGH_DEG * Math.PI) / 180;
  for (let column = 0; column <= COLUMNS; column++) {
    const share = column / COLUMNS - 0.5;
    const bearing = ((share * SPAN_DEG + TRUE_NORTH_GRID_DEG) * Math.PI) / 180;
    for (const up of [low, high]) positions.push(Math.sin(bearing) * Math.cos(up) * reach, Math.sin(up) * reach, -Math.cos(bearing) * Math.cos(up) * reach);
    if (column < COLUMNS) {
      const at = column * 2;
      indices.push(at, at + 1, at + 2, at + 2, at + 1, at + 3);
    }
  }
  const uvs: number[] = [];
  for (let column = 0; column <= COLUMNS; column++) uvs.push(column / COLUMNS, 0, column / COLUMNS, 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setAttribute("uv", new BufferAttribute(Float32Array.from(uvs), 2));
  geometry.setIndex(indices);
  return geometry;
}

export interface Aurora {
  mesh: Mesh;
  /** Each frame: keeps the curtain round the eye. */
  update: (eye: Vector3) => void;
  /** Tonight's strength, from `auroraTonight`. */
  setStrength: (strength: number) => void;
  dispose: () => void;
}

export function createAurora(night: Night, reach: number): Aurora {
  const strength = uniform(0);
  const geometry = stripGeometry(reach);
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: 2 });
  const place = varying(positionGeometry);
  const arc = place.x.div(reach).mul(3).add(place.z.div(reach));
  const rise = place.y.div(reach);
  const clock = night.seconds.mul(DRIFT);
  const fold = (rate: number, speed: number, phase: number): F => sin(arc.mul(rate).add(clock.mul(speed)).add(phase));
  const shift = fold(2.1, 1, 0).mul(0.5).add(fold(4.7, -1.6, 2).mul(0.3)).add(fold(9.3, 2.3, 4).mul(0.2));
  const base = float(0.06).add(shift.mul(0.03));
  const curtain = smoothstep(base, base.add(0.035), rise).mul(float(1).sub(smoothstep(base.add(0.05), base.add(0.33), rise)));
  const rays = fract(sin(arc.mul(43).add(shift.mul(9))).mul(0.5).add(0.5)).mul(0.6).add(0.4);
  const banks = smoothstep(float(-0.4), float(0.7), fold(3.3, 0.7, 1));
  const ends = smoothstep(float(0.95), float(0.5), place.x.div(reach).abs().mul(1.35));
  const deepest = smoothstep(float(0.72), float(0.95), night.amount);
  const colour = mix(nightColour("aurora-low"), nightColour("aurora-high"), smoothstep(base.add(0.08), base.add(0.3), rise));
  material.colorNode = colour.mul(curtain.mul(rays).mul(banks).mul(ends).mul(deepest).mul(strength).mul(STRENGTH));

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1002;
  return {
    mesh,
    update(eye) {
      mesh.position.copy(eye);
    },
    setStrength(value) {
      strength.value = value;
      mesh.visible = value > 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
