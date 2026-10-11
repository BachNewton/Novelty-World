import * as THREE from "three";
import { paletteHex, type PaletteKey } from "../palette";
import { WINDOW_WIDTH } from "../room";
import { box, flat, group, lightMaterial, pixelPlane } from "../shapes";
import { shiny, SHINES } from "../shine";
import { pixelTexture, svgTexture, TEXELS_PER_METRE } from "../textures";
import { picture, pictureRows, type Picture, type PictureName } from "./pictures";

export interface RugOptions {
  /** Along x, in metres. */
  width?: number;
  /** Along z, in metres. */
  length?: number;
  field?: PaletteKey;
  border?: PaletteKey;
  motif?: PaletteKey;
  fringe?: PaletteKey;
}

function rugSvg(w: number, h: number, c: Required<Omit<RugOptions, "width" | "length">>): string {
  const field = paletteHex(c.field);
  const border = paletteHex(c.border);
  const motif = paletteHex(c.motif);
  const fringe = paletteHex(c.fringe);
  const cx = w / 2;
  const cy = h / 2;
  const fringeLen = 3;
  const band = Math.round(Math.min(w, h) * 0.12);
  const top = fringeLen;
  const bottom = h - fringeLen;
  const inner = { x: band, y: top + band, w: w - band * 2, h: bottom - top - band * 2 };
  const diamonds: string[] = [];
  for (let x = band; x < w - band; x += 6) {
    diamonds.push(
      `<path d="M${x} ${top + band / 2} l3 -2 l3 2 l-3 2z" fill="${motif}"/>`,
      `<path d="M${x} ${bottom - band / 2} l3 -2 l3 2 l-3 2z" fill="${motif}"/>`,
    );
  }
  for (let y = top + band; y < bottom - band; y += 6) {
    diamonds.push(
      `<path d="M${band / 2} ${y} l2 3 l-2 3 l-2 -3z" fill="${motif}"/>`,
      `<path d="M${w - band / 2} ${y} l2 3 l-2 3 l-2 -3z" fill="${motif}"/>`,
    );
  }
  const fringes: string[] = [];
  for (let x = 1; x < w; x += 2) {
    fringes.push(`<rect x="${x}" y="0" width="1" height="${fringeLen}" fill="${fringe}"/>`);
    fringes.push(`<rect x="${x}" y="${bottom}" width="1" height="${fringeLen}" fill="${fringe}"/>`);
  }
  const rx = inner.w * 0.32;
  const ry = inner.h * 0.3;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">
<rect x="0" y="${top}" width="${w}" height="${bottom - top}" fill="${border}"/>
<rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}" fill="${field}"/>
<rect x="${inner.x + 2}" y="${inner.y + 2}" width="${inner.w - 4}" height="${inner.h - 4}" fill="none" stroke="${motif}" stroke-width="1"/>
<path d="M${cx} ${cy - ry} L${cx + rx} ${cy} L${cx} ${cy + ry} L${cx - rx} ${cy}Z" fill="${border}"/>
<path d="M${cx} ${cy - ry + 4} L${cx + rx - 5} ${cy} L${cx} ${cy + ry - 4} L${cx - rx + 5} ${cy}Z" fill="${field}"/>
<path d="M${cx} ${cy - ry * 0.45} L${cx + rx * 0.4} ${cy} L${cx} ${cy + ry * 0.45} L${cx - rx * 0.4} ${cy}Z" fill="${motif}"/>
<circle cx="${cx}" cy="${cy}" r="${Math.max(1.5, rx * 0.12)}" fill="${border}"/>
${[inner.x, inner.x + inner.w].flatMap((x) => [inner.y, inner.y + inner.h].map((y) => `<circle cx="${x}" cy="${y}" r="${band * 0.9}" fill="${motif}"/><circle cx="${x}" cy="${y}" r="${band * 0.5}" fill="${border}"/>`)).join("")}
${diamonds.join("")}
${fringes.join("")}
</svg>`;
}

/** A patterned rug lying on the floor, drawn as an SVG decal. */
export function rug({
  width = 2.5,
  length = 3.5,
  field = "blood",
  border = "bloodDark",
  motif = "amber",
  fringe = "bone",
}: RugOptions = {}): THREE.Mesh {
  const w = Math.round(width * TEXELS_PER_METRE);
  const h = Math.round(length * TEXELS_PER_METRE);
  const texture = svgTexture(rugSvg(w, h, { field, border, motif, fringe }), w, h);
  const geometry = new THREE.PlaneGeometry(width, length);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0.006, 0);
  const material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

export interface FrameOptions {
  /** The picture: one from the library by name (`pictures.ts`), or a room's own. */
  picture: PictureName | Picture;
  /** The moulding's colour: brass is gilt, and takes highlights. */
  frame?: PaletteKey;
  /** Width of the moulding in metres. */
  border?: number;
}

/** How far an oval moulding reaches in over its picture, hiding the pixel steps of the oval's edge. */
const OVAL_LAP = 0.75 / TEXELS_PER_METRE;

/** An oval moulding round a picture `width` by `height`, its bottom at y = 0 and its back at z = 0. */
function ovalMoulding(width: number, height: number, border: number, material: THREE.Material): THREE.Mesh {
  const rx = width / 2 - OVAL_LAP;
  const ry = height / 2 - OVAL_LAP;
  const shape = new THREE.Shape().absellipse(0, 0, rx + border, ry + border, 0, Math.PI * 2, false, 0);
  shape.holes.push(new THREE.Path().absellipse(0, 0, rx, ry, 0, Math.PI * 2, true, 0));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false, curveSegments: 28 });
  geometry.translate(0, ry + border, 0);
  return new THREE.Mesh(geometry, material);
}

/** A framed picture to hang on a wall (place it with `onWall`; `y` is its bottom edge, about 1.3). Its back is at z = 0. */
export function pictureFrame({ picture: chosen, frame = "brass", border = 0.07 }: FrameOptions): THREE.Group {
  const art = typeof chosen === "string" ? picture(chosen) : chosen;
  const oval = art.shape === "oval";
  const plane = pixelPlane(pixelTexture(pictureRows(art), art.legend), { alpha: oval });
  const geometry = plane.geometry as THREE.PlaneGeometry;
  const { width, height } = geometry.parameters;
  const moulding = frame === "brass" ? shiny(flat(frame), SHINES.gilt) : flat(frame);
  let built: THREE.Group;
  if (oval) {
    const ring = ovalMoulding(width, height, border, moulding);
    plane.position.set(0, height / 2 + border - OVAL_LAP, 0.035);
    built = group(plane, ring);
  } else {
    plane.position.set(0, height / 2 + border, 0.035);
    const w = width + border * 2;
    const h = height + border * 2;
    built = group(
      plane,
      box([w, border, 0.05], moulding, [0, 0, 0.025]),
      box([w, border, 0.05], moulding, [0, h - border, 0.025]),
      // The sides stand between the top and bottom, so no two strips share a face's plane where they meet.
      box([border, h - border * 2, 0.05], moulding, [-w / 2 + border / 2, border, 0.025]),
      box([border, h - border * 2, 0.05], moulding, [w / 2 - border / 2, border, 0.025]),
      box([width, height, 0.02], flat("soot"), [0, border, 0.01]),
    );
  }
  built.userData.picture = art.name;
  return built;
}

export interface WindowPoolOptions {
  /** How far the pool reaches into the room, in metres. */
  reach?: number;
  /** The glass's colour, or a colour for each pane in turn (stained glass). */
  glass?: PaletteKey | readonly PaletteKey[];
  lead?: PaletteKey;
  /** How many panes across and how many deep the leading divides it into. */
  panes?: [across: number, deep: number];
  opacity?: number;
}

/** The pool of light a window lays on the floor in front of it, its leading
 *  drawn as a lattice. Stylised: it falls straight out of the window, not
 *  along the house's moon, so it is right however the tile is turned. Place
 *  it at the window's wall face (its origin), with `onWall`; it lies on the floor, reaching out along +z. */
export function windowPool({ reach = 1.4, glass = "moonDark", lead = "void", panes = [2, 3], opacity = 0.9 }: WindowPoolOptions = {}): THREE.Mesh {
  const near = WINDOW_WIDTH / 2 + 0.05;
  const far = WINDOW_WIDTH / 2 + 0.3;
  const w = Math.round(far * 2 * TEXELS_PER_METRE);
  const h = Math.round(reach * TEXELS_PER_METRE);
  const [across, deep] = panes;
  const colours = typeof glass === "string" ? [glass] : glass;
  const fills: string[] = [];
  for (let row = 0; row < deep; row++) {
    for (let column = 0; column < across; column++) {
      const x = Math.round((w * column) / across);
      const y = Math.round((h * row) / deep);
      const colour = colours[(column + row * (across + 1)) % colours.length];
      fills.push(`<rect x="${x}" y="${y}" width="${Math.round((w * (column + 1)) / across) - x}" height="${Math.round((h * (row + 1)) / deep) - y}" fill="${paletteHex(colour)}"/>`);
    }
  }
  const leads = [
    ...Array.from({ length: across - 1 }, (_, i) => `<rect x="${Math.round((w * (i + 1)) / across) - 1}" width="2" height="${h}" fill="${paletteHex(lead)}"/>`),
    ...Array.from({ length: deep - 1 }, (_, i) => `<rect y="${Math.round((h * (i + 1)) / deep)}" width="${w}" height="2" fill="${paletteHex(lead)}"/>`),
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">
${fills.join("")}
${leads.join("")}
</svg>`;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-near, 0.02, 0, near, 0.02, 0, far, 0.02, reach, -far, 0.02, reach], 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([(far - near) / (far * 2), 0, (far + near) / (far * 2), 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const pool = new THREE.Mesh(geometry, lightMaterial(opacity, { map: svgTexture(svg, w, h) }));
  pool.userData.noShadow = true;
  return pool;
}
