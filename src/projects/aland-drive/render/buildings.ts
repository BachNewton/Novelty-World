import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicNodeMaterial, Vector3, type Node } from "three/webgpu";
import { abs, attribute, cameraPosition, cross, dFdx, dFdy, float, floor, fract, fwidth, int, max, mix, normalize, positionWorld, round, select, smoothstep, uniform, uniformArray, vec3 } from "three/tsl";
import type { SolidsCell } from "./solids";
import { band, pulses } from "../art/surfaces";

/*
 * Buildings, a mesh per 600 m cell. Their walls have no art of their own: boards,
 * windows, a door and white trim are all drawn here, laid out from each facade's
 * real width and eaves, so they fit whatever size the wall is, and blur into the
 * wall's average far off rather than fading, so they neither shimmer nor pop.
 */

/** Styles and palette as the pipeline numbers them. */
const STYLE = { roof: 0, timber: 1, plaster: 2, boards: 3 } as const;
const WALL_COLOURS = ["wall-red", "wall-white", "wall-yellow", "wall-cream", "wall-grey", "wall-pale"];

const AMBIENT = 0.68;
const SUN_SHARE = 0.5;
const STOREY_M = 2.9;
const BAY_M = 3.6;
const WINDOW = { halfWide: 0.52, halfTall: 0.68, frame: 0.09, lift: 0.1 };
const DOOR = { halfWide: 0.52, tall: 2.1 };
const NARROWEST_WITH_WINDOWS_M = 1.8;
const CORNER_BOARD_M = 0.13;
const TRIM_M = 0.16;
const PLINTH_M = 0.38;
const BOARD_M = 0.15;
const PLANK_M = 0.22;
/** A pixel this many metres across along a wall: board lines are too fine to draw, and are their average. */
const BOARDS_GONE = [0.03, 0.09] as const;
/** The averages of the board and plank lines' profiles, what they blur into. */
const BOARD_LINE_SHARE = 0.18;
const PLANK_LINE_SHARE = 0.125;

export interface BuildingPalette {
  colour: (name: string) => Node<"vec3">;
  linear: (name: string) => Vector3;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
}

