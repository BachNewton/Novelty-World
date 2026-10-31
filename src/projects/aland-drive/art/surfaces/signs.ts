import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshBasicNodeMaterial, SRGBColorSpace, Vector3, type Node } from "three/webgpu";
import { float, frontFacing, normalWorld, select, texture, uniform, uv, vec3 } from "three/tsl";
import type { Sun } from "./detail";

/*
 * The road signs: one sheet drawn on a canvas when the game starts, from the
 * shapes and colours of the Finnish standard, as our own drawing. Plates are cut
 * to their true outlines in geometry, so a sign is opaque, with no alpha edge to
 * shimmer. The sheet is the one thing here that's a picture: lettering is cheaper
 * read from a texture than drawn by a shader.
 *
 * The sheet also holds the words on shop signs (`shopfront.ts`).
 */

const SHEET_PIXELS = 1024;
const CELL = 128;
const INSET = 4;
const PLATE_ROWS = 3;
const NAME_WIDE = 340;
const NAME_TALL = 76;
const NAME_COLUMNS = 3;
const NAME_ROWS = 5;
const WORD_WIDE = 256;
const WORD_TALL = 44;
export const WORD_COLUMNS = 4;
export const WORD_ROWS = 2;
const FONT = '"Arial Narrow", "Liberation Sans Narrow", Arial, sans-serif';
const CIRCLE_SIDES = 28;
const AMBIENT = 0.78;
const SUN_SHARE = 0.42;

const SPEEDS = [30, 40, 50, 60, 70, 80, 90, 100] as const;
const PLACES = ["Mariehamn", "Jomala", "Godby", "Hammarland", "Eckerö", "Finström", "Sund", "Kastelholm", "Bomarsund", "Saltvik", "Geta", "Lemland", "Lumparland", "Vårdö", "Färjhamn"] as const;
const SHOP_WORDS = ["BAGERI", "KIOSK", "CAFÉ", "APOTEK", "BOKHANDEL", "BLOMMOR", "KLÄDER", "SKOR"] as const;

type Shape = "circle" | "triangle" | "invertedTriangle" | "octagon" | "diamond" | "square" | "name";

export interface SignRecord {
  shape: Shape;
  /** Across the plate, metres. A name plate's height comes from its proportions. */
  sizeM: number;
  /** Its rectangle on the sheet, in pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SignSheet {
  texture: CanvasTexture;
  signs: Map<string, SignRecord>;
  /** Where the shop words start on the sheet, and each one's size, as shares of it. */
  words: { u: number; v: number; width: number; height: number };
}

type Ink = (name: string) => string;
type Pen = CanvasRenderingContext2D;

function polygon(pen: Pen, points: [number, number][]): void {
  pen.beginPath();
  points.forEach(([x, y], at) => {
    if (at === 0) pen.moveTo(x, y);
    else pen.lineTo(x, y);
  });
  pen.closePath();
}

const fitted = (pen: Pen, text: string, tall: number, wide: number) => {
  pen.font = `bold ${tall}px ${FONT}`;
  return Math.min(1, wide / pen.measureText(text).width);
};

function lettering(pen: Pen, text: string, x: number, y: number, tall: number, wide: number): void {
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  const squeeze = fitted(pen, text, tall, wide);
  pen.save();
  pen.translate(x, y);
  pen.scale(squeeze, 1);
  pen.fillText(text, 0, 0);
  pen.restore();
}

function speedLimit(pen: Pen, ink: Ink, speed: number): void {
  pen.fillStyle = ink("sign-red");
  pen.fillRect(0, 0, CELL, CELL);
  pen.fillStyle = ink("sign-yellow");
  pen.beginPath();
  pen.arc(CELL / 2, CELL / 2, CELL * 0.37, 0, Math.PI * 2);
  pen.fill();
  pen.fillStyle = ink("sign-black");
  lettering(pen, String(speed), CELL / 2, CELL / 2 + 3, 58, CELL * 0.6);
}

