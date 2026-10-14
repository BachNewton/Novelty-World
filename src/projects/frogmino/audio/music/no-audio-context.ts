// ZzFX creates an AudioContext as its module loads, and a worker has no
// AudioContext. The render worker only builds samples, which needs none, so
// this stand-in lets ZzFX load there. Import it before ZzFX.
if (!("AudioContext" in globalThis)) Object.assign(globalThis, { AudioContext: class {} });
