import { LONGFELLOW_PARTS } from "./explorers/longfellow";
import { OX_PARTS } from "./explorers/ox";
import { PROP_PARTS } from "./explorers/props";
import { RHINEHARDT_PARTS } from "./explorers/rhinehardt";
import { ZOE_PARTS } from "./explorers/zoe";
import { packParts, type FigureParts, type Packed } from "./figure-parts";
import { BANSHEE_PARTS } from "./monsters/banshee";
import { SPIDER_PARTS } from "./monsters/spider";

/** Every figure's parts a worker can mesh, by id. A figure built in the house joins this list. */
const ALL: readonly FigureParts<unknown>[] = [LONGFELLOW_PARTS, OX_PARTS, ZOE_PARTS, RHINEHARDT_PARTS, PROP_PARTS, SPIDER_PARTS, BANSHEE_PARTS];

/** What `figure-mesh.ts` hears back: one figure's parts, packed, or why they couldn't be meshed. */
export type MeshReply = { id: string; packed: Packed } | { id: string; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  postMessage: (message: MeshReply, transfer?: Transferable[]) => void;
};

scope.onmessage = ({ data: id }) => {
  try {
    const parts = ALL.find((candidate) => candidate.id === id);
    if (!parts) throw new Error(`No figure parts "${id}" for a worker to mesh; add them to figure-mesh.worker.ts`);
    const { packed, transfer } = packParts(parts.mesh());
    scope.postMessage({ id, packed }, transfer);
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  }
};
