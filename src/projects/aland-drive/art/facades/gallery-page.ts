import { Group, Mesh, MeshBasicNodeMaterial, type Node, type Object3D, type Scene, type Vector3 } from "three/webgpu";
import { startGame, type Place } from "../../render/game";
import type { SolidsCell } from "../../render/solids";
import type { World } from "../../sim/world";
import { doorFacades } from "./add-ons";
import { placeModels, type ModelStage, type StagedModels } from "./gallery-models";

/* The gallery's page: the real game on real tiles, with the facades wired in and a way to swap them out to measure them. */

interface Hook {
  scene: Scene;
  world: World;
  manifest: { worldOrigin: { east: number; north: number } };
  wallMaterial: MeshBasicNodeMaterial;
  colour: (name: string) => Node<"vec3">;
  linear: (name: string) => Vector3;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  sun: { azimuthDeg: number; elevationDeg: number };
}

interface DoorWanted {
  style?: number;
  front?: number;
  index: number;
}

declare global {
  interface Window {
    __facadesHook?: Hook;
    __facadeCells?: SolidsCell[];
    __facadesFailure?: string;
    __facadesGallery?: {
      setArt: (on: boolean) => void;
      models: () => void;
      doorLook: (wanted: DoorWanted) => Place;
      counts: () => unknown;
      showStage: (stage: ModelStage | null) => void;
    };
  }
}

const element = document.getElementById("game");
if (!element) throw new Error("no game element");

startGame(element, {
  onHud: () => undefined,
  onInputKind: () => undefined,
  onCamera: () => undefined,
  onFailure: (error) => {
    window.__facadesFailure = error.stack ?? error.message;
  },
})
  .then((game) => {
    const hook = window.__facadesHook;
    if (!hook) throw new Error("no hook: the integration did not apply");
    const on = hook.wallMaterial;
    const off = new MeshBasicNodeMaterial();
    off.colorNode = on.userData.plainColorNode as Node<"vec3">;
    off.side = on.side;
    const group = new Group();
    hook.scene.add(group);
    let staged: StagedModels | null = null;
    window.__facadesGallery = {
      setArt(art) {
        hook.scene.traverse((object: Object3D) => {
          if (object instanceof Mesh && (object.material === on || object.material === off)) object.material = art ? on : off;
        });
      },
      doorLook({ style, front, index }) {
        const doors = doorFacades(window.__facadeCells ?? []).filter((door) => (style === undefined || door.style === style) && (front === undefined || door.front === front));
        if (doors.length === 0) throw new Error(`no door of ${style} ${front}`);
        const { x, z, outX, outZ, alongX, alongZ, width } = doors[index % doors.length];
        const away = Math.max(19, width * 0.85);
        const [fromX, fromZ] = [x + outX * away + alongX * width * 0.22, z + outZ * away + alongZ * width * 0.22];
        const yaw = -Math.atan2(x - fromX, -(z - fromZ));
        return { east: fromX + hook.manifest.worldOrigin.east, north: hook.manifest.worldOrigin.north - fromZ, height: 1.8, yaw, pitch: 0.14 };
      },
      models() {
        group.clear();
        staged = placeModels(hook, group, window.__facadeCells ?? []);
      },
      counts: () => staged?.counts ?? null,
      showStage(stage) {
        group.clear();
        staged = null;
        if (stage) staged = placeModels(hook, group, [], stage);
      },
    };
    window.__alandDrive = game.probe;
  })
  .catch((error: unknown) => {
    window.__facadesFailure = String(error);
  });
