// The integration, as exact replacements on top of `art/surfaces`' own, applied in memory by the gallery so its pictures
// are what the game will show. `real` is what goes into the game, but for its one tile's image; `gallery` only lets the
// gallery swap the art in and out to measure it. A replacement that no longer matches throws.

import { patchSource as patchSurfaces } from "../surfaces/integration.mjs";

const GAME = {
  real: [
    [
      `import { TileLayers } from "./tile-layers";`,
      `import { TileLayers } from "./tile-layers";\nimport { max } from "three/tsl";\nimport { RING_POINTS } from "./tile";\nimport { townGround, townRibbon, townRibbonBits } from "../art/town-ground";\nimport { sampleTownSurface, ribbonClassesFor, townLoaded } from "../art/town-ground/gallery-source";`,
    ],
    [
      `const groundColor = groundDetail({`,
      `const surfaceGround = groundDetail({`,
    ],
    [
      `litterColour: colorOf("surface-litter"), detail });`,
      `litterColour: colorOf("surface-litter"), detail });
  const townSurface = sampleTownSurface(positionWorld.xz);
  const photoSoft = texture(layers.groundNear, imageUv).depth(nearLayer).level(3).rgb.pow(vec3(2.2));
  const groundColor = townGround({ place: positionWorld.xz, toCamera, mask: townSurface.mask, angle: townSurface.angle, ground: surfaceGround, photoSoft, colour: colorOf, detail });`,
    ],
    [
      `const marks = junctionMarks(`,
      `const townRoad = townRibbon({ place: positionWorld.xz, toCamera, angle: townSurface.angle, bits: attribute<"vec3">("townBits", "vec3"), carriageway: dressed.carriageway, colour: colorOf, detail });
  const marks = junctionMarks(`,
    ],
    [
      `const painted = mix(dressed.carriageway, colorOf("road-paint"),`,
      `const painted = mix(townRoad.carriageway, colorOf("road-paint"),`,
    ],
    [
      `mix(painted, dressed.shoulder, dressed.shoulderShare).mul(light));`,
      `mix(painted, mix(dressed.shoulder, groundColor, max(townRoad.claimed, mix(float(1), smoothstep(float(0.2), float(0.24), across.sub(1).max(0).mul(roadMark.x)), roadInfo.x.mul(roadInfo.y).mul(smoothstep(float(2), float(2.6), roadInfo.z))).mul(townSurface.classed))), mix(dressed.shoulderShare, smoothstep(float(0.995), float(1.01), across), max(townRoad.claimed, townSurface.classed))).mul(light));`,
    ],
    [
      `geometry.setAttribute("roadInfo", roadInfo);`,
      `geometry.setAttribute("roadInfo", roadInfo);\n    geometry.setAttribute("townBits", townBits);`,
    ],
    [
      `const roadInfo = new BufferAttribute(painted.surface, 4);`,
      `const roadInfo = new BufferAttribute(painted.surface, 4);
  const townBits = new BufferAttribute(townRibbonBits(ribbonClassesFor(detail.manifest.tile, detail.surface.rings.length / 3 / RING_POINTS), RING_POINTS), 3);`,
    ],
  ],
  gallery: [
    [
      `const plainLand = mix(mix(plainGround, colorOf("road-main")`,
      `const plainLand = mix(mix(surfaceGround, colorOf("road-main")`,
    ],
    [
      `roadMaterial.userData.artGroup = "road";`,
      `roadMaterial.userData.artGroup = "road";
  roadMaterial.userData.plainColorNode = hazed(mix(mix(dressed.carriageway, colorOf("road-paint"), edgeLine.add(centreLine).min(1).mul(isMain).add(marks).min(1).mul(dressed.paintLeft)), dressed.shoulder, dressed.shoulderShare).mul(light));`,
    ],
    [
      `__surfacesHook: unknown }).__surfacesHook = { scene, world, manifest, signSheet, wallMaterial, terrainColor, plainTerrain, colour: colorOf, hazed, sun: manifest.sun };`,
      `__surfacesHook: unknown }).__surfacesHook = { scene, world, manifest, signSheet, wallMaterial, terrainColor, plainTerrain, colour: colorOf, hazed, sun: manifest.sun, linear };\n  void townLoaded;`,
    ],
  ],
};

export function patchTown(source) {
  let patched = patchSurfaces(source, "game");
  for (const [find, replace] of [...GAME.real, ...GAME.gallery]) {
    if (!patched.includes(find)) throw new Error(`the town ground's integration no longer matches: ${find}`);
    patched = patched.replace(find, () => replace);
  }
  return patched;
}

export { patchSurfaces };
