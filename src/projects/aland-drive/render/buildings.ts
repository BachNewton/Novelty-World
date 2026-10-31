import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicNodeMaterial, Vector3, type Node } from "three/webgpu";
import { abs, attribute, cameraPosition, cross, dFdx, dFdy, float, floor, fract, fwidth, int, max, min, mix, normalize, positionWorld, round, select, smoothstep, uniform, uniformArray, vec3 } from "three/tsl";
import type { SolidsCell } from "./solids";

/*
 * Buildings, a mesh per 600 m cell. Their walls have no art of their own: boards,
 * windows, a door and white trim are all drawn here, laid out from each facade's
 * real width and eaves, so they fit whatever size the wall is, and fade to the
 * wall's own colour before they could shimmer.
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
/** A pixel this many metres across along a wall: boards and then windows have gone, and it's the wall's own colour. */
const BOARDS_GONE = [0.03, 0.09] as const;
const WINDOWS_GONE = [0.16, 0.45] as const;

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

  const pixel = fwidth(along).add(fwidth(up));
  const windowsShow = float(1).sub(smoothstep(float(WINDOWS_GONE[0]), float(WINDOWS_GONE[1]), pixel));
  const boardsShow = float(1).sub(smoothstep(float(BOARDS_GONE[0]), float(BOARDS_GONE[1]), pixel));
  /** 1 inside a box round a centre, with an edge a pixel soft. */
  const inside = (x: Node<"float">, halfX: Node<"float">, y: Node<"float">, halfY: Node<"float">) => {
    const soft = pixel.mul(0.5).max(0.002);
    const edgeX = float(1).sub(smoothstep(soft.negate(), soft, abs(x).sub(halfX)));
    return edgeX.mul(float(1).sub(smoothstep(soft.negate(), soft, abs(y).sub(halfY))));
  };

  const storeys = max(float(1), round(eaves.div(STOREY_M)));
  const storey = eaves.div(storeys);
  const bays = max(float(1), round(width.div(BAY_M)));
  const bay = width.div(bays);
  const inBay = fract(along.div(bay)).sub(0.5).mul(bay);
  const inStorey = fract(up.div(storey)).sub(0.5).mul(storey).sub(WINDOW.lift);
  const isOnFacade = up.lessThan(eaves.sub(0.15)).and(width.greaterThan(NARROWEST_WITH_WINDOWS_M));
  const pane = inside(inBay, float(WINDOW.halfWide), inStorey, float(WINDOW.halfTall));
  const frame = inside(inBay, float(WINDOW.halfWide + WINDOW.frame), inStorey, float(WINDOW.halfTall + WINDOW.frame));

  const fromCentre = along.sub(width.mul(0.5));
  const gable = up.greaterThan(eaves.add(0.15)).and(width.greaterThan(4));
  const gableUp = up.sub(eaves).sub(1);
  const gablePane = inside(fromCentre, float(0.4), gableUp, float(0.5));
  const gableFrame = inside(fromCentre, float(0.49), gableUp, float(0.59));

  // In the facade's middle bay, whichever that is: an even count's middle is on a boundary, so it's offset by half a bay.
  const middleBay = floor(bays.mul(0.5)).add(0.5).mul(bay);
  const hasDoor = smoothstep(float(0.4), float(0.6), tint.g);
  const doorHere = inside(along.sub(middleBay), float(DOOR.halfWide), up.sub(DOOR.tall / 2), float(DOOR.tall / 2)).mul(hasDoor);
  const doorFrame = inside(along.sub(middleBay), float(DOOR.halfWide + 0.1), up.sub(DOOR.tall / 2), float(DOOR.tall / 2 + 0.1)).mul(hasDoor);

  const palette = uniformArray(WALL_COLOURS.map(linear));
  const base = (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(mix(float(0.9), float(1.1), tint.b));
  const boardLine = smoothstep(float(0.72), float(0.92), fract(up.div(BOARD_M))).mul(boardsShow);
  const plankLine = smoothstep(float(0.8), float(0.95), fract(along.div(PLANK_M))).mul(boardsShow);
  const timber = base.mul(float(1).sub(boardLine.mul(0.32)));
  const planks = base.mul(float(1).sub(plankLine.mul(0.4)));
  const plain = select(isStyle("boards"), planks, select(isStyle("timber"), timber, base));

  const trim = colour("wall-trim");
  const corner = float(1).sub(smoothstep(float(CORNER_BOARD_M), float(CORNER_BOARD_M).add(pixel), min(along, width.sub(along)))).mul(select(isStyle("timber"), float(1), float(0)));
  const fascia = float(1).sub(smoothstep(float(TRIM_M), float(TRIM_M).add(pixel), abs(up.sub(eaves)))).mul(select(isStyle("boards"), float(0), float(1)));
  const trimmed = mix(plain, trim, max(corner, fascia).mul(windowsShow));

  const hasWindows = select(isStyle("boards"), float(0), float(1));
  const skyInGlass = mix(colour("wall-glass"), colour("sky"), inStorey.div(WINDOW.halfTall * 2).add(0.5).clamp(0, 1).mul(0.45));
  const framed = max(select(isOnFacade, frame, float(0)), select(gable, gableFrame, float(0))).mul(hasWindows);
  const glazed = max(select(isOnFacade, pane, float(0)), select(gable, gablePane, float(0))).mul(hasWindows);
  const withWindows = mix(mix(trimmed, trim, framed.mul(windowsShow)), skyInGlass, glazed.mul(windowsShow));
  const withDoor = mix(mix(withWindows, trim, doorFrame.mul(windowsShow)), colour("wall-door"), doorHere.mul(windowsShow));
  // Far off, the glass still darkens the wall a little, so it doesn't brighten as the windows fade.
  const faded = mix(withDoor.mul(mix(float(0.86), float(1), windowsShow)), colour("wall-plinth"), float(1).sub(smoothstep(float(PLINTH_M), float(PLINTH_M).add(pixel), up)));

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
