import { Vector3, type WebGLProgramParametersWithUniforms } from "three";

/*
 * What every shadow depth (`shadowDepth` in `shading.ts`) adds for the
 * shadow maps: it writes the light's depth twice, to the depth buffer the
 * shadows are compared against and as a plain number for anything that needs
 * to know how far the light travelled (a soft shadow's search, the light
 * through leaves, god rays); it bends the world round the real camera, not
 * the light; and it drops a plant's instance wholly outside the map being
 * drawn before any of its vertex work.
 */

/** Where the camera is, for vertex code that bends the world round it (the land's geomorph and the earth's curve): in the shadow pass the camera is the light's. */
export const CASTER_EYE = { value: new Vector3() };

const EYE_GLSL = /* glsl */ `
uniform vec3 uHwEye;
#define cameraPosition uHwEye
`;

/**
 * The instanced plants are one draw for every chunk, so without this the
 * sharpest map, a few metres across, would still run the wind through every
 * tree in a kilometre. An instance's bound is its largest scale, as a plant's
 * shape stands about a unit tall and wide, with room for the sway.
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

/** Patches three's depth shader for the shadow maps. */
export function patchCaster(shader: WebGLProgramParametersWithUniforms): void {
  if (!shader.fragmentShader.includes(PACKED_DEPTH)) throw new Error("three's depth shader no longer writes its depth where the shadow casters expect it");
  if (!shader.vertexShader.includes(MAIN_BEGINS)) throw new Error("three's depth shader no longer begins its main where the shadow casters expect");
  shader.uniforms.uHwEye = CASTER_EYE;
  shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${EYE_GLSL}`).replace(MAIN_BEGINS, `${INSTANCE_CULL_GLSL}\n${MAIN_BEGINS}`);
  shader.fragmentShader = shader.fragmentShader.replace(PACKED_DEPTH, "gl_FragColor = vec4( fragCoordZ, 0.0, 0.0, 1.0 );");
}
