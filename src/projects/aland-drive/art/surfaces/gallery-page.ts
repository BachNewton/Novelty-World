import { Mesh, MeshBasicNodeMaterial, type Node, type Object3D } from "three/webgpu";
import { startGame, type Place } from "../../render/game";
import type { SetHook } from "./gallery-sets";

/* The gallery's page: the game, with a way for the gallery to swap the art in and out on every mesh. */

interface Hook extends SetHook {
  terrainColor: Node<"vec3">;
  plainTerrain: Node<"vec3">;
}

interface Swappable {
  group: string;
  on: MeshBasicNodeMaterial;
  off: MeshBasicNodeMaterial;
}

declare global {
  interface Window {
    __surfacesHook?: Hook;
    __galleryFailure?: string;
    __surfacesPlates?: { names: string[]; size: number; show: (name: string) => Promise<string> };
    __surfacesGallery?: { worldOrigin: { east: number; north: number }; setArt: (group: string, on: boolean) => void; show: (what: string | null, at: Place & { away: number }) => void };
  }
}

const plainTwin = (material: MeshBasicNodeMaterial, colorNode: Node<"vec3">) => {
  const twin = new MeshBasicNodeMaterial();
  twin.positionNode = material.positionNode;
  twin.colorNode = colorNode;
  twin.side = material.side;
  return twin;
};

const element = document.getElementById("game");
if (!element) throw new Error("no game element");

startGame(element, {
  onHud: () => undefined,
  onInputKind: () => undefined,
  onCamera: () => undefined,
  onFailure: (error) => {
    window.__galleryFailure = error.stack ?? error.message;
  },
})
  .then(async (game) => {
    const hook = window.__surfacesHook;
    if (!hook) {
      (window as unknown as { __alandDrive: unknown }).__alandDrive = game.probe;
      return;
    }
    const swaps = new Map<MeshBasicNodeMaterial, Swappable>();
    const swapFor = (material: MeshBasicNodeMaterial): Swappable | null => {
      const known = swaps.get(material);
      if (known) return known;
      const group = material.colorNode === hook.terrainColor ? "ground" : (material.userData.artGroup as string | undefined);
      if (group === undefined) return null;
      const plain = group === "ground" ? hook.plainTerrain : (material.userData.plainColorNode as Node<"vec3">);
      const swap = { group, on: material, off: plainTwin(material, plain) };
      swaps.set(material, swap);
      swaps.set(swap.off, swap);
      return swap;
    };
    const { startSets, showSet, startPlates } = await import("./gallery-sets");
    startSets(hook);
    window.__surfacesGallery = {
      worldOrigin: hook.manifest.worldOrigin,
      setArt(group, on) {
        hook.scene.traverse((object: Object3D) => {
          if (!(object instanceof Mesh)) return;
          const swap = swapFor(object.material as MeshBasicNodeMaterial);
          if (swap && (group === "all" || group === swap.group)) object.material = on ? swap.on : swap.off;
        });
      },
      show(what, at) {
        showSet(what, at);
      },
    };
    window.__surfacesPlates = await startPlates();
    (window as unknown as { __alandDrive: unknown }).__alandDrive = game.probe;
  })
  .catch((error: unknown) => {
    window.__galleryFailure = String(error);
  });
