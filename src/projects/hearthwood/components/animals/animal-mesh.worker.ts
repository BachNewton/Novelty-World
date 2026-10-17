import type { AnimalMesh } from "../../animals/sculpt";
import { sculptCat } from "../../cats/sculpt";
import { sculptDog, type DogSculpture } from "../../dogs/sculpt";
import { sculptFox } from "../../foxes/sculpt";
import { sculptHedgehog } from "../../hedgehogs/sculpt";
import { sculptSquirrel } from "../../squirrels/sculpt";
import { sculptHare } from "../../hares/sculpt";

/** Which sculpture to mesh: a cat's for its hair length, a dog's for its ears and coat, or a wild animal's. */
export type MeshRequest = { species: "cat"; longHair: boolean } | ({ species: "dog" } & DogSculpture) | { species: "fox" } | { species: "hedgehog" } | { species: "squirrel" } | { species: "hare" };

/** What `animal-geometry.ts` hears back: the mesh, or why it couldn't be meshed. */
export type MeshReply = { mesh: AnimalMesh } | { error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MeshRequest>) => void) | null;
  postMessage: (message: MeshReply, transfer?: Transferable[]) => void;
};

function meshOf(request: MeshRequest): AnimalMesh {
  switch (request.species) {
    case "cat":
      return sculptCat({ longHair: request.longHair });
    case "dog":
      return sculptDog(request);
    case "fox":
      return sculptFox();
    case "hedgehog":
      return sculptHedgehog();
    case "squirrel":
      return sculptSquirrel();
    case "hare":
      return sculptHare();
  }
}

scope.onmessage = ({ data: request }) => {
  try {
    const mesh = meshOf(request);
    const transfer = [mesh.positions, mesh.normals, mesh.skinIndex, mesh.skinWeight, mesh.occlusion, mesh.part, mesh.triangles].map((array) => array.buffer);
    scope.postMessage({ mesh }, transfer);
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  }
};
