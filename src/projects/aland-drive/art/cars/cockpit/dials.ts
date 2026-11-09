import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SRGBColorSpace } from "three/webgpu";
import { GLYPHS } from "../../surfaces/sign-art";
import { ATLAS, GLYPH, GLYPH_GRID, SLOT } from "./atlas";
import type { GaugeKind } from "./style";

/*
 * A car's dial faces, drawn once into the instrument sheet: ticks, figures in
 * the road-sign letters every sign in the game uses, the red past the redline,
 * and the cell of glyphs the readouts read. Colour goes in the image's colour,
 * and what lights after dark in its alpha, drawn on a second canvas so the
 * canvas's own alpha doesn't darken the colour under it.
 */

export interface DialFaces {
  gauges: GaugeKind;
  /** Full scale of the speed dial, in the units shown, and their name. */
  speedMax: number;
  speedUnit: "KM/H" | "MPH";
  /** Full scale of the rev counter and the redline, in thousands. */
  revsMax: number;
  redline: number;
  /** The panel the digital cluster is drawn on, wide for its height. */
  panelAspect: number;
  /** The oil's small dial is a turbo's boost gauge instead, in bar, for a cluster that has one. */
  boost: boolean;
  /** Ivory faces with dark figures (`InteriorStyle.lightDials`). */
  light: boolean;
}

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--color-aland-drive-${name}`).trim();

type Pen = CanvasRenderingContext2D;

const CELL = ATLAS.cellPixels;
/** A dial's radius in its cell, in pixels: the face's edge is the disc's. */
const FACE = CELL / 2;

/** Road-sign lettering, its middle at (x, y), `cap` tall; a slash and a minus are drawn, having no glyph. */
function letters(pen: Pen, text: string, x: number, y: number, cap: number) {
  const size = cap / 100;
  const advance = (letter: string) => (letter === "/" ? 40 : letter === "-" ? 50 : letter === " " ? 40 : GLYPHS[letter].advance);
  const gap = 12;
  const chars = [...text];
  const total = chars.reduce((sum, letter) => sum + advance(letter), 0) + gap * (chars.length - 1);
  pen.save();
  pen.translate(x, y - cap / 2);
  pen.scale(size, size);
  pen.translate(-total / 2, 0);
  let at = 0;
  for (const letter of chars) {
    pen.save();
    pen.translate(at, 0);
    if (letter === "/") {
      pen.beginPath();
      pen.moveTo(32, 0);
      pen.lineTo(46, 0);
      pen.lineTo(14, 100);
      pen.lineTo(0, 100);
      pen.fill();
    } else if (letter === "-") {
      pen.fillRect(4, 44, 42, 13);
    } else if (letter !== " ") {
      pen.fill(new Path2D(GLYPHS[letter].path), "evenodd");
    }
    pen.restore();
    at += advance(letter) + gap;
  }
  pen.restore();
}

/** Both pens at once: the face's colour and what of it glows. */
interface Pens {
  colour: Pen;
  glow: Pen;
}

function both(pens: Pens, draw: (pen: Pen, glowing: boolean) => void) {
  draw(pens.colour, false);
  draw(pens.glow, true);
}

/** A point on a dial at an angle (anticlockwise from the right, degrees) and a share of its radius, in the cell's pixels. */
const onDial = (degrees: number, share: number) => [Math.cos((degrees * Math.PI) / 180) * share * FACE, -Math.sin((degrees * Math.PI) / 180) * share * FACE] as const;

interface Scale {
  max: number;
  /** Ticks every `minor`, a long one every `major`, a figure every `label`, each figure divided by `shown`. */
  minor: number;
  major: number;
  label: number;
  shown: number;
  red?: number;
  start: number;
  sweep: number;
}

function drawDial(pens: Pens, slot: number, scale: Scale, face: { ground: string; ink: string; red: string }, words: string[], small = false) {
  const column = slot % ATLAS.columns;
  const row = Math.floor(slot / ATLAS.columns);
  both(pens, (pen, glowing) => {
    pen.save();
    pen.translate(column * CELL + CELL / 2, row * CELL + CELL / 2);
    pen.fillStyle = glowing ? "#000" : face.ground;
    pen.beginPath();
    pen.arc(0, 0, FACE, 0, Math.PI * 2);
    pen.fill();
    if (!glowing) {
      // A soft rise of light towards the middle, so the face reads as a dish under glass.
      const sheen = pen.createRadialGradient(0, -FACE * 0.3, FACE * 0.1, 0, 0, FACE);
      sheen.addColorStop(0, "rgba(255,255,255,0.07)");
      sheen.addColorStop(1, "rgba(0,0,0,0.12)");
      pen.fillStyle = sheen;
      pen.fill();
    }
    const at = (value: number) => scale.start + (scale.sweep * value) / scale.max;
    if (scale.red !== undefined) {
      pen.strokeStyle = glowing ? "#f00" : face.red;
      pen.lineWidth = FACE * (small ? 0.12 : 0.07);
      pen.beginPath();
      const [from, to] = [at(scale.red), at(scale.max)];
      pen.arc(0, 0, FACE * 0.86, (-from * Math.PI) / 180, (-to * Math.PI) / 180, scale.sweep < 0);
      pen.stroke();
    }
    pen.strokeStyle = glowing ? "#fff" : face.ink;
    pen.fillStyle = glowing ? "#fff" : face.ink;
    pen.lineCap = "butt";
    const steps = Math.round(scale.max / scale.minor);
    for (let step = 0; step <= steps; step++) {
      const value = step * scale.minor;
      const major = Math.abs(value / scale.major - Math.round(value / scale.major)) < 1e-6;
      const [x0, y0] = onDial(at(value), major ? 0.74 : 0.82);
      const [x1, y1] = onDial(at(value), 0.92);
      pen.lineWidth = FACE * (major ? (small ? 0.05 : 0.028) : 0.014);
      pen.beginPath();
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
      pen.stroke();
      if (!small && Math.abs(value / scale.label - Math.round(value / scale.label)) < 1e-6) {
        const [x, y] = onDial(at(value), 0.56);
        letters(pen, String(Math.round(value / scale.shown)), x, y, FACE * 0.15);
      }
    }
    words.forEach((word, index) => letters(pen, word, 0, FACE * (0.42 + index * 0.18), FACE * (small ? 0.2 : 0.085)));
    pen.restore();
  });
}

/** A small gauge's ends: letters either side of its arc, and a mark for what it reads. */
function drawSmall(pens: Pens, slot: number, ends: readonly [string, string], face: { ground: string; ink: string; red: string }) {
  drawDial(pens, slot, { max: 1, minor: 0.25, major: 0.5, label: 2, shown: 1, start: 135, sweep: -90, red: slot === SLOT.water ? 0.85 : undefined }, face, [], true);
  const column = slot % ATLAS.columns;
  const row = Math.floor(slot / ATLAS.columns);
  both(pens, (pen, glowing) => {
    pen.save();
    pen.translate(column * CELL + CELL / 2, row * CELL + CELL / 2);
    pen.fillStyle = glowing ? "#fff" : face.ink;
    const [lx, ly] = onDial(150, 0.62);
    const [rx, ry] = onDial(30, 0.62);
    letters(pen, ends[0], lx, ly + FACE * 0.12, FACE * 0.2);
    letters(pen, ends[1], rx, ry + FACE * 0.12, FACE * 0.2);
    // What it reads, as a little mark under the needle's pivot.
    pen.translate(0, FACE * 0.45);
    pen.beginPath();
    if (slot === SLOT.fuel) {
      pen.rect(-FACE * 0.1, -FACE * 0.12, FACE * 0.14, FACE * 0.24);
      pen.rect(FACE * 0.06, -FACE * 0.06, FACE * 0.04, FACE * 0.16);
    } else if (slot === SLOT.water) {
      pen.rect(-FACE * 0.02, -FACE * 0.14, FACE * 0.04, FACE * 0.2);
      pen.arc(0, FACE * 0.08, FACE * 0.06, 0, Math.PI * 2);
    } else {
      pen.moveTo(0, -FACE * 0.14);
      pen.quadraticCurveTo(FACE * 0.11, FACE * 0.02, 0, FACE * 0.1);
      pen.quadraticCurveTo(-FACE * 0.11, FACE * 0.02, 0, -FACE * 0.14);
    }
    pen.fill();
    pen.restore();
  });
}

/** The digital cluster's panel: a dark ground, a fine frame, and the unit under where the speed's figures go. */
function drawPanel(pens: Pens, faces: DialFaces, ink: string) {
  const [x0, y0] = [(SLOT.digital % ATLAS.columns) * CELL, Math.floor(SLOT.digital / ATLAS.columns) * CELL];
  const [width, height] = [CELL * 2, CELL];
  // The panel is wider than its two cells, so what's drawn is squeezed across to come out true.
  const squeeze = 2 / faces.panelAspect;
  both(pens, (pen, glowing) => {
    pen.save();
    pen.translate(x0, y0);
    if (!glowing) {
      const ground = pen.createLinearGradient(0, 0, 0, height);
      ground.addColorStop(0, "#0d1118");
      ground.addColorStop(1, "#040507");
      pen.fillStyle = ground;
    } else {
      pen.fillStyle = "#000";
    }
    pen.fillRect(0, 0, width, height);
    pen.strokeStyle = glowing ? "#333" : "rgba(255,255,255,0.12)";
    pen.lineWidth = 6;
    pen.strokeRect(20, 20, width - 40, height - 40);
    pen.fillStyle = glowing ? "#bbb" : ink;
    pen.save();
    pen.translate(width / 2, height * 0.83);
    pen.scale(squeeze, 1);
    letters(pen, faces.speedUnit, 0, 0, height * 0.075);
    pen.restore();
    pen.restore();
  });
}

/** The glyphs the readouts read: the digits, R, N, a minus and D, white on nothing. */
function drawGlyphs(pens: Pens) {
  const [x0, y0] = [(SLOT.figures % ATLAS.columns) * CELL, Math.floor(SLOT.figures / ATLAS.columns) * CELL];
  const cell = CELL / GLYPH_GRID;
  const glyphs: [number, string][] = [...Array.from({ length: 10 }, (_, digit): [number, string] => [digit, String(digit)]), [GLYPH.reverse, "R"], [GLYPH.neutral, "N"], [GLYPH.minus, "-"], [GLYPH.drive, "D"]];
  both(pens, (pen) => {
    pen.fillStyle = "#fff";
    for (const [index, text] of glyphs) {
      const [column, row] = [index % GLYPH_GRID, Math.floor(index / GLYPH_GRID)];
      letters(pen, text, x0 + (column + 0.5) * cell, y0 + (row + 0.5) * cell, cell * 0.76);
    }
  });
}

/** The sheet for a car's dials, as a texture three can mip. */
export function drawDialSheet(faces: DialFaces): DataTexture {
  const [width, height] = [ATLAS.columns * CELL, ATLAS.rows * CELL];
  const canvases = [document.createElement("canvas"), document.createElement("canvas")];
  for (const canvas of canvases) {
    canvas.width = width;
    canvas.height = height;
  }
  const [colourPen, glowPen] = canvases.map((canvas) => {
    const pen = canvas.getContext("2d", { willReadFrequently: true });
    if (!pen) throw new Error("no 2D canvas for the dials");
    return pen;
  });
  const pens = { colour: colourPen, glow: glowPen };
  glowPen.fillStyle = "#000";
  glowPen.fillRect(0, 0, width, height);

  const light = faces.light || faces.gauges === "classic" || faces.gauges === "race";
  const face = light ? { ground: token("car-cabin-ivory"), ink: token("car-cabin-ink-dark"), red: token("car-cabin-lamp-red") } : { ground: token("car-cabin-panel"), ink: token("car-cabin-ink"), red: token("car-cabin-lamp-red") };
  const speedLabel = faces.speedMax > 200 ? 40 : 20;
  drawDial(pens, SLOT.speed, { max: faces.speedMax, minor: speedLabel / 4, major: speedLabel / 2, label: speedLabel, shown: 1, start: 225, sweep: -270 }, face, [faces.speedUnit]);
  drawDial(pens, SLOT.revs, { max: faces.revsMax, minor: 0.5, major: 1, label: 1, shown: 1, red: faces.redline, start: 225, sweep: -270 }, face, ["RPM", "X1000"]);
  drawSmall(pens, SLOT.fuel, ["E", "F"], face);
  drawSmall(pens, SLOT.water, ["C", "H"], face);
  // A boost gauge reads 0 to 2 bar round the same sweep as the big dials, its last half bar red.
  if (faces.boost) drawDial(pens, SLOT.oil, { max: 1, minor: 0.125, major: 0.25, label: 0.5, shown: 0.5, red: 0.8, start: 225, sweep: -270 }, face, ["BAR"]);
  else drawSmall(pens, SLOT.oil, ["0", "5"], face);
  drawPanel(pens, faces, token("car-cabin-ink"));
  drawGlyphs(pens);

  const colour = colourPen.getImageData(0, 0, width, height).data;
  const glow = glowPen.getImageData(0, 0, width, height).data;
  const pixels = new Uint8Array(width * height * 4);
  // A canvas's first row is the image's top, and three reads v up from the bottom, so rows go in turned over.
  for (let y = 0; y < height; y++) {
    const from = y * width * 4;
    const to = (height - 1 - y) * width * 4;
    for (let x = 0; x < width * 4; x += 4) {
      pixels[to + x] = colour[from + x];
      pixels[to + x + 1] = colour[from + x + 1];
      pixels[to + x + 2] = colour[from + x + 2];
      pixels[to + x + 3] = glow[from + x];
    }
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
