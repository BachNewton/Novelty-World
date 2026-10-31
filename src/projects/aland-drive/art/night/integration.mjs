// The integration, as the exact replacements it takes, applied in memory by the gallery so its pictures are what the game
// will show. `real` goes into the game; `gallery` only gives the gallery the scene. A replacement that no longer matches
// throws: the game moved, and this list needs updating.

const GAME = {
  real: [
    [
      `import { buildingMaterial, buildingMeshes } from "./buildings";`,
      `import { buildingMaterial, buildingMeshes } from "./buildings";
import { bakedLightAtHour, createHeadlights, createNight, forestAtHour, landAtHour, seaAtHour, seaInLand, skyAtHour, type Night } from "../art/night";
import { createSky, skyLooks } from "../art/sky/sky";`,
    ],
    [`import { all, attribute, dFdx,`, `import { all, attribute, cameraPosition, dFdx,`],
    [`  const hazeM = uniform(HAZE_M);`, `  const hazeM = uniform(HAZE_M);
  const night = createNight();
  const headlights = createHeadlights(night);
  const lookAtHour = skyAtHour();
  const sky = createSky({ reach: CAMERA_FAR * 0.9, look: skyLooks().summer });
  scene.add(sky.mesh, headlights.cones);`],
    [
      `const light = mix(float(1), shade.pow(float(manifest.shade.gamma)).div(FLAT_LIGHT), SHADE_SHARE);`,
      `const light = bakedLightAtHour(night, mix(float(1), shade.pow(float(manifest.shade.gamma)).div(FLAT_LIGHT), SHADE_SHARE));`,
    ],
    [
      `const hazed = (color: Node<"vec3">) => mix(color, colorOf("sky"), float(1).sub(exp(toCamera.div(hazeM).pow(2).negate())));`,
      `const hazedAtHour = (atHour: (hour: Night, color: Node<"vec3">) => Node<"vec3">) => (color: Node<"vec3">) => mix(atHour(night, color).add(headlights.poolOn(color)), sky.hazeAlong(positionWorld.sub(cameraPosition)), float(1).sub(exp(toCamera.div(hazeM).pow(2).negate())));
  const hazed = hazedAtHour(landAtHour);`,
    ],
    [
      `const terrainColor = hazed(mix(pastTiles, mix(colorOf("water"), land, photo.a), farSeen));`,
      `const terrainColor = hazed(mix(pastTiles, mix(seaInLand(night, colorOf("water")), land, photo.a), farSeen));`,
    ],
    [
      `const pastTiles = select(inOverview, mix(colorOf("water"), overviewPixel.rgb.pow(vec3(2.2)), overviewPixel.a), colorOf("water"));`,
      `const pastTiles = select(inOverview, mix(seaInLand(night, colorOf("water")), overviewPixel.rgb.pow(vec3(2.2)), overviewPixel.a), seaInLand(night, colorOf("water")));`,
    ],
    [
      `    colour: colorOf,
    hazed,
    sun: manifest.sun,
  });

  // Open water out to the sky`,
      `    colour: colorOf,
    hazed: hazedAtHour(forestAtHour),
    sun: manifest.sun,
  });

  // Open water out to the sky`,
    ],
    [`seaMaterial.colorNode = hazed(colorOf("water"));`, `seaMaterial.colorNode = hazedAtHour(seaAtHour)(colorOf("water"));`],
    [
      `const wallMaterial = buildingMaterial({ colour: colorOf, linear, hazed }, manifest.sun);`,
      `const wallMaterial = buildingMaterial({ colour: colorOf, linear, hazed }, manifest.sun, night);`,
    ],
  ],
  gallery: [
    [
      `    showRibbons(spot);
    renderer.render(scene, camera);`,
      `    showRibbons(spot);
    (window as unknown as { __nightHook?: { beforeFrame: () => void } }).__nightHook?.beforeFrame();
    renderer.render(scene, camera);`,
    ],
    [
      `const drive = new Drive(world, startLine(manifest.start.chain).at(START_ALONG_M));`,
      `const drive = new Drive(world, startLine(manifest.start.chain).at(START_ALONG_M));
  (window as unknown as { __nightHookReady: unknown }).__nightHookReady = { scene, camera, world, manifest, night, sky, lookAtHour, headlights, clipmap, colour: colorOf, hazed, linear, sun: manifest.sun };`,
    ],
  ],
};

const BUILDINGS = {
  real: [
    [`import type { SolidsCell } from "./solids";`, `import type { SolidsCell } from "./solids";\nimport { farWindowLight, windowLight, type Night } from "../art/night";`],
    [
      `export function buildingMaterial({ colour, linear, hazed }: BuildingPalette, sun: { azimuthDeg: number; elevationDeg: number }): MeshBasicNodeMaterial {`,
      `export function buildingMaterial({ colour, linear, hazed }: BuildingPalette, sun: { azimuthDeg: number; elevationDeg: number }, night: Night): MeshBasicNodeMaterial {`,
    ],
    [
      `material.colorNode = hazed(select(isStyle("roof"), roof, faded.mul(nearGround)).mul(lit));`,
      `const building = tint.b.mul(255).add(tint.r.mul(31));
  const paneId = floor(along.div(bay)).add(floor(up.div(storey)).mul(37)).add(width.mul(3.1));
  const paneUp = inStorey.div(WINDOW.halfTall * 2).add(0.5);
  const roomLight = windowLight(night, { id: paneId, building, up: paneUp, shown: glazed.mul(windowsShow) });
  const wallLight = select(isStyle("roof"), vec3(0, 0, 0), roomLight.add(farWindowLight(night, building, windowsShow).mul(hasWindows)));
  material.colorNode = hazed(select(isStyle("roof"), roof, faded.mul(nearGround)).mul(lit)).add(wallLight);`,
    ],
  ],
  gallery: [],
};

/** A source file with its replacements applied. */
export function patchSource(source, file) {
  const { real, gallery } = file === "game" ? GAME : BUILDINGS;
  let patched = source.split(String.fromCharCode(13)).join("");
  for (const [from, to] of [...real, ...gallery]) {
    if (!patched.includes(from)) {
      throw new Error(`integration: ${file} no longer has: ${from}`);
    }
    patched = patched.replace(from, to);
  }
  return patched;
}