export function buildingMaterial({ colour, linear, hazed }: BuildingPalette, sun: { azimuthDeg: number; elevationDeg: number }): MeshBasicNodeMaterial {
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));

  const facade = attribute<"vec4">("facade", "vec4");
  const tint = attribute<"vec4">("tint", "vec4");
  const along = facade.x;
  const up = facade.y;
  const width = facade.z;
  const eaves = facade.w;
  const style = round(tint.a.mul(255));
  const isStyle = (name: keyof typeof STYLE) => abs(style.sub(STYLE[name])).lessThan(0.5);

  // Every shape below is its share of the pixel (`art/surfaces/coverage.ts`), so far off it blurs into the wall's
  // average rather than fading out: only lines too fine to draw fade, and they fade to their own average.
  const wide = fwidth(along);
  const tall = fwidth(up);
  const pixel = wide.add(tall);
  const boardsShow = float(1).sub(smoothstep(float(BOARDS_GONE[0]), float(BOARDS_GONE[1]), pixel));
  const box = (x: Node<"float">, halfX: number, y: Node<"float">, halfY: number) =>
    band(x, -halfX, halfX, wide).mul(band(y, -halfY, halfY, tall));

  const storeys = max(float(1), round(eaves.div(STOREY_M)));
  const storey = eaves.div(storeys);
  const bays = max(float(1), round(width.div(BAY_M)));
  const bay = width.div(bays);
  const inStorey = fract(up.div(storey)).sub(0.5).mul(storey).sub(WINDOW.lift);
  const rowOf = (half: number) => pulses(along.sub(bay.mul(0.5)), bay, half, wide);
  const storeyOf = (half: number) => pulses(up.sub(storey.mul(0.5)).sub(WINDOW.lift), storey, half, tall);
  const onFacade = band(up, -1, eaves.sub(0.15), tall).mul(select(width.greaterThan(NARROWEST_WITH_WINDOWS_M), float(1), float(0)));
  const pane = rowOf(WINDOW.halfWide).mul(storeyOf(WINDOW.halfTall));
  const frame = rowOf(WINDOW.halfWide + WINDOW.frame).mul(storeyOf(WINDOW.halfTall + WINDOW.frame));

  const fromCentre = along.sub(width.mul(0.5));
  const gable = band(up, eaves.add(0.15), eaves.add(100), tall).mul(select(width.greaterThan(4), float(1), float(0)));
  const gableUp = up.sub(eaves).sub(1);
  const gablePane = box(fromCentre, 0.4, gableUp, 0.5);
  const gableFrame = box(fromCentre, 0.49, gableUp, 0.59);

  // In the facade's middle bay, whichever that is: an even count's middle is on a boundary, so it's offset by half a bay.
  const middleBay = floor(bays.mul(0.5)).add(0.5).mul(bay);
  const hasDoor = smoothstep(float(0.4), float(0.6), tint.g);
  const doorHere = box(along.sub(middleBay), DOOR.halfWide, up.sub(DOOR.tall / 2), DOOR.tall / 2).mul(hasDoor);
  const doorFrame = box(along.sub(middleBay), DOOR.halfWide + 0.1, up.sub(DOOR.tall / 2), DOOR.tall / 2 + 0.1).mul(hasDoor);

  const palette = uniformArray(WALL_COLOURS.map(linear));
  const base = (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(mix(float(0.9), float(1.1), tint.b));
  const boardLine = mix(float(BOARD_LINE_SHARE), smoothstep(float(0.72), float(0.92), fract(up.div(BOARD_M))), boardsShow);
  const plankLine = mix(float(PLANK_LINE_SHARE), smoothstep(float(0.8), float(0.95), fract(along.div(PLANK_M))), boardsShow);
  const timber = base.mul(float(1).sub(boardLine.mul(0.32)));
  const planks = base.mul(float(1).sub(plankLine.mul(0.4)));
  const plain = select(isStyle("boards"), planks, select(isStyle("timber"), timber, base));

  const trim = colour("wall-trim");
  const corner = band(along, -1, CORNER_BOARD_M, wide).add(band(along, width.sub(CORNER_BOARD_M), width.add(1), wide)).min(1).mul(select(isStyle("timber"), float(1), float(0)));
  const fascia = band(up, eaves.sub(TRIM_M), eaves.add(TRIM_M), tall).mul(select(isStyle("boards"), float(0), float(1)));
  const trimmed = mix(plain, trim, max(corner, fascia));

  const hasWindows = select(isStyle("boards"), float(0), float(1));
  // Once a pane is a few pixels tall its gradient reads as its middle, or it would sparkle from pixel to pixel.
  const glassUp = mix(inStorey.div(WINDOW.halfTall * 2).add(0.5).clamp(0, 1), float(0.5), smoothstep(float(0.1), float(0.3), tall));
  const skyInGlass = mix(colour("wall-glass"), colour("sky"), glassUp.mul(0.45));
  const framed = max(frame.mul(onFacade), gableFrame.mul(gable)).mul(hasWindows);
  const glazed = max(pane.mul(onFacade), gablePane.mul(gable)).mul(hasWindows);
  const withWindows = mix(mix(trimmed, trim, framed), skyInGlass, glazed);
  const withDoor = mix(mix(withWindows, trim, doorFrame), colour("wall-door"), doorHere);
  const faded = mix(withDoor, colour("wall-plinth"), band(up, -100, PLINTH_M, tall));

  const facing = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
  const towardsCamera = cameraPosition.sub(positionWorld);
  const normal = select(facing.dot(towardsCamera).lessThan(0), facing.negate(), facing);
  const lit = float(AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const roof = vec3(tint.r, tint.g, tint.b).pow(vec3(2.2)).mul(1.15);
  const nearGround = mix(float(0.78), float(1), smoothstep(float(0), float(1.8), up));
  const material = new MeshBasicNodeMaterial();
  material.colorNode = hazed(select(isStyle("roof"), roof, faded.mul(nearGround)).mul(lit));
  material.side = 2;
  return material;
}

/** One tile's cells as meshes, each shown or not on its own. */
export function buildingMeshes(cells: SolidsCell[], material: MeshBasicNodeMaterial) {
  const group = new Group();
  const shown = cells.map(({ x, z, positions, facades, tints, indices }) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("facade", new BufferAttribute(facades, 4));
    geometry.setAttribute("tint", new BufferAttribute(tints, 4, true));
    geometry.setIndex(new BufferAttribute(indices, 1));
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, x, z };
  });
  return { group, cells: shown };
}
