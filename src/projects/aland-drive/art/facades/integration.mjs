// The integration, as the exact replacements it takes, applied in memory by the gallery so its pictures are what the game
// will show. `real` goes into the game; `gallery` only lets the gallery swap the art in and out and reach the scene.
// A replacement that no longer matches throws: the game moved, and this list needs updating.

const GAME = {
  real: [
    [`import { buildingMaterial, buildingMeshes } from "./buildings";`, `import { buildingMaterial, buildingMeshes } from "./buildings";\nimport { createWordSheet } from "../art/facades";`],
    [
      `const wallMaterial = buildingMaterial({ colour: colorOf, linear, hazed }, manifest.sun);`,
      `const wallMaterial = buildingMaterial({ colour: colorOf, linear, hazed }, manifest.sun, { words: createWordSheet() });`,
    ],
  ],
  gallery: [
    [
      `const drive = new Drive(world, startLine(manifest.start.chain).at(START_ALONG_M));`,
      `const drive = new Drive(world, startLine(manifest.start.chain).at(START_ALONG_M));
  (window as unknown as { __facadesHook: unknown }).__facadesHook = { scene, world, manifest, wallMaterial, colour: colorOf, linear, hazed, sun: manifest.sun };`,
    ],
  ],
};

const BUILDINGS = {
  real: [
    [`import type { SolidsCell } from "./solids";`, `import type { SolidsCell } from "./solids";\nimport { facadeArt, type WordSheet } from "../art/facades";`],
    [
      `export function buildingMaterial({ colour, linear, hazed }: BuildingPalette, sun: { azimuthDeg: number; elevationDeg: number }): MeshBasicNodeMaterial {`,
      `export function buildingMaterial({ colour, linear, hazed }: BuildingPalette, sun: { azimuthDeg: number; elevationDeg: number }, art: { words: WordSheet }): MeshBasicNodeMaterial {`,
    ],
    [
      `material.colorNode = hazed(select(isStyle("roof"), roof, faded.mul(nearGround)).mul(lit));`,
      `const walled = facadeArt({ along, up, width, eaves, tint, pixel, wall: faded, colour, linear, words: art.words });
  material.colorNode = hazed(select(isStyle("roof"), roof, walled.mul(nearGround)).mul(lit));`,
    ],
  ],
  gallery: [
    [
      `material.side = 2;`,
      `material.side = 2;
  material.userData.plainColorNode = hazed(select(isStyle("roof"), roof, faded.mul(nearGround)).mul(lit));`,
    ],
    [
      `export function buildingMeshes(cells: SolidsCell[], material: MeshBasicNodeMaterial) {`,
      `export function buildingMeshes(cells: SolidsCell[], material: MeshBasicNodeMaterial) {
  ((window as unknown as { __facadeCells?: SolidsCell[] }).__facadeCells ??= []).push(...cells);`,
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
