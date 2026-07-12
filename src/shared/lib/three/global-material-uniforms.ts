import * as THREE from "three";

/**
 * The one way to put a uniform on **every** material in the page's three.js.
 *
 * Some effects are global by nature — a cloud shadow that dims every lit surface, a colour grade that
 * applies to every pixel. Those are implemented by patching a `ShaderChunk`, which reaches every
 * material for free. But a `ShaderChunk` **cannot add a uniform**: three only binds uniforms a material
 * actually owns, so a chunk that references `uFoo` compiles against a uniform nobody uploads, and reads
 * zero. `Material.onBeforeCompile` is the one hook that can add them — it receives the program
 * parameters, and whatever it puts in `shader.uniforms` becomes that material's uniforms.
 *
 * Two traps, which is why this is a module and not three lines at each call site:
 *
 * 1. **An instance assignment shadows a prototype method.** `ocean.ts` sets `material.onBeforeCompile`
 *    on its own material. A plain `Material.prototype.onBeforeCompile = ...` would be silently skipped
 *    by exactly those materials — the interesting ones. Hence an accessor: the setter stashes the
 *    instance's hook aside, and the getter returns a function that injects the uniforms *and then*
 *    calls it. No material can opt out, and none loses its own hook.
 *
 * 2. **Two features both wanting this would fight over the prototype.** The second
 *    `Object.defineProperty` would clobber the first. So there is ONE accessor, installed once, over a
 *    LIST of uniform sets — every registered feature's uniforms are merged into every material.
 *
 * Registration is ref-counted: the last caller to dispose puts `Material.prototype` back exactly as
 * three left it. This mutates the imported `three` module for the whole page, so a feature's defaults
 * must be **inert** (a strength of 0, an identity grade) — any other scene on the page has to render
 * unchanged.
 *
 * The registry hangs off a `Symbol.for` key on `THREE.Material.prototype` rather than a module-scope
 * array, because module scope resets on hot reload while the mutated `THREE` singleton does not: a Fast
 * Refresh would otherwise drop the live registrations on the floor and leave the accessor injecting an
 * empty list.
 */
type UniformSet = Record<string, THREE.IUniform>;
type CompileHook = (
  shader: THREE.WebGLProgramParametersWithUniforms,
  renderer: THREE.WebGLRenderer,
) => void;

const USER_HOOK = Symbol.for("novelty.material.userOnBeforeCompile");
const REGISTRY = Symbol.for("novelty.material.globalUniformSets");

interface HookedMaterial extends THREE.Material {
  [USER_HOOK]?: CompileHook;
}
interface Registry {
  [REGISTRY]?: UniformSet[];
}

/** Survives hot reload with `THREE` itself — see the note above. */
const registry = (): UniformSet[] => {
  const store = THREE.Material.prototype as Registry;
  return (store[REGISTRY] ??= []);
};

const installAccessor = (): void => {
  Object.defineProperty(THREE.Material.prototype, "onBeforeCompile", {
    configurable: true,
    get(this: HookedMaterial) {
      const user = this[USER_HOOK];
      return (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => {
        for (const set of registry()) Object.assign(shader.uniforms, set);
        user?.(shader, renderer);
      };
    },
    set(this: HookedMaterial, fn: CompileHook | undefined) {
      this[USER_HOOK] = fn;
    },
  });
};

const removeAccessor = (): void => {
  // three's `Material` has no own `onBeforeCompile` on the prototype (it is an instance-assigned no-op
  // in the constructor), so deleting our accessor restores it exactly.
  delete (THREE.Material.prototype as Partial<THREE.Material>).onBeforeCompile;
};

/**
 * Merge `uniforms` into every material three compiles, until the returned disposer runs.
 *
 * The same object is shared by every material, so mutating `uniforms.uFoo.value` updates the whole
 * scene in one write — that is the point, and it is why the value must be safe for materials that were
 * never meant to see it.
 */
export const registerGlobalUniforms = (uniforms: UniformSet): (() => void) => {
  const sets = registry();
  if (sets.length === 0) installAccessor();
  if (!sets.includes(uniforms)) sets.push(uniforms);

  let disposed = false;
  return () => {
    if (disposed) return; // a double-dispose must not decrement someone else's registration
    disposed = true;
    const live = registry();
    const i = live.indexOf(uniforms);
    if (i !== -1) live.splice(i, 1);
    if (live.length === 0) removeAccessor();
  };
};