/** A triangle's painted field, its point up or down. */
function triangleField(pen: Pen, ink: Ink, pointUp: boolean): void {
  pen.fillStyle = ink("sign-red");
  pen.fillRect(0, 0, CELL, CELL);
  const top = pointUp ? 26 : 102;
  const base = pointUp ? 111 : 17;
  pen.fillStyle = ink("sign-yellow");
  polygon(pen, [
    [CELL / 2, top],
    [CELL - 23, base],
    [23, base],
  ]);
  pen.fill();
}

function crossroads(pen: Pen): void {
  pen.fillRect(CELL / 2 - 6, 44, 12, 60);
  pen.fillRect(CELL / 2 - 24, 68, 48, 11);
}

function sideRoad(pen: Pen, side: 1 | -1): void {
  pen.fillRect(CELL / 2 - 6, 44, 12, 60);
  pen.fillRect(CELL / 2 + (side > 0 ? 0 : -26), 66, 26, 10);
}

function bend(pen: Pen): void {
  pen.lineWidth = 11;
  pen.beginPath();
  pen.moveTo(52, 103);
  pen.bezierCurveTo(52, 80, 80, 78, 72, 48);
  pen.stroke();
}

/** A bull moose side on, in the plainest shapes that still say so. */
function moose(pen: Pen): void {
  polygon(pen, [
    [36, 70],
    [44, 60],
    [66, 58],
    [76, 60],
    [86, 52],
    [96, 56],
    [99, 63],
    [91, 66],
    [85, 72],
    [84, 82],
    [80, 104],
    [75, 104],
    [73, 84],
    [52, 86],
    [47, 104],
    [42, 104],
    [41, 84],
  ]);
  pen.fill();
  pen.lineWidth = 3;
  pen.beginPath();
  pen.moveTo(84, 54);
  pen.lineTo(76, 44);
  pen.moveTo(84, 54);
  pen.lineTo(84, 42);
  pen.moveTo(85, 53);
  pen.lineTo(93, 44);
  pen.stroke();
}

function pedestrianCrossing(pen: Pen, ink: Ink): void {
  pen.fillStyle = ink("sign-blue");
  pen.fillRect(0, 0, CELL, CELL);
  pen.fillStyle = ink("sign-white");
  polygon(pen, [
    [CELL / 2, 12],
    [CELL - 10, CELL - 16],
    [10, CELL - 16],
  ]);
  pen.fill();
  pen.fillStyle = ink("sign-black");
  pen.strokeStyle = ink("sign-black");
  pen.beginPath();
  pen.arc(66, 44, 6.5, 0, Math.PI * 2);
  pen.fill();
  pen.lineWidth = 7;
  pen.lineCap = "round";
  pen.beginPath();
  pen.moveTo(64, 55);
  pen.lineTo(60, 75);
  pen.lineTo(72, 92);
  pen.moveTo(60, 75);
  pen.lineTo(47, 92);
  pen.moveTo(63, 58);
  pen.lineTo(76, 68);
  pen.moveTo(63, 58);
  pen.lineTo(48, 68);
  pen.stroke();
  pen.lineCap = "butt";
}

