import * as THREE from "three";

/*
 * Shaders readied before what uses them is first drawn. three.js links a
 * material's program the first time it draws it, and the frame then waits
 * for the GPU to finish compiling it: 50 ms and more a program. Here an
 * object's programs are compiled on the GPU's own threads
 * (KHR_parallel_shader_compile) for the scene as it will be once the object
 * is in it, and the promise resolves once they are done, so the object can
 * join without stalling a frame.
 *
 * A program is built for the scene's live lights, so an object that brings
 * lights of its own (a figure's carried candle) changes the program of every
 * lit material already in the scene. Those are compiled for the new lights
 * too, before it joins. Objects that bring lights are readied one at a time,
 * in order, each for the scene as the one before left it: a caller adds each
 * to the scene as soon as its promise resolves.
 */

/** Readies an object's shaders for a scene it is about to join, resolving once it can be drawn without stalling a frame. */
export type ReadyShaders = (object: THREE.Object3D) => Promise<void>;

/** What three keeps of a program: whether the GPU has finished it, and its uniforms, read from the GPU the first time. */
interface Program {
  isReady: () => boolean;
  getUniforms: () => unknown;
}

/** The live lights an object would add to the scene: what three counts when it builds programs. */
export function lightsIn(object: THREE.Object3D): THREE.Light[] {
  const lights: THREE.Light[] = [];
  object.traverseVisible((child) => {
    if (child instanceof THREE.Light) lights.push(child);
  });
  return lights;
}

/** A material whose program depends on the scene's lights, as three decides it. */
function needsLights(material: THREE.Material): boolean {
  return (
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshToonMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.ShadowMaterial ||
    (material instanceof THREE.ShaderMaterial && material.lights)
  );
}

export function shaderReadier(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene): ReadyShaders {
  const programsOf = (material: THREE.Material) => [...((renderer.properties.get(material) as { programs?: Map<string, Program> }).programs?.values() ?? [])];

  /** Compiles an object's materials for a scene, starting their programs on the GPU's threads: every program they have. */
  const compile = (object: THREE.Object3D, target: THREE.Scene): Set<Program> => new Set([...renderer.compile(object, camera, target)].flatMap(programsOf));

  /**
   * Resolves once the GPU has finished every program, asked once a frame:
   * the extension has no event for it. Then fetches what three reads from a
   * program the first time it draws with it (its uniforms, and its logs while
   * shader errors are checked). Each read waits for the GPU process to finish
   * everything queued before it, and in a frame that is the frame's own
   * uploads; here, between frames, it is little.
   */
  const finished = (programs: Set<Program>) =>
    new Promise<void>((resolve) => {
      const waiting = new Set(programs);
      const check = () => {
        for (const program of waiting) if (program.isReady()) waiting.delete(program);
        if (waiting.size > 0) {
          requestAnimationFrame(check);
          return;
        }
        resolve();
      };
      // Not straight away: asking is itself a wait on the GPU process, which has only just been handed them.
      requestAnimationFrame(check);
    }).then(() => {
      for (const program of programs) program.getUniforms();
    });

  /**
   * The scene's lit materials, compiled as they will draw once these lights
   * join it. three keeps drawing an unlit material with the program it was
   * last compiled with, as its program never reads the lights, so compiling
   * one here would have it drawn with a program still compiling. Each is
   * marked to be looked up again for the scene as it is, which finds the
   * program it had, and the lit ones are looked up again anyway, as the
   * scene's lights are not those they were just compiled for.
   */
  const withLights = (lights: THREE.Light[]) => {
    const joined = new THREE.Scene();
    joined.fog = scene.fog;
    joined.environment = scene.environment;
    for (const light of lights) joined.add(light.clone());
    const lit = new Set<Program>();
    for (const material of renderer.compile(scene, camera, joined)) {
      if (needsLights(material)) for (const program of programsOf(material)) lit.add(program);
      else material.needsUpdate = true;
    }
    return lit;
  };

  /** The last object that brings lights, readied or on its way: the next waits for it to join. */
  let lit: Promise<void> = Promise.resolve();
  return (object) => {
    for (let at: THREE.Object3D | null = object; at; at = at.parent) if (at === scene) throw new Error("Shaders are readied for an object before it joins the scene, not after");
    const ready = () => {
      const lights = lightsIn(object);
      const programs = compile(object, scene);
      if (lights.length > 0) for (const program of withLights(lights)) programs.add(program);
      return finished(programs);
    };
    if (lightsIn(object).length === 0) return ready();
    lit = lit.then(ready);
    return lit;
  };
}
