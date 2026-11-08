import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicNodeMaterial, NotEqualDepth, Vector3, type Node, type Texture } from "three/webgpu";
import { abs, attribute, dFdx, float, floor, Fn, fract, fwidth, If, int, max, mix, positionWorld, round, select, smoothstep, step, uniformArray, vec3 } from "three/tsl";
import type { SolidsCell } from "./solids";
import { flatNormal } from "../art/flat-normal";
import { band, pulses, roofDetail, shopfront, type SignSheet } from "../art/surfaces";
import { addOnPosition, standAsBuilt } from "../art/facades/add-ons";
import { facadeArt, WallLight, wallParts } from "../art/facades/facade";
import { farWindowLight, windowLight, type Night } from "../art/night";
import { PAINT_STYLE } from "../art/landmarks/kit";
import IDS from "../art/facades/facade-ids.json";
import { towardsSun, type Sun } from "../art/sun";
import { seedOf, unitOf } from "../art/hash";
import { snowfall, snowOnTop } from "../art/surfaces/snow";
import { eavesLights, type WinterWall } from "../art/night/festive";
import { seasonNodes, type SeasonLook, type SeasonNodes } from "../art/season";

/*
 * Buildings, a mesh per 600 m cell. Their walls have no art of their own: boards,
 * windows, doors, trim and shops are all drawn in the shader, laid out from each
 * facade's real width and eaves, so they fit whatever size the wall is, and blur
 * into the wall's average far off rather than fading, so they neither shimmer nor
 * pop. The pipeline's tint says which look a wall has: one of the three plain
 * styles here, or one of `art/facades`, with a shop from `art/surfaces`. At night
 * their rooms light (`art/night/windows.ts`), added after the haze and the hour's
 * light, which would dim them.
 */

/** Styles and palette as the pipeline numbers them. Styles from the villa on are `art/facades`. */
const STYLE = { roof: 0, timber: 1, plaster: 2, boards: 3 } as const;
const FACADE_STYLES_FROM = IDS.styles.villa;
const FRONT_PLATE = IDS.fronts.plate;
const WALL_COLOURS = ["wall-red", "wall-white", "wall-yellow", "wall-cream", "wall-grey", "wall-pale"];

/** Each roof's snow threshold lies in this range: a heated house sheds it sooner than a barn, which keeps it with the ground. */
const ROOF_SNOW = [0.12, 0.85] as const;
const ROOF_SNOW_SALT = 4409;

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

interface WallInput {
  along: Node<"float">;
  up: Node<"float">;
  width: Node<"float">;
  eaves: Node<"float">;
  tint: Node<"vec4">;
  wide: Node<"float">;
  tall: Node<"float">;
  colour: (name: string) => Node<"vec3">;
  linear: (name: string) => Vector3;
  night: Night;
  season: SeasonNodes;
}

/** How likely the plain timber and plaster looks are to dress their windows and string their eaves at Christmas: boards have no windows, and are sheds. */
const WINTER = { timber: { windows: 0.8, eaves: 0.75 }, plaster: { windows: 0.6, eaves: 0.35 } } as const;

/** The pipeline's own three styles: timber, plaster and boards, with what their lit windows add. */
function plainWall({ along, up, width, eaves, tint, wide, tall, colour, linear, night, season }: WallInput) {
  const style = round(tint.a.mul(255));
  const isStyle = (name: keyof typeof STYLE) => abs(style.sub(STYLE[name])).lessThan(0.5);
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
  const building = round(tint.b.mul(255)).add(round(tint.r.mul(255)).mul(256));
  const windowsShow = float(1).sub(smoothstep(float(WINDOW.halfTall * 0.2), float(WINDOW.halfTall * 0.6), tall));
  const paneId = floor(along.div(bay)).add(floor(up.div(storey)).mul(37));
  const timberly = select(isStyle("timber"), float(1), float(0));
  const winter: WinterWall = {
    season,
    windows: mix(float(WINTER.plaster.windows), float(WINTER.timber.windows), timberly).mul(hasWindows),
    eaves: mix(float(WINTER.plaster.eaves), float(WINTER.timber.eaves), timberly).mul(hasWindows),
  };
  const inPane = { x: fract(along.div(bay)).sub(0.5).mul(bay), y: inStorey.add(WINDOW.halfTall), height: float(WINDOW.halfTall * 2), wide, tall };
  const rooms = windowLight(night, { id: paneId, building, up: inStorey.div(WINDOW.halfTall * 2).add(0.5), shown: windowsShow, winter: { wall: winter, frame: inPane } }).mul(pane.mul(onFacade).mul(hasWindows));
  const string = eavesLights(night, winter, { along, up, width, eaves, wide, tall, building, front: hasDoor });
  const glow = rooms.add(farWindowLight(night, building, windowsShow, winter).mul(hasWindows)).add(string);
  return WallLight(mix(withDoor, colour("wall-plinth"), band(up, -100, PLINTH_M, tall)), glow);
}

