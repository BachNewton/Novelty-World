import { sculptCat, type CatMesh } from "../../cats/sculpt";

/** What `cat-geometry.ts` hears back: the cat's mesh for a hair length, or why it couldn't be meshed. */
export type CatMeshReply = { longHair: boolean; mesh: CatMesh } | { longHair: boolean; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<boolean>) => void) | null;
  postMessage: (message: CatMeshReply, transfer?: Transferable[]) => void;
};

scope.onmessage = ({ data: longHair }) => {
  try {
    const mesh = sculptCat({ longHair });
    const transfer = [mesh.positions, mesh.normals, mesh.skinIndex, mesh.skinWeight, mesh.occlusion, mesh.part, mesh.triangles].map((array) => array.buffer);
    scope.postMessage({ longHair, mesh }, transfer);
  } catch (error) {
    scope.postMessage({ longHair, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  }
};
