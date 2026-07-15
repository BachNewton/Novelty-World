import * as THREE from "three";
import { GRADE_UNIFORMS } from "@/shared/lib/three/display-grade";
import { MAIN_PASS_LAYER } from "./layers";

/**
 * The present pass: a fullscreen triangle that puts the scene capture ON SCREEN, so the frame's one
 * full rasterisation of the opaque scene (the capture) is also the image the player sees, and the main
 * render draws only this quad + the water on top (see docs/PERFORMANCE.md "merge the duplicate scene
 * pass" and scene.ts `routeMainPass`).
 *
 * Why a shader quad and not `gl.blitFramebuffer` (which the perf spec said to try first): the blit is
 * impossible here twice over. The default framebuffer is MULTISAMPLED (`antialias: true`, no composer),
 * and GL ES 3.0 §4.3.3 forbids blitting INTO a multisampled draw buffer; and the capture is LINEAR HDR
 * while the screen wants tone-mapped sRGB, a conversion a blit cannot perform. The quad does both jobs
 * in one cheap fullscreen draw.
 *
 * Colour: the capture is linear HDR (three renders to a target with NoToneMapping), so this shader must
 * run the same display transform every material runs on screen. It does so literally: rendering to the
 * canvas, three's fragment prologue defines `toneMapping()` from the renderer's operator — which is the
 * grade-patched `CustomToneMapping` (shared/lib/three/display-grade.ts) — and `linearToOutputTexel`
 * from the output colour space, so `tonemapping_fragment` + `colorspace_fragment` reproduce the exact
 * tonemap + grade + sRGB encode a direct render would apply. Under the bloom composer both chunks
 * compile to no-ops (render target ⇒ NoToneMapping + linear output), the quad passes linear HDR
 * through, and the composer's OutputPass tone-maps — the two paths agree by construction.
 *
 * Depth: NONE — deliberately, and this is where the pass's cost went. The first version wrote the
 * capture's depth via `gl_FragDepth` so the water could depth-test against the presented scene. That
 * one line made the quad expensive: writing gl_FragDepth disables early-z for the draw, and into a
 * 4×-multisampled backbuffer it forces per-sample colour+depth writes — measured, it gave back most of
 * the milliseconds the merged pass had just won. Nobody actually needs that depth: the only consumer
 * would have been the water's depth test, and the water shader already samples the capture's depth
 * texture per fragment — so it discards its own occluded fragments instead (ocean.ts, merged-occlusion
 * discard), and the quad is a pure colour present that early-z never sees.
 */
export interface PresentPass {
  mesh: THREE.Mesh;
  dispose: () => void;
}

const PRESENT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const PRESENT_FRAG = /* glsl */ `
uniform sampler2D uSceneColor;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(uSceneColor, vUv).rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createPresentPass(color: THREE.Texture): PresentPass {
  // One triangle over-covering the screen — the standard fullscreen primitive (no diagonal seam, no
  // second triangle's redundant edge fragments). gl_Position is written directly in NDC.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSceneColor: { value: color },
      // The grade uniforms the patched tonemapping chunk reads. The global-uniform accessor
      // (registerGlobalUniforms) injects these into every material anyway; naming them here as well is
      // deliberate — the shader visibly depends on them, and the same IUniform objects are shared, so
      // there is no second copy to drift.
      ...GRADE_UNIFORMS,
    },
    vertexShader: PRESENT_VERT,
    fragmentShader: PRESENT_FRAG,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // NDC-space geometry — three's frustum test would reject it
  mesh.renderOrder = -1; // before the water, which depth-tests against the depth this writes
  mesh.layers.set(MAIN_PASS_LAYER);

  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
