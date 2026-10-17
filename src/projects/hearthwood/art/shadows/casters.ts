import { DoubleSide, type Material, MeshDepthMaterial, type Object3D, type Scene, Vector3, type WebGLProgramParametersWithUniforms } from "three";
import { shadeTwin } from "../shading";

/*
 * What casts a shadow, and how it is drawn into the shadow maps: every mesh
 * that casts is drawn with a depth twin of its material, which moves its
 * vertices exactly as the material does (the land's geomorph and the curve
 * of the earth, the plants' sway and parting), so a swaying tree's shadow
 * sways with it. A twin writes the light's depth twice: to the depth buffer
 * the shadows are compared against, and as a plain number for anything that
 * needs to know how far the light travelled (a soft shadow's blocker search,
 * the light through leaves, god rays).
 */

/** Where the camera is, for vertex code that bends the world round it (the land's geomorph and the earth's curve): in the shadow pass the camera is the light's. */
export const CASTER_EYE = { value: new Vector3() };

const EYE_GLSL = /* glsl */ `
uniform vec3 uHwEye;
#define cameraPosition uHwEye
`;

/**
 * An instance of a plant (or a rock) wholly outside the map being drawn is
 * dropped before any of its vertex work: the instanced plants are one draw
 * for every chunk, so without this the sharpest map, a few metres across,
 * would still run the wind through every tree in a kilometre. Its bound is
 * its largest scale, as a plant's shape stands about a unit tall and wide,
 * with room for the sway.
 */
const INSTANCE_CULL_GLSL = /* glsl */ `
#ifdef USE_INSTANCING
{
  vec4 hwAt = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float hwSize = 1.5 * max(length(instanceMatrix[0].xyz), max(length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)));
  vec2 hwOut = abs(hwAt.xy / hwAt.w) - vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * hwSize;
  if (max(hwOut.x, hwOut.y) > 1.0) {
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    return;
  }
}
#endif
`;

/** The depth material's own write, swapped for the light's depth as it is. */
const PACKED_DEPTH = "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );";
/** Where the depth shader's main begins its work. */
const MAIN_BEGINS = "#include <uv_vertex>";

function patchCaster(shader: WebGLProgramParametersWithUniforms): void {
  if (!shader.fragmentShader.includes(PACKED_DEPTH)) throw new Error("three's depth shader no longer writes its depth where the shadow casters expect it");
  if (!shader.vertexShader.includes(MAIN_BEGINS)) throw new Error("three's depth shader no longer begins its main where the shadow casters expect it");
  shader.uniforms.uHwEye = CASTER_EYE;
  shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${EYE_GLSL}`).replace(MAIN_BEGINS, `${INSTANCE_CULL_GLSL}\n${MAIN_BEGINS}`);
  shader.fragmentShader = shader.fragmentShader.replace(PACKED_DEPTH, "gl_FragColor = vec4( fragCoordZ, 0.0, 0.0, 1.0 );");
}

const twins = new WeakMap<Material, MeshDepthMaterial>();

/** The depth twin a material casts with, made once. Both faces are drawn, so open shapes (a trunk, the land's skirts, a leaf) cast from either side. */
function twinOf(material: Material): MeshDepthMaterial {
  const known = twins.get(material);
  if (known) return known;
  const twin = new MeshDepthMaterial({ side: DoubleSide });
  if (!shadeTwin(twin, material, "caster", patchCaster)) {
    twin.onBeforeCompile = patchCaster;
    twin.customProgramCacheKey = () => "hearthwood:caster";
  }
  material.addEventListener("dispose", () => twin.dispose());
  twins.set(material, twin);
  return twin;
}

type Drawn = Object3D & { castShadow: boolean; material?: Material | Material[] };

function isMeshLike(object: Object3D): object is Drawn & { material: Material | Material[] } {
  return "isMesh" in object && object.isMesh === true;
}

/** The scene made ready to draw its casters only, each with its twin; the returned function puts it back as it was. */
export function castersOnly(scene: Scene): () => void {
  const swapped: [Drawn & { material: Material | Material[] }, Material | Material[]][] = [];
  const hidden: Object3D[] = [];
  scene.traverseVisible((object) => {
    if (isMeshLike(object) && object.castShadow) {
      swapped.push([object, object.material]);
      object.material = Array.isArray(object.material) ? object.material.map(twinOf) : twinOf(object.material);
    } else if ("material" in object) hidden.push(object);
  });
  for (const object of hidden) object.visible = false;
  return () => {
    for (const [object, material] of swapped) object.material = material;
    for (const object of hidden) object.visible = true;
  };
}
