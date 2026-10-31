import { BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshBasicNodeMaterial, SRGBColorSpace, Vector3, type Node } from "three/webgpu";
import { float, frontFacing, normalWorld, select, texture, uniform, uv, vec3 } from "three/tsl";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Sun } from "./detail";
import { GLYPHS, SIGN_ART, type SignInk } from "./sign-art";

/*
 * The road signs, drawn once on a canvas when the game starts. A sign is one
 * record in millimetres from its middle: its cut edge and how to paint it. The
 * sheet's cell and the plate's mesh are both worked out from that record at one
 * scale, so art and plate can't drift apart and nothing is stretched. Plates are
 * cut to their outlines in geometry, so a sign is opaque, with no alpha edge to
 * shimmer.
 *
 * `sign-art.ts` is Traficom's own drawings and road-sign letters. The circular
 * and information signs below are the same regulation's numbers, and a direction
 * plate is laid out from its F13.
 *
 * The sheet also holds the words on shop signs (`shopfront.ts`).
 */

const SHEET_PIXELS = 2048;
/** Sheet pixels per millimetre of plate: a 900 mm triangle is 252 pixels, enough for 8 m, with mips for the rest. */
const PIXELS_PER_MM = 0.28;
const GUTTER = 8;
const WORD_WIDE = 512;
const WORD_TALL = 88;
export const WORD_COLUMNS = 4;
export const WORD_ROWS = 2;
const CIRCLE_SIDES = 96;
const AMBIENT = 0.78;
const SUN_SHARE = 0.42;

/** Circular signs and speed-limit areas, millimetres. */
const ROUND_MM = 640;
const RING_MM = { edge: 320, red: 310, inner: 245 };
const DIGIT_MM = 300;
const DIGIT_GAP_MM = { two: 32.5, three: 11.7 };
const NO_ENTRY_MM = { red: 305, bar: 275, barHalf: 62.5 };
const AREA_MM = { side: 900, outerCorner: 45, band: 30, innerCorner: 20 };
const INFORMATION_MM = { width: 900, height: 740, outerCorner: 60, band: 30, innerCorner: 30, square: 450, squareTop: 145 };
/** Its i, in the drawing's own numbers, whose middle is at (450, 370 - 443). */
const INFORMATION_I = { x: -450, y: 73, dotX: 450, dotY: -203, dotRadius: 75, stem: "M520 -108V32C520 76.3 555.7 112 600 112V122H300V112C344.3 112 380 76.3 380 32V-53C380 -80.7 357.7 -103 330 -103V-108Z" };

/** A direction plate (F13), in millimetres, with capitals 150 tall. */
const DIRECTION_MM = { height: 377, cap: 150, border: 22, corner: 45, innerCorner: 20, pad: 76, tip: 188 };
/** Between capitals, in the letters' own hundredths of a capital's height, tighter beside a letter with open sides. */
const LETTER_GAP = 30.5;
const OPEN_ON_THE_RIGHT = new Set("ALPTVWY");
const OPEN_ON_THE_LEFT = new Set("AJTVWY");
const OPEN_GAP = 18;
const WORD_SPACE = { advance: 70, path: "" };

const SPEEDS = [30, 40, 50, 60, 70, 80, 90, 100, 120] as const;
const AREA_SPEEDS = [30, 40, 50] as const;
const PLACES = ["Mariehamn", "Jomala", "Godby", "Hammarland", "Eckerö", "Finström", "Sund", "Kastelholm", "Bomarsund", "Saltvik", "Geta", "Lemland", "Lumparland", "Vårdö", "Färjhamn"] as const;
const SHOP_WORDS = ["BAGERI", "KIOSK", "KAFFE", "APOTEK", "BOKHANDEL", "BLOMMOR", "KLÄDER", "SKOR"] as const;

type Pen = CanvasRenderingContext2D;
type Ink = (name: string) => string;

interface Drawn {
  width: number;
  height: number;
  /** The cut edge, x and y in turn, millimetres from the middle, y down. */
  outline: number[];
  /** What shows at the edge, painted past it so filtering never reads a neighbouring cell. */
  base: SignInk;
  paint: (pen: Pen, ink: (name: SignInk) => string) => void;
}

