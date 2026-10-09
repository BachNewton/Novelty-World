import type { MeshBVH } from "three-mesh-bvh";
import { gatherLight, occluders, type BakeScene, type Gathered, type Samples } from "./bake";

/** One chunk of a bake, as `bake-workers.ts` sends it: the scene comes only when it is new to this worker. */
export interface BakeJob extends Samples {
  sceneId: number;
  scene: BakeScene | null;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<BakeJob>) => void) | null;
  postMessage: (message: Gathered, transfer: Transferable[]) => void;
};

let current: { id: number; scene: BakeScene; bvh: MeshBVH } | null = null;

scope.onmessage = ({ data }) => {
  if (data.scene) current = { id: data.sceneId, scene: data.scene, bvh: occluders(data.scene.casters) };
  if (current?.id !== data.sceneId) throw new Error(`A bake worker was sent scene ${data.sceneId} without it`);
  const gathered = gatherLight(current.scene, current.bvh, data);
  scope.postMessage(gathered, [gathered.light.buffer, gathered.weights.buffer]);
};