function plates(pen: Pen, ink: Ink, signs: Map<string, SignRecord>): void {
  const place = (name: string, shape: Shape, sizeM: number, draw: () => void, column: number, row: number) => {
    const [x, y] = [column * CELL, row * CELL];
    pen.save();
    pen.translate(x, y);
    pen.beginPath();
    pen.rect(0, 0, CELL, CELL);
    pen.clip();
    draw();
    pen.restore();
    signs.set(name, { shape, sizeM, x: x + INSET, y: y + INSET, width: CELL - INSET * 2, height: CELL - INSET * 2 });
  };
  SPEEDS.forEach((speed, column) => {
    place(`speed-${speed}`, "circle", 0.64, () => { speedLimit(pen, ink, speed); }, column, 0);
  });
  const warning = (name: string, column: number, symbol: () => void) => {
    place(name, "triangle", 0.9, () => {
      triangleField(pen, ink, true);
      pen.fillStyle = pen.strokeStyle = ink("sign-black");
      symbol();
    }, column, 1);
  };
  warning("crossroads", 0, () => { crossroads(pen); });
  warning("side-road-left", 1, () => { sideRoad(pen, -1); });
  warning("side-road-right", 2, () => { sideRoad(pen, 1); });
  warning("bend", 3, () => { bend(pen); });
  warning("moose", 4, () => { moose(pen); });
  place("give-way", "invertedTriangle", 0.9, () => { triangleField(pen, ink, false); }, 5, 1);
  place("stop", "octagon", 0.8, () => {
    pen.fillStyle = ink("sign-white");
    pen.fillRect(0, 0, CELL, CELL);
    const [near, far] = [CELL * 0.33, CELL * 0.67];
    pen.fillStyle = ink("sign-red");
    polygon(pen, [[near, 12], [far, 12], [CELL - 12, near], [CELL - 12, far], [far, CELL - 12], [near, CELL - 12], [12, far], [12, near]]);
    pen.fill();
    pen.fillStyle = ink("sign-white");
    lettering(pen, "STOP", CELL / 2, CELL / 2 + 2, 42, CELL * 0.72);
  }, 6, 1);
  place("priority-road", "diamond", 0.64, () => {
    pen.fillStyle = ink("sign-white");
    pen.fillRect(0, 0, CELL, CELL);
    pen.fillStyle = ink("sign-yellow");
    polygon(pen, [[CELL / 2, 26], [CELL - 26, CELL / 2], [CELL / 2, CELL - 26], [26, CELL / 2]]);
    pen.fill();
  }, 7, 1);
  place("pedestrian-crossing", "square", 0.64, () => { pedestrianCrossing(pen, ink); }, 0, 2);
  place("parking", "square", 0.64, () => {
    pen.fillStyle = ink("sign-blue");
    pen.fillRect(0, 0, CELL, CELL);
    pen.fillStyle = ink("sign-white");
    lettering(pen, "P", CELL / 2, CELL / 2 + 3, 92, CELL);
  }, 1, 2);
}

function placeNames(pen: Pen, ink: Ink, signs: Map<string, SignRecord>): void {
  const top = PLATE_ROWS * CELL;
  PLACES.forEach((name, at) => {
    const x = (at % NAME_COLUMNS) * NAME_WIDE;
    const y = top + Math.floor(at / NAME_COLUMNS) * NAME_TALL;
    pen.fillStyle = ink("sign-white");
    pen.fillRect(x, y, NAME_WIDE, NAME_TALL);
    pen.fillStyle = ink("sign-blue");
    pen.fillRect(x + 8, y + 8, NAME_WIDE - 16, NAME_TALL - 16);
    pen.fillStyle = ink("sign-white");
    polygon(pen, [
      [x + NAME_WIDE - 62, y + 22],
      [x + NAME_WIDE - 36, y + NAME_TALL / 2],
      [x + NAME_WIDE - 62, y + NAME_TALL - 22],
    ]);
    pen.fill();
    lettering(pen, name, x + (NAME_WIDE - 56) / 2, y + NAME_TALL / 2 + 2, 42, NAME_WIDE - 96);
    signs.set(`to-${name}`, { shape: "name", sizeM: 1.8, x: x + INSET, y: y + INSET, width: NAME_WIDE - INSET * 2, height: NAME_TALL - INSET * 2 });
  });
}

function shopWords(pen: Pen, ink: Ink, top: number): void {
  pen.fillStyle = ink("sign-black");
  pen.fillRect(0, top, WORD_COLUMNS * WORD_WIDE, WORD_ROWS * WORD_TALL);
  pen.fillStyle = ink("sign-white");
  SHOP_WORDS.forEach((word, at) => {
    const x = (at % WORD_COLUMNS) * WORD_WIDE;
    const y = top + Math.floor(at / WORD_COLUMNS) * WORD_TALL;
    lettering(pen, word, x + WORD_WIDE / 2, y + WORD_TALL / 2 + 1, WORD_TALL - 10, WORD_WIDE - 28);
  });
}

