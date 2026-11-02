// The gallery's way in to the game, as exact replacements applied in memory when it bundles the page: they hand the page
// the scene and the wall material, so it can stand models in the world, and the loaded cells, so it can find doors.
// A replacement that no longer matches throws: the game moved, and this list needs updating.

const GAME = [
  [
    `const drive = new Drive(world, startLine(manifest.start.chain).at(START_ALONG_M));`,
    `const drive = new Drive(world, startLine(manifest.start.chain).at(START_ALONG_M));
  (window as unknown as { __facadesHook: unknown }).__facadesHook = { scene, world, manifest, wallMaterial, colour: colorOf, linear, hazed, sun: manifest.sun };`,
  ],
];

const BUILDINGS = [
  [
    `export function buildingMeshes(cells: SolidsCell[], material: MeshBasicNodeMaterial) {`,
    `export function buildingMeshes(cells: SolidsCell[], material: MeshBasicNodeMaterial) {
  ((window as unknown as { __facadeCells?: SolidsCell[] }).__facadeCells ??= []).push(...cells);`,
  ],
];

const FILES = { game: GAME, buildings: BUILDINGS };

export function patchSource(source, file) {
  let patched = source;
  for (const [find, replace] of FILES[file]) {
    if (!patched.includes(find)) throw new Error(`the gallery's hook into ${file} no longer matches: ${find}`);
    patched = patched.replace(find, () => replace);
  }
  return patched;
}
