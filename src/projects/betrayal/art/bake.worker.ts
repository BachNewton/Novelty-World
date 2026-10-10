import type { MeshBVH } from "three-mesh-bvh";
import { gather, occluders, type BakeScene, type Gathered, type Pass, type RoomLight, type Samples } from "./bake";
import { finishLight, type FinishWork } from "./bake-finish";

/** What `bake-workers.ts` sends: a chunk of a pass to gather (the scene comes
 *  only when it is new to this worker), or a pass's light to finish. */
export type BakeMessage = { type: "gather"; pass: Pass; sceneId: number; scene: BakeScene | null; samples: Samples } | { type: "finish"; work: FinishWork };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<BakeMessage>) => void) | null;
  postMessage: (message: Gathered | RoomLight, transfer: Transferable[]) => void;
};

let current: { id: number; scene: BakeScene; bvh: MeshBVH } | null = null;

scope.onmessage = ({ data }) => {
  if (data.type === "finish") {
    const light = finishLight(data.work);
    scope.postMessage(light, [light.irradiance.buffer, light.flicker.buffer, light.probes.buffer]);
    return;
  }
  if (data.scene) current = { id: data.sceneId, scene: data.scene, bvh: occluders(data.scene.casters) };
  if (current?.id !== data.sceneId) throw new Error(`A bake worker was sent scene ${data.sceneId} without it`);
  const gathered = gather(data.pass, current.scene, current.bvh, data.samples);
  scope.postMessage(gathered, [gathered.light.buffer, gathered.weights.buffer]);
};