/** Draws the sheet. `ink` gives a token's colour as CSS. */
export function createSignSheet(ink: Ink): SignSheet {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SHEET_PIXELS;
  const pen = canvas.getContext("2d");
  if (!pen) throw new Error("no 2D canvas for the sign sheet");
  const signs = new Map<string, SignRecord>();
  plates(pen, ink, signs);
  placeNames(pen, ink, signs);
  const wordsTop = PLATE_ROWS * CELL + NAME_ROWS * NAME_TALL;
  shopWords(pen, ink, wordsTop);

  const sheet = new CanvasTexture(canvas);
  sheet.colorSpace = SRGBColorSpace;
  sheet.flipY = false;
  sheet.generateMipmaps = true;
  sheet.minFilter = LinearMipmapLinearFilter;
  sheet.magFilter = LinearFilter;
  sheet.anisotropy = 8;
  return {
    texture: sheet,
    signs,
    words: { u: 0, v: wordsTop / SHEET_PIXELS, width: WORD_WIDE / SHEET_PIXELS, height: WORD_TALL / SHEET_PIXELS },
  };
}

/** A shape's outline, as shares of its plate from the centre, x right and y up. */
function outline(shape: Shape): [number, number][] {
  const ring = (count: number, turn: number, radius: number) => Array.from({ length: count }, (_, at): [number, number] => {
    const angle = turn + (at / count) * Math.PI * 2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  const edge = 0.5 / Math.cos(Math.PI / 8);
  // Triangles sit on the cell's own lines, which `triangleField` paints to.
  if (shape === "triangle") return [[0, 0.5], [-0.5, -0.42], [0.5, -0.42]];
  if (shape === "invertedTriangle") return [[0, -0.5], [0.5, 0.42], [-0.5, 0.42]];
  if (shape === "circle") return ring(CIRCLE_SIDES, 0, 0.5);
  if (shape === "octagon") return ring(8, Math.PI / 8, edge);
  if (shape === "diamond") return ring(4, Math.PI / 2, 0.5);
  return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
}

/** A plate as a flat mesh facing +z with its middle at the origin, ready to stand on a post. */
export function signPlate({ signs }: SignSheet, name: string): BufferGeometry {
  const sign = signs.get(name);
  if (!sign) throw new Error(`no sign called ${name}`);
  const tall = (sign.sizeM * sign.height) / sign.width;
  const corners = outline(sign.shape);
  const positions = new Float32Array(corners.length * 3);
  const normals = new Float32Array(corners.length * 3);
  const uvs = new Float32Array(corners.length * 2);
  corners.forEach(([x, y], at) => {
    positions.set([x * sign.sizeM, y * tall, 0], at * 3);
    normals.set([0, 0, 1], at * 3);
    uvs.set([(sign.x + (x + 0.5) * sign.width) / SHEET_PIXELS, (sign.y + (0.5 - y) * sign.height) / SHEET_PIXELS], at * 2);
  });
  const indices: number[] = [];
  for (let at = 1; at < corners.length - 1; at++) indices.push(0, at, at + 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export interface SignLook {
  colour: (name: string) => Node<"vec3">;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
}

/** The plates' material: the sheet on the front, bare metal behind, lit as the walls are. */
export function signMaterial({ texture: sheet }: SignSheet, { colour, hazed }: SignLook, sun: Sun): MeshBasicNodeMaterial {
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
  const facing = select(frontFacing, normalWorld, normalWorld.negate());
  const light = float(AMBIENT).add(facing.dot(toSun).max(0).mul(SUN_SHARE));
  const material = new MeshBasicNodeMaterial();
  material.colorNode = hazed(select(frontFacing, vec3(texture(sheet, uv()).rgb), colour("sign-back")).mul(light));
  material.side = DoubleSide;
  return material;
}