export interface SignRecord {
  widthM: number;
  heightM: number;
  outline: number[];
  /** The middle of its cell, in sheet pixels. */
  x: number;
  y: number;
}

export interface SignSheet {
  texture: CanvasTexture;
  signs: Map<string, SignRecord>;
  /** Where the shop words start on the sheet, and each one's size, as shares of it. */
  words: { u: number; v: number; width: number; height: number };
}

const ring = (radius: number) => Array.from({ length: CIRCLE_SIDES * 2 }, (_, at) => {
  const angle = (Math.floor(at / 2) / CIRCLE_SIDES) * Math.PI * 2;
  return (at % 2 === 0 ? Math.cos(angle) : Math.sin(angle)) * radius;
});

/** A rectangle's outline with round corners, or one side pointed. */
function roundedBox(width: number, height: number, corner: number): number[] {
  const points: number[] = [];
  const [right, bottom] = [width / 2 - corner, height / 2 - corner];
  for (const [cx, cy, from] of [[right, -bottom, -90], [right, bottom, 0], [-right, bottom, 90], [-right, -bottom, 180]]) {
    for (let step = 0; step <= 6; step++) {
      const angle = ((from + step * 15) * Math.PI) / 180;
      points.push(cx + Math.cos(angle) * corner, cy + Math.sin(angle) * corner);
    }
  }
  return points;
}

function disc(pen: Pen, radius: number): void {
  pen.beginPath();
  pen.arc(0, 0, radius, 0, Math.PI * 2);
  pen.fill();
}

function box(pen: Pen, x: number, y: number, width: number, height: number, corner: number): void {
  pen.beginPath();
  pen.roundRect(x, y, width, height, corner);
  pen.fill();
}

const textWidth = (text: string) => {
  let total = 0;
  [...text].forEach((letter, at) => {
    total += glyph(letter).advance;
    if (at > 0) total += gapBetween(text[at - 1], letter);
  });
  return total;
};

function glyph(letter: string) {
  if (letter === " ") return WORD_SPACE;
  if (!(letter in GLYPHS)) throw new Error(`no road-sign letter ${letter}`);
  return GLYPHS[letter];
}

function gapBetween(left: string, right: string): number {
  if (left === " " || right === " ") return 0;
  return OPEN_ON_THE_RIGHT.has(left) || OPEN_ON_THE_LEFT.has(right) ? OPEN_GAP : LETTER_GAP;
}

/** Lettering in Traficom's road-sign letters, its middle at (x, y), squeezed to fit a width if one is given. */
function lettering(pen: Pen, text: string, x: number, y: number, cap: number, gap?: number, wide?: number): void {
  const letters = [...text.toLocaleUpperCase("sv")];
  const size = cap / 100;
  const spaced = gap === undefined ? textWidth(letters.join("")) : letters.reduce((sum, letter) => sum + glyph(letter).advance, 0) + (gap / size) * (letters.length - 1);
  const squeeze = wide === undefined ? 1 : Math.min(1, wide / (spaced * size));
  pen.save();
  pen.translate(x, y - cap / 2);
  pen.scale(size * squeeze, size);
  pen.translate(-spaced / 2, 0);
  let at = 0;
  letters.forEach((letter, index) => {
    pen.save();
    pen.translate(at, 0);
    pen.fill(new Path2D(glyph(letter).path), "evenodd");
    pen.restore();
    const next = letters[index + 1] as string | undefined;
    at += glyph(letter).advance + (next === undefined ? 0 : gap === undefined ? gapBetween(letter, next) : gap / size);
  });
  pen.restore();
}

function speedDigits(pen: Pen, speed: number): void {
  const text = String(speed);
  lettering(pen, text, 0, 0, DIGIT_MM, text.length > 2 ? DIGIT_GAP_MM.three : DIGIT_GAP_MM.two);
}

function speedRing(pen: Pen, ink: (name: SignInk) => string): void {
  pen.fillStyle = ink("red");
  disc(pen, RING_MM.red);
  pen.fillStyle = ink("yellow");
  disc(pen, RING_MM.inner);
}

