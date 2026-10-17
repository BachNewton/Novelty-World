import type { AnimalMesh } from "../../animals/sculpt";
import { sculptCat } from "../../cats/sculpt";
import { sculptDog, type DogSculpture } from "../../dogs/sculpt";

/** Which sculpture to mesh: a cat's for its hair length, or a dog's for its ears and coat. */
export type MeshRequest = { species: "cat"; longHair: boolean } | ({ species: "dog" } & DogSculpture);

/** What `animal-geometry.ts` hears back: the mesh, or why it couldn't be meshed. */
export type MeshReply = { mesh: AnimalMesh } | { error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MeshRequest>) => void) | null;
  postMessage: (message: MeshReply, transfer?: Transferable[]) => void;
};

scope.onmessage = ({ data: request }) => {
  try {
    const mesh = request.species === "cat" ? sculptCat({ longHair: request.longHair }) : sculptDog(request);
    const transfer = [mesh.positions, mesh.normals, mesh.skinIndex, mesh.skinWeight, mesh.occlusion, mesh.part, mesh.triangles].map((array) => array.buffer);
    scope.postMessage({ mesh }, transfer);
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  }
};
