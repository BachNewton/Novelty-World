import { Group, Mesh, MeshBasicNodeMaterial, type Node, type Object3D, type Scene, type Vector3 } from "three/webgpu";
import { time } from "three/tsl";
import { startGame, type Place } from "../../render/game";
import type { World } from "../../sim/world";
import { placeModel, type Placement } from "../roadside/material";
import { runSections, streetMaterials, type LinePoint } from "../street";
import { buildFountain, buildHedge, HEDGE_M } from "./index";
import { loadTownSurface } from "./gallery-source";

/* The gallery's page: the game with the town ground in, and a way to swap it out on every mesh. */

interface Hook {
  scene: Scene;
  world: World;
  terrainColor: Node<"vec3">;
  plainTerrain: Node<"vec3">;
  colour: (name: string) => Node<"vec3">;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  linear: (name: string) => Vector3;
  sun: { azimuthDeg: number; elevationDeg: number };
  manifest: { worldOrigin: { east: number; north: number } };
}

interface Swappable {
  group: string;
  on: MeshBasicNodeMaterial;
  off: MeshBasicNodeMaterial;
}

interface TownWindow {
  __alandDrive?: unknown;
  __surfacesHook?: Hook;
  __townFailure?: string;
  __townGallery?: {
    worldOrigin: { east: number; north: number };
    setArt: (group: string, on: boolean) => void;
    placeProps: (props: { hedges: [number, number][][]; fountains: [number, number][] }, within: Place, reachM: number) => number;
  };
}

const shared = window as unknown as TownWindow;

const plainTwin = (material: MeshBasicNodeMaterial, colorNode: Node<"vec3">) => {
  const twin = new MeshBasicNodeMaterial();
  twin.positionNode = material.positionNode;
  twin.colorNode = colorNode;
  twin.side = material.side;
  return twin;
};

const element = document.getElementById("game");
if (!element) throw new Error("no game element");

async function start(host: HTMLElement) {
  await loadTownSurface();
  const game = await startGame(host, {
    onHud: () => undefined,
    onInputKind: () => undefined,
    onCamera: () => undefined,
    onFailure: (error) => {
      shared.__townFailure = error.stack ?? error.message;
    },
  });
  const hook = shared.__surfacesHook;
  if (!hook) throw new Error("the game wasn't patched");
  const swaps = new Map<MeshBasicNodeMaterial, Swappable>();
  const swapFor = (material: MeshBasicNodeMaterial): Swappable | null => {
    const known = swaps.get(material);
    if (known) return known;
    const group = material.colorNode === hook.terrainColor ? "ground" : (material.userData.artGroup as string | undefined);
    if (group === undefined || group === "walls") return null;
    const plain = group === "ground" ? hook.plainTerrain : (material.userData.plainColorNode as Node<"vec3">);
    const swap = { group, on: material, off: plainTwin(material, plain) };
    swaps.set(material, swap);
    swaps.set(swap.off, swap);
    return swap;
  };
  const props = new Group();
  hook.scene.add(props);
  const materials = streetMaterials({ linear: hook.linear, colour: hook.colour, hazed: hook.hazed, sun: hook.sun, time });
  shared.__townGallery = {
    worldOrigin: hook.manifest.worldOrigin,
    setArt(group, on) {
      hook.scene.traverse((object: Object3D) => {
        if (!(object instanceof Mesh)) return;
        const swap = swapFor(object.material as MeshBasicNodeMaterial);
        if (swap && (group === "all" || group === swap.group)) object.material = on ? swap.on : swap.off;
      });
    },
    placeProps({ hedges, fountains }, within, reachM) {
      props.clear();
      const [x, z] = [within.east - hook.manifest.worldOrigin.east, -(within.north - hook.manifest.worldOrigin.north)];
      const heightAt = (px: number, pz: number) => hook.world.height(px, pz);
      const close = ([px, pz]: [number, number]) => Math.hypot(px - x, pz - z) < reachM;
      const lines = hedges.filter((line) => line.some(close)).map((line): LinePoint[] => line.map(([px, pz]) => ({ x: px, y: heightAt(px, pz), z: pz })));
      const sections: Placement[] = lines.filter((line) => line.length > 1).flatMap((line) => runSections(line, HEDGE_M));
      if (sections.length > 0) props.add(...placeModel(buildHedge(), sections, materials));
      const standing = fountains.filter(close).map(([px, pz]): Placement => ({ x: px, y: heightAt(px, pz), z: pz }));
      if (standing.length > 0) props.add(...placeModel(buildFountain(), standing, materials));
      return sections.length + standing.length;
    },
  };
  shared.__alandDrive = game.probe;
}

start(element).catch((error: unknown) => {
  shared.__townFailure = String(error);
});