function speedLimit(speed: number): Drawn {
  return {
    width: ROUND_MM,
    height: ROUND_MM,
    outline: ring(RING_MM.edge),
    base: "yellow",
    paint(pen, ink) {
      speedRing(pen, ink);
      pen.fillStyle = ink("black");
      speedDigits(pen, speed);
    },
  };
}

function speedArea(speed: number): Drawn {
  const { side, outerCorner, band, innerCorner } = AREA_MM;
  return {
    width: side,
    height: side,
    outline: roundedBox(side, side, outerCorner),
    base: "red",
    paint(pen, ink) {
      pen.fillStyle = ink("yellow");
      box(pen, -side / 2 + band, -side / 2 + band, side - band * 2, side - band * 2, innerCorner);
      speedRing(pen, ink);
      pen.fillStyle = ink("black");
      speedDigits(pen, speed);
    },
  };
}

const noEntry: Drawn = {
  width: ROUND_MM,
  height: ROUND_MM,
  outline: ring(RING_MM.edge),
  base: "yellow",
  paint(pen, ink) {
    pen.fillStyle = ink("red");
    disc(pen, NO_ENTRY_MM.red);
    pen.fillStyle = ink("yellow");
    const reach = Math.sqrt(NO_ENTRY_MM.bar ** 2 - NO_ENTRY_MM.barHalf ** 2);
    pen.fillRect(-reach, -NO_ENTRY_MM.barHalf, reach * 2, NO_ENTRY_MM.barHalf * 2);
  },
};

const information: Drawn = {
  width: INFORMATION_MM.width,
  height: INFORMATION_MM.height,
  outline: roundedBox(INFORMATION_MM.width, INFORMATION_MM.height, INFORMATION_MM.outerCorner),
  base: "white",
  paint(pen, ink) {
    const { width, height, band, innerCorner, square, squareTop } = INFORMATION_MM;
    pen.fillStyle = ink("blue");
    box(pen, -width / 2 + band, -height / 2 + band, width - band * 2, height - band * 2, innerCorner);
    pen.fillStyle = ink("white");
    pen.fillRect(-square / 2, -height / 2 + squareTop, square, square);
    pen.fillStyle = ink("black");
    pen.save();
    pen.translate(INFORMATION_I.x, INFORMATION_I.y);
    pen.beginPath();
    pen.arc(INFORMATION_I.dotX, INFORMATION_I.dotY, INFORMATION_I.dotRadius, 0, Math.PI * 2);
    pen.fill();
    pen.fill(new Path2D(INFORMATION_I.stem));
    pen.restore();
  },
};

function fromArt(name: string, mirrored = false): Drawn {
  const { width, height, outline, layers } = SIGN_ART[name];
  return {
    width,
    height,
    outline: mirrored ? outline.map((value, at) => (at % 2 === 0 ? -value : value)) : outline,
    base: layers[0].ink,
    paint(pen, ink) {
      if (mirrored) pen.scale(-1, 1);
      for (const { ink: colour, path, evenOdd } of layers) {
        pen.fillStyle = ink(colour);
        pen.fill(new Path2D(path), evenOdd ? "evenodd" : "nonzero");
      }
    },
  };
}

function directionPlate(place: string): Drawn {
  const { height, cap, border, corner, innerCorner, pad, tip } = DIRECTION_MM;
  const lettersWide = (textWidth(place.toLocaleUpperCase("sv")) * cap) / 100;
  const body = lettersWide + pad * 2 + border * 2;
  const width = body + tip;
  const left = -width / 2;
  const edge = roundedBox(body + corner, height, corner).map((value, at) => (at % 2 === 0 ? value + left + (body + corner) / 2 : value));
  // Only the left-hand corners stay round: the right runs on to the point.
  const leftSide = edge.filter((_, at) => {
    const point = Math.floor(at / 2);
    return point >= 14;
  });
  const outline = [left + body, -height / 2, width / 2, 0, left + body, height / 2, ...leftSide];
  return {
    width,
    height,
    outline,
    base: "white",
    paint(pen, ink) {
      pen.fillStyle = ink("blue");
      box(pen, left + border, -height / 2 + border, body - border * 2, height - border * 2, innerCorner);
      pen.fillStyle = ink("white");
      lettering(pen, place, left + border + pad + lettersWide / 2, 0, cap);
    },
  };
}

