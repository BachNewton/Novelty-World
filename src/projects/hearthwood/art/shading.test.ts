import { MeshLambertMaterial, ShaderLib } from "three";
import { describe, expect, it } from "vitest";
import { allOn, FeatureSwitches, type FeatureId } from "../features";
import type { FeatureArt } from "./feature-art";
import { FEATURE_ART } from "./features";
import { checkFeatureArt, featureUniforms, fillHooks, kindDefines, patchLambert, ShadingVariants } from "./shading";

// Two stand-in features, under two of the real ids, so the tests hold whatever the real features do.
const [A, B] = Object.keys(allOn()) as FeatureId[];

const ART: readonly FeatureArt[] = [
  {
    feature: A,
    uniforms: { uTestA: { value: 1 } },
    chunks: [
      { kinds: ["foliage"], vertex: "transformed.x += uTestA;", fragmentHead: "uniform float uTestA;" },
      { kinds: ["land", "water"], light: "hwDirect *= 0.5;" },
    ],
  },
  { feature: B, chunks: [{ kinds: ["land", "sky"], colour: "hwColour *= 0.9;" }] },
];

function lambert(kind: "land" | "foliage" | "solid"): { vertexShader: string; fragmentShader: string } {
  const shader = { vertexShader: ShaderLib.lambert.vertexShader, fragmentShader: ShaderLib.lambert.fragmentShader };
  patchLambert(shader, ART, kind, null);
  return shader;
}

describe("the shared materials", () => {
  it("hold each feature's GLSL under its define, in a block of its own", () => {
    const foliage = lambert("foliage");
    expect(foliage.vertexShader).toMatch(/#ifdef HW_\w+\n\{\ntransformed\.x \+= uTestA;\n\}\n#endif/);
    expect(foliage.fragmentShader).toContain("uniform float uTestA;");
    expect(foliage.fragmentShader).not.toContain("hwDirect *= 0.5;");
  });

  it("only wrap a hook in its setup and write-back while a feature there is on", () => {
    const land = lambert("land");
    expect(land.fragmentShader).toMatch(/#if defined\(HW_\w+\)\n\{\nvec3 hwDirect = reflectedLight\.directDiffuse;/);
    expect(land.fragmentShader).toContain("hwColour *= 0.9;");
    const solid = lambert("solid");
    expect(solid.fragmentShader).not.toContain("hwDirect");
    expect(solid.fragmentShader).not.toContain("hwColour");
    // Every material still ends in the air, after which the colour is tone mapped.
    expect(solid.fragmentShader.indexOf("hwAtmosphere(gl_FragColor.rgb")).toBeLessThan(solid.fragmentShader.indexOf("#include <tonemapping_fragment>"));
  });

  it("fill a shader's own hook points, and refuse one that doesn't exist", () => {
    const water = fillHooks("#include <hw_fragment_head>\nvoid main() {\n#include <hw_light>\n#include <hw_colour>\n}", ART, "water");
    expect(water).toContain("hwDirect *= 0.5;");
    expect(water).toContain("varying vec3 vHwWorld;");
    expect(water).not.toContain("#include <hw_");
    expect(() => fillHooks("#include <hw_wind>", ART, "water")).toThrow();
  });

  it("carry the defines of the features on that reach them, and their uniforms", () => {
    const toggles = { ...allOn(), [B]: false };
    expect(Object.keys(kindDefines(ART, "land", toggles))).toHaveLength(1);
    expect(kindDefines(ART, "solid", allOn())).toEqual({});
    expect(featureUniforms(ART, "foliage")).toHaveProperty("uTestA");
    expect(featureUniforms(ART, "sky")).not.toHaveProperty("uTestA");
  });

  it("recompile when a feature that reaches them is switched, and only then", () => {
    const switches = new FeatureSwitches(allOn());
    const variants = new ShadingVariants(switches, ART);
    const land = new MeshLambertMaterial();
    const solid = new MeshLambertMaterial();
    variants.track(land, "land");
    variants.track(solid, "solid");
    expect(Object.keys(land.defines ?? {})).toHaveLength(2);
    const [landBefore, solidBefore] = [land.version, solid.version];
    switches.set(B, false);
    expect(Object.keys(land.defines ?? {})).toHaveLength(1);
    expect(land.version).toBe(landBefore + 1);
    expect(solid.version).toBe(solidBefore);
    switches.set(B, true);
    expect(Object.keys(land.defines ?? {})).toHaveLength(2);
    land.dispose();
    switches.set(B, false);
    expect(Object.keys(land.defines ?? {})).toHaveLength(2);
  });

  it("refuse art that can't be compiled in", () => {
    expect(() => checkFeatureArt([...ART, { feature: A }])).toThrow(/twice/);
    expect(() => checkFeatureArt([{ feature: A, chunks: [{ kinds: ["sky"], light: "" }] }])).toThrow(/sky/);
    expect(() => checkFeatureArt([{ feature: A, uniforms: { u: { value: 0 } } }, { feature: B, uniforms: { u: { value: 0 } } }])).toThrow(/Uniform/);
  });

  it("take every feature's real art", () => {
    expect(() => checkFeatureArt(FEATURE_ART)).not.toThrow();
    for (const kind of ["land", "ground", "foliage", "solid"] as const) {
      const shader = { vertexShader: ShaderLib.lambert.vertexShader, fragmentShader: ShaderLib.lambert.fragmentShader };
      expect(() => patchLambert(shader, FEATURE_ART, kind, null)).not.toThrow();
    }
  });
});
