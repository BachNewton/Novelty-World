// What the gallery adds to the game in memory: the plain materials it swaps with the art's to measure it, and a hook to
// the game's insides. A replacement that no longer matches throws: the game moved, and this list needs updating.

const GAME = {
  gallery: [
    [
      `const groundColor = groundDetail(`,
      `const plainGround = photo.rgb.pow(vec3(2.2));
  const groundColor = groundDetail(`,
    ],
    [
      `const terrainColor = hazed(mix(pastTiles, mix(waterOf.color, land, photo.a), farSeen));`,
      `const terrainColor = hazed(mix(pastTiles, mix(waterOf.color, land, photo.a), farSeen));
  const plainLand = mix(mix(plainGround, colorOf("road-main"), roadEdge(mask.g)), colorOf("road-minor"), roadEdge(mask.b)).mul(light);
  const plainTerrain = hazed(mix(pastTiles, mix(waterOf.color, plainLand, photo.a), farSeen));`,
    ],
    [
      `const roadMaterial = new MeshBasicNodeMaterial();`,
      `const plainSurface = mix(mix(colorOf("road-minor"), colorOf("road-track"), smoothstep(float(1.4), float(1.6), tier)), colorOf("road-main"), isMain);
  const plainPainted = mix(plainSurface, colorOf("road-paint"), edgeLine.add(centreLine).min(1).mul(isMain));
  const onShoulder = smoothstep(float(1), float(1.08), across);
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
  for (const [find, replace] of FILES[file].gallery) {
    if (!patched.includes(find)) throw new Error(`the integration's ${file} no longer matches: ${find}`);
    patched = patched.replace(find, () => replace);
  }
  return patched;
}