function allSigns(extraPlaces: readonly string[]): Map<string, Drawn> {
  const signs = new Map<string, Drawn>();
  for (const speed of SPEEDS) signs.set(`speed-${speed}`, speedLimit(speed));
  for (const speed of AREA_SPEEDS) signs.set(`speed-area-${speed}`, speedArea(speed));
  for (const name of Object.keys(SIGN_ART)) signs.set(name, fromArt(name));
  signs.set("side-road-right", fromArt("side-road-left", true));
  signs.set("no-entry", noEntry);
  signs.set("information", information);
  for (const place of [...PLACES, ...extraPlaces]) signs.set(`to-${place}`, directionPlate(place));
  return signs;
}

/** Fills the sheet from its top, row by row, leaving the shop words the bottom of it. */
function drawSigns(pen: Pen, ink: Ink, extraPlaces: readonly string[]): Map<string, SignRecord> {
  const records = new Map<string, SignRecord>();
  const signInk = (name: SignInk) => ink(`sign-${name}`);
  const room = SHEET_PIXELS - WORD_ROWS * WORD_TALL;
  let [x, y, rowTall] = [0, 0, 0];
  const all = [...allSigns(extraPlaces)].sort(([, a], [, b]) => b.height - a.height);
  for (const [name, sign] of all) {
    const wide = Math.ceil(sign.width * PIXELS_PER_MM) + GUTTER * 2;
    const tall = Math.ceil(sign.height * PIXELS_PER_MM) + GUTTER * 2;
    if (x + wide > SHEET_PIXELS) [x, y, rowTall] = [0, y + rowTall, 0];
    if (y + tall > room) throw new Error(`the sign sheet is full at ${name}`);
    pen.fillStyle = signInk(sign.base);
    pen.fillRect(x, y, wide, tall);
    const [middleX, middleY] = [x + wide / 2, y + tall / 2];
    pen.save();
    pen.translate(middleX, middleY);
    pen.scale(PIXELS_PER_MM, PIXELS_PER_MM);
    sign.paint(pen, signInk);
    pen.restore();
    records.set(name, { widthM: sign.width / 1000, heightM: sign.height / 1000, outline: sign.outline, x: middleX, y: middleY });
    x += wide;
    rowTall = Math.max(rowTall, tall);
  }
  return records;
}

function shopWords(pen: Pen, ink: Ink, top: number): void {
  pen.fillStyle = ink("sign-black");
  pen.fillRect(0, top, WORD_COLUMNS * WORD_WIDE, WORD_ROWS * WORD_TALL);
  pen.fillStyle = ink("sign-white");
  SHOP_WORDS.forEach((word, at) => {
    const x = (at % WORD_COLUMNS) * WORD_WIDE;
    const y = top + Math.floor(at / WORD_COLUMNS) * WORD_TALL;
    lettering(pen, word, x + WORD_WIDE / 2, y + WORD_TALL / 2, WORD_TALL * 0.7, undefined, WORD_WIDE * 0.9);
  });
}

/** Draws the sheet. `ink` gives a token's colour as CSS, and `extraPlaces` adds direction plates to the usual ones. */
export function createSignSheet(ink: Ink, extraPlaces: readonly string[] = []): SignSheet {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SHEET_PIXELS;
  const pen = canvas.getContext("2d");
  if (!pen) throw new Error("no 2D canvas for the sign sheet");
  const signs = drawSigns(pen, ink, extraPlaces);
  const wordsTop = SHEET_PIXELS - WORD_ROWS * WORD_TALL;
  shopWords(pen, ink, wordsTop);

  const sheet = new CanvasTexture(canvas);
  sheet.colorSpace = SRGBColorSpace;
  sheet.flipY = false;
  sheet.generateMipmaps = true;
  sheet.minFilter = LinearMipmapLinearFilter;
  sheet.magFilter = LinearFilter;
  sheet.anisotropy = 16;
  return {
    texture: sheet,
    signs,
    words: { u: 0, v: wordsTop / SHEET_PIXELS, width: WORD_WIDE / SHEET_PIXELS, height: WORD_TALL / SHEET_PIXELS },
  };
}

