// The integration, as the exact replacements it takes, applied in memory by the gallery so its pictures are what the
// game will show. `real` is what goes into the game; `gallery` only lets the gallery swap the art in and out to measure it.
// A replacement that no longer matches throws: the game moved, and this list needs updating.

const GAME = {
  real: [
    [
      `import { TileLayers } from "./tile-layers";`,
      `import { TileLayers } from "./tile-layers";\nimport { createSignSheet, detailTexture, dressRoad, groundDetail, junctionMarks, roadAttributes } from "../art/surfaces";`,
    ],
    [`const grainTexture = grainNoise();`, `const grainTexture = grainNoise();\n  const detail = detailTexture(manifest.sun);\n  const signSheet = createSignSheet((name) => token(name).getStyle());`],
    [`buildingMaterial({ colour: colorOf, linear, hazed }, manifest.sun)`, `buildingMaterial({ colour: colorOf, linear, hazed }, manifest.sun, { detail, sheet: signSheet })`],
    [
      `const groundColor = photo.rgb.pow(vec3(2.2)).mul(mix(float(1), grain, grainShare));`,
      `const plainGround = photo.rgb.pow(vec3(2.2)).mul(mix(float(1), grain, grainShare));
  const roadNearby = texture(layers.mask, imageUv).depth(farLayer).grad(gradientX.mul(8), gradientY.mul(8));
  const groundColor = groundDetail({ place: positionWorld.xz, toCamera, photo: photo.rgb.pow(vec3(2.2)), roadNearby: roadNearby.g.add(roadNearby.b), litterColour: colorOf("surface-litter"), detail });`,
    ],
    [
      `const across = attribute<"float">("across", "float").abs();`,
      `const across = attribute<"float">("across", "float").abs();
  const roadInfo = attribute<"vec4">("roadInfo", "vec4");
  const roadMark = attribute<"vec2">("roadMark", "vec2");`,
    ],
    [
      `const painted = mix(surfaceColor, colorOf("road-paint"), edgeLine.add(centreLine).min(1).mul(isMain));`,
      `const dressed = dressRoad({ place: positionWorld.xz, toCamera, across, signedAcross: attribute<"float">("across", "float"), along, paved: roadInfo.x, town: roadInfo.y, halfWidth: roadInfo.z, shoulderM: roadMark.x, ground: groundColor, colour: colorOf, detail });
  const marks = junctionMarks({ across: attribute<"float">("across", "float"), halfWidth: roadInfo.z, toMark: roadInfo.w, mark: roadMark.y }).mul(roadInfo.x);
  const painted = mix(dressed.carriageway, colorOf("road-paint"), edgeLine.add(centreLine).min(1).mul(isMain).add(marks).min(1).mul(dressed.paintLeft));`,
    ],
    [
      `roadMaterial.colorNode = hazed(mix(painted, shoulderColor, onShoulder).mul(light));`,
      `roadMaterial.colorNode = hazed(mix(painted, dressed.shoulder, dressed.shoulderShare).mul(light));`,
    ],
    [
      `geometry.setAttribute("tier", tier);`,
      `geometry.setAttribute("tier", tier);\n    geometry.setAttribute("roadInfo", roadInfo);\n    geometry.setAttribute("roadMark", roadMark);`,
    ],
    [
      `const tier = new BufferAttribute(ribbon.tiers, 1);`,
      `const tier = new BufferAttribute(ribbon.tiers, 1);
  const painted = roadAttributes(detail.surface, detail.manifest.solids.cells);
  const roadInfo = new BufferAttribute(painted.surface, 4);
  const roadMark = new BufferAttribute(painted.mark, 2);`,
    ],
  ],
  gallery: [
    [
      `const terrainColor = hazed(mix(pastTiles, mix(colorOf("water"), land, photo.a), farSeen));`,
      `const terrainColor = hazed(mix(pastTiles, mix(colorOf("water"), land, photo.a), farSeen));
  const plainLand = mix(mix(plainGround, colorOf("road-main"), roadEdge(mask.g)), colorOf("road-minor"), roadEdge(mask.b)).mul(light);
  const plainTerrain = hazed(mix(pastTiles, mix(colorOf("water"), plainLand, photo.a), farSeen));`,
    ],
    [
      `const roadMaterial = new MeshBasicNodeMaterial();`,
      `const plainPainted = mix(surfaceColor, colorOf("road-paint"), edgeLine.add(centreLine).min(1).mul(isMain));
  const roadMaterial = new MeshBasicNodeMaterial();
  roadMaterial.userData.plainColorNode = hazed(mix(plainPainted, mix(colorOf("road-shoulder"), plainGround, smoothstep(float(1.05), float(1.6), across)), onShoulder).mul(light));
  roadMaterial.userData.artGroup = "road";`,
    ],
    [
      `const drive = new Drive(world, startLine(manifest.start.chain).at(START_ALONG_M));`,
      `const drive = new Drive(world, startLine(manifest.start.chain).at(START_ALONG_M));
  (window as unknown as { __surfacesHook: unknown }).__surfacesHook = { scene, world, manifest, signSheet, wallMaterial, terrainColor, plainTerrain, colour: colorOf, hazed, sun: manifest.sun };`,
    ],
  ],
};

const BUILDINGS = {
  real: [
    [
      `import type { SolidsCell } from "./solids";`,
      `import type { SolidsCell } from "./solids";\nimport { roofDetail, shopfront, type SignSheet } from "../art/surfaces";`,
    ],
    [
      `export function buildingMaterial({ colour, linear, hazed }: BuildingPalette, sun: { azimuthDeg: number; elevationDeg: number }): MeshBasicNodeMaterial {`,
      `export function buildingMaterial({ colour, linear, hazed }: BuildingPalette, sun: { azimuthDeg: number; elevationDeg: number }, art: { detail: Texture; sheet: SignSheet }): MeshBasicNodeMaterial {`,
    ],
    [`Vector3, type Node } from "three/webgpu";`, `Vector3, type Node, type Texture } from "three/webgpu";`],
    [
      `const roof = vec3(tint.r, tint.g, tint.b).pow(vec3(2.2)).mul(1.15);`,
      `const photoRoof = vec3(tint.r, tint.g, tint.b).pow(vec3(2.2)).mul(1.15);
  const roof = roofDetail({ base: photoRoof, position: positionWorld, normal, toSun, moss: colour("surface-roof-moss"), detail: art.detail });
  const shopped = shopfront({ along, up, width, eaves, fromDoor: along.sub(middleBay), candidate: select(isStyle("plaster"), hasDoor, float(0)), pixel, wall: faded, colour, sky: colour("sky"), sheet: art.sheet });`,
    ],
    [
      `material.colorNode = hazed(select(isStyle("roof"), roof, faded.mul(nearGround)).mul(lit));`,
      `material.colorNode = hazed(select(isStyle("roof"), roof, shopped.mul(nearGround)).mul(lit));`,
    ],
  ],
  gallery: [
    [
      `material.side = 2;`,
      `material.side = 2;
  material.userData.plainColorNode = hazed(select(isStyle("roof"), photoRoof, faded.mul(nearGround)).mul(lit));
  material.userData.artGroup = "walls";`,
    ],
  ],
};

const FILES = { game: GAME, buildings: BUILDINGS };

export function patchSource(source, file) {
  let patched = source;
  const { real, gallery } = FILES[file];
  for (const [find, replace] of [...real, ...gallery]) {
    if (!patched.includes(find)) throw new Error(`the integration's ${file} no longer matches: ${find}`);
    patched = patched.replace(find, () => replace);
  }
  return patched;
}
