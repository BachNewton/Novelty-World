import * as THREE from "three";

/**
 * A Secchi-style measuring staff for reading how far you can see into the water —
 * the debug/calibration counterpart to a real scientist's Secchi disk.
 *
 * A fixed vertical graduated board planted through the surface: metre-numbered black/
 * white 0.5 m bands run from the waterline (0) down to −BELOW_M. Because it's an
 * ordinary scene mesh it goes into the scene capture like the buoys, so the water's
 * depth absorption fades its submerged part BY THE ACTUAL optics model — the depth at
 * which the bands blur into the water colour IS the rendered visibility (a live Secchi
 * depth you can read off). The white base doubles as a tint check: you watch it shift
 * blue-green and darken with depth as red is absorbed first.
 *
 * Deliberately UNLIT (MeshBasic) so the board shows its own true colours — we're
 * judging the water's effect on it, not scene lighting. Two crossed boards keep it
 * legible from any orbit angle. Static (no wave ride) so the scale is a stable ruler.
 */

const PX_PER_M = 64;
const ABOVE_M = 2; // board extends this far above the waterline (a dry reference)
const BELOW_M = 12; // ...and this far below — the readable depth range

const makeScaleTexture = (): THREE.CanvasTexture => {
  const totalM = ABOVE_M + BELOW_M;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = totalM * PX_PER_M;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable for measuring pole");
  const cy = (yM: number) => (ABOVE_M - yM) * PX_PER_M; // world y (m) → canvas y (px)

  // Above-water part: hi-vis orange so the dry reference reads clearly.
  ctx.fillStyle = "#ff9a3c";
  ctx.fillRect(0, 0, canvas.width, cy(0));

  // 0.5 m alternating black/white bands from the surface down (contrast is what a
  // visibility read needs — same reason a real Secchi disk is black & white).
  for (let i = 0; i * 0.5 < BELOW_M; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#111111";
    ctx.fillRect(0, cy(-i * 0.5), canvas.width, 0.5 * PX_PER_M);
  }

  // Whole-metre red tick + number, coloured to contrast its band.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(PX_PER_M * 0.42)}px sans-serif`;
  for (let m = 0; m <= BELOW_M; m++) {
    const y = cy(-m);
    ctx.strokeStyle = "#cc2222";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
    ctx.fillStyle = m % 2 === 0 ? "#111111" : "#ffffff"; // band starting at −m: even → white
    ctx.fillText(String(m), canvas.width / 2, y + PX_PER_M * 0.28);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
};

export interface MeasuringPole {
  object: THREE.Object3D;
  dispose: () => void;
}

export function createMeasuringPole(x = 5, z = -2): MeasuringPole {
  const texture = makeScaleTexture();
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  const height = ABOVE_M + BELOW_M;
  const geometry = new THREE.PlaneGeometry(0.4, height);
  const root = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const board = new THREE.Mesh(geometry, material);
    board.position.y = ABOVE_M - height / 2; // top at +ABOVE_M, bottom at −BELOW_M
    board.rotation.y = (i * Math.PI) / 2; // two crossed boards → readable from any angle
    root.add(board);
  }
  root.position.set(x, 0, z);
  return {
    object: root,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