/** A plate as a flat mesh facing +z with its middle at the origin, ready to stand on a post. */
export function signPlate({ signs }: SignSheet, name: string): BufferGeometry {
  const sign = signs.get(name);
  if (!sign) throw new Error(`no sign called ${name}`);
  const corners = sign.outline.length / 2;
  const positions = new Float32Array((corners + 1) * 3);
  const normals = new Float32Array((corners + 1) * 3);
  const uvs = new Float32Array((corners + 1) * 2);
  const put = (at: number, x: number, y: number) => {
    positions.set([x / 1000, -y / 1000, 0], at * 3);
    normals.set([0, 0, 1], at * 3);
    uvs.set([(sign.x + x * PIXELS_PER_MM) / SHEET_PIXELS, (sign.y + y * PIXELS_PER_MM) / SHEET_PIXELS], at * 2);
  };
  put(corners, 0, 0);
  for (let at = 0; at < corners; at++) put(at, sign.outline[at * 2], sign.outline[at * 2 + 1]);
  // Outlines run either way round, and a plate's front has to face +z whichever they do.
  let turning = 0;
  for (let at = 0; at < corners; at++) {
    const next = (at + 1) % corners;
    turning += sign.outline[at * 2] * sign.outline[next * 2 + 1] - sign.outline[next * 2] * sign.outline[at * 2 + 1];
  }
  const indices: number[] = [];
  for (let at = 0; at < corners; at++) {
    const next = (at + 1) % corners;
    if (turning > 0) indices.push(corners, next, at);
    else indices.push(corners, at, next);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export function signNames({ signs }: SignSheet): string[] {
  return [...signs.keys()];
}

const POLE_RADIUS_M = 0.03;
const CLAMP_RADIUS_M = 0.036;
const CLAMP_TALL_M = 0.05;

/** A galvanised pole from the ground up, its middle on the origin's axis, with a clamp at each height given. */
export function signPost(heightM: number, clampsAtM: number[]): BufferGeometry {
  const pole = new CylinderGeometry(POLE_RADIUS_M, POLE_RADIUS_M, heightM, 8);
  pole.translate(0, heightM / 2, 0);
  const clamps = clampsAtM.map((at) => {
    const clamp = new CylinderGeometry(CLAMP_RADIUS_M, CLAMP_RADIUS_M, CLAMP_TALL_M, 8);
    clamp.translate(0, at, 0);
    return clamp;
  });
  return mergeGeometries([pole, ...clamps]);
}

export interface SignLook {
  colour: (name: string) => Node<"vec3">;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
}

const lightFrom = ({ azimuthDeg, elevationDeg }: Sun) => {
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  return uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
};

/** The plates' material: the sheet on the front, bare grey metal behind, lit as the walls are. */
export function signMaterial({ texture: sheet }: SignSheet, { colour, hazed }: SignLook, sun: Sun): MeshBasicNodeMaterial {
  const toSun = lightFrom(sun);
  const facing = select(frontFacing, normalWorld, normalWorld.negate());
  const light = float(AMBIENT).add(facing.dot(toSun).max(0).mul(SUN_SHARE));
  const material = new MeshBasicNodeMaterial();
  material.colorNode = hazed(select(frontFacing, vec3(texture(sheet, uv()).rgb), colour("sign-back")).mul(light));
  material.side = DoubleSide;
  return material;
}

/** Galvanised steel, lit the same way. */
export function signPostMaterial({ colour, hazed }: SignLook, sun: Sun): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.colorNode = hazed(colour("sign-post").mul(float(AMBIENT).add(normalWorld.dot(lightFrom(sun)).max(0).mul(SUN_SHARE))));
  return material;
}
