import { SHOTS, startDeerStage } from "./stage";

/* The deer's gallery headless: the stage at each shot's moment, for `gallery.mjs` to photograph. */

const [WIDTH, HEIGHT] = [1600, 900];
const stage = await startDeerStage(document.body, { width: WIDTH, height: HEIGHT });

declare global {
  interface Window {
    __deerGallery: { shots: typeof SHOTS; frame: (name: string) => unknown; swaps: Record<string, number>; ready: boolean };
  }
}

window.__deerGallery = {
  shots: SHOTS,
  frame: (name) => {
    const shot = SHOTS.find((candidate) => candidate.name === name);
    if (shot === undefined) throw new Error(`no shot ${name}`);
    return stage.show(shot);
  },
  swaps: stage.herd.swaps(),
  ready: true,
};