export function buildingMaterial({ colour, linear, hazed }: BuildingPalette, sun: Sun, art: { detail: Texture; sheet: SignSheet; night: Night; season?: SeasonLook; addOnReachM?: number; depthFirst?: boolean }): MeshBasicNodeMaterial {
  const { night } = art;
  const season = seasonNodes(art.season);
  const toSun = towardsSun(sun);

  const facade = attribute<"vec4">("facade", "vec4");
  const tint = attribute<"vec4">("tint", "vec4");
  const along = facade.x;
  const up = facade.y;
  const width = facade.z;
  const eaves = facade.w;
  const style = round(tint.a.mul(255));

  const normal = flatNormal();
  const lit = float(AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const photoRoof = vec3(tint.r, tint.g, tint.b).pow(vec3(2.2)).mul(1.15);
  // A roof's tint is its own photo's median, the same on all its faces, so its whole numbers seed the building's own snow.
  const roofSeed = seedOf(round(tint.r.mul(255)), round(tint.g.mul(255)), round(tint.b.mul(255)));
  const roof = snowOnTop(
    roofDetail({ base: photoRoof, across: facade.x, upSlope: facade.y, position: positionWorld, normal, toSun, moss: colour("surface-roof-moss"), detail: art.detail }),
    snowfall(art.season, colour),
    abs(normal.y),
    mix(float(ROOF_SNOW[0]), float(ROOF_SNOW[1]), unitOf(roofSeed, ROOF_SNOW_SALT)),
  );

  // Every shape on a wall is its share of the pixel (`art/surfaces/coverage.ts`), so far off it blurs into the wall's
  // average rather than fading out: only lines too fine to draw fade, and they fade to their own average. A wall pays
  // only for its own style, so the derivatives that measure the pixel are read before the styles branch. The wall's
  // colour and its glow are both read in here, once: TSL inlines a function's whole body at each place its result is
  // read, so reading them apart wrote the biggest shader the game has into it twice.
  const shaded = Fn(() => {
    const wide = fwidth(along).toVar();
    const tall = fwidth(up).toVar();
    const reads = select(dFdx(along).lessThan(0), float(-1), float(1)).toVar();
    const drawn = vec3(0).toVar();
    const glow = vec3(0).toVar();
    // A model's own paint is drawn after this, as it is: no wall of its own.
    If(style.greaterThan(PAINT_STYLE - 0.5), () => undefined).ElseIf(style.greaterThan(FACADE_STYLES_FROM - 0.5), () => {
      const red = round(tint.r.mul(255));
      const green = round(tint.g.mul(255));
      const front = floor(red.div(32));
      const door = step(127.5, green);
      const shown = select(front.greaterThan(FRONT_PLATE - 0.5), front, front.mul(door));
      const { colour: wall, glow: lights } = wallParts(facadeArt({ along, up, width, eaves, tint, wide, tall, colour, linear, night, season }));
      glow.assign(lights);
      drawn.assign(shopfront({ along, up, width, eaves, fromDoor: along.sub(width.mul(0.5)), front: shown, word: green.mod(128), wide, tall, reads, wall, colour, sky: colour("sky"), sheet: art.sheet }));
    }).ElseIf(style.greaterThan(0.5), () => {
      const plain = wallParts(plainWall({ along, up, width, eaves, tint, wide, tall, colour, linear, night, season }));
      drawn.assign(plain.colour);
      glow.assign(plain.glow);
    });
    const nearGround = mix(float(0.78), float(1), smoothstep(float(0), float(1.8), up));
    const painted = style.greaterThan(PAINT_STYLE - 0.5);
    return hazed(select(style.lessThan(0.5), roof, select(painted, photoRoof, drawn.mul(nearGround))).mul(lit)).add(glow);
  })();

  const material = new MeshBasicNodeMaterial();
  material.name = "walls";
  material.colorNode = shaded;
  material.positionNode = addOnPosition(art.addOnReachM);
  material.side = 2;
  // The wall shader is the biggest the game has, and a town's walls stand two and three deep from any street. So in the
  // game every mesh it draws is drawn first through `wallDepthMaterial`, which writes only depth, and this material then
  // shades only the pixels whose depth is its own: each wall pixel seen is shaded once, whatever stands behind it. A
  // gallery draws its few walls the plain way.
  if (art.depthFirst === true) {
    material.depthWrite = false;
    // Under a reversed depth buffer three turns every depth function round (`ReversedDepthFuncs`), Equal to NotEqual
    // among them, so NotEqual here is what reaches the GPU as equal: the test this material needs.
    material.depthFunc = NotEqualDepth;
  }
  return material;
}

/** What the walls' depth is written with, ahead of their colour: the same vertices, no colour, nothing else. */
export function wallDepthMaterial(addOnReachM?: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.name = "walls-depth";
  material.positionNode = addOnPosition(addOnReachM);
  material.side = 2;
  material.colorWrite = false;
  return material;
}

/** A mesh's depth twin: the same geometry, drawn first through the walls' depth material, culled with it. */
export function depthTwin(mesh: Mesh, depth: MeshBasicNodeMaterial): Mesh {
  const twin = new Mesh(mesh.geometry, depth);
  twin.frustumCulled = mesh.frustumCulled;
  twin.visible = mesh.visible;
  return twin;
}

/** One tile's cells as meshes, each shown or not on its own, and, given the walls' depth material, each one's depth twin in a group of their own. */
export function buildingMeshes(cells: SolidsCell[], material: MeshBasicNodeMaterial, depth?: MeshBasicNodeMaterial) {
  const group = new Group();
  const depthGroup = new Group();
  const shown = cells.map(({ x, z, positions, facades, tints, indices }) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("facade", new BufferAttribute(facades, 4));
    geometry.setAttribute("tint", new BufferAttribute(tints, 4, true));
    geometry.setIndex(new BufferAttribute(indices, 1));
    standAsBuilt(geometry);
    // Its own sphere, over the cell's own vertices, so three culls the cell when it's out of view.
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, material);
    mesh.visible = false;
    group.add(mesh);
    const twin = depth ? depthTwin(mesh, depth) : mesh;
    if (depth) depthGroup.add(twin);
    return { mesh, twin, x, z };
  });
  return { group, depthGroup, cells: shown };
}
