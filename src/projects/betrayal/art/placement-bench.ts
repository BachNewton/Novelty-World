import * as THREE from "three";
import { CHARACTERS } from "../data/characters";
import { CARD_PALETTE, figureFor } from "./explorers/by-character";
import { pawn } from "./kit/pawn";
import { spider } from "./monsters";
import { PALETTE, type PaletteKey } from "./palette";
import type { SizeClass } from "./placement";
import { group } from "./shapes";
import type { ExplorerBuilder } from "./stage";

/*
 * Crowds on the bench (`&explorer=place-<n>`), placed by the solver: the
 * expected case of one to three explorers, a full table, a full table with
 * the Spider, and the worst case counted from the haunts (haunt 28: the
 * Demon Lord and his Demons with every explorer and the companions, plus a
 * swarm). Figures that aren't built yet stand in as pawns: a person-sized
 * monster or companion as a dark pawn, a small one as a tight cluster of
 * little pawns, the Demon Lord as the Spider.
 */

export interface CrowdFigure {
  build: ExplorerBuilder;
  size: SizeClass;
  /** The seat colour an explorer is ringed in; none for anyone else. */
  ring: PaletteKey | null;
}

export interface PlacementPreset {
  id: string;
  name: string;
  /** The active explorer first, then the rest in turn order. */
  figures: readonly CrowdFigure[];
}

const TABLE: readonly CrowdFigure[] = ["professor-longfellow", "ox-bellows", "zoe-ingstrom", "brandon-jaspers", "vivian-lopez", "heather-granville"].map((id) => {
  const character = CHARACTERS.find((candidate) => candidate.id === id);
  if (!character) throw new Error(`No character "${id}"`);
  const colour = CARD_PALETTE[character.card];
  return { build: figureFor(id, colour), size: "person", ring: colour };
});

const SPIDER: CrowdFigure = { build: (seed, gait) => spider(seed, gait), size: "large", ring: null };
const DEMON: CrowdFigure = { build: () => pawn({ colour: "bloodDark", rim: "blood" }), size: "person", ring: null };
const COMPANION: CrowdFigure = { build: () => pawn({ colour: "stone", rim: "stoneLight" }), size: "person", ring: null };

/** A small figure's stand-in: little pawns clustered round its place, as a swarm stands. */
function swarm(count: number, colour: PaletteKey): CrowdFigure {
  return {
    build: () => {
      const members = Array.from({ length: count }, (_, i) => {
        const member = pawn({ colour, rim: colour });
        const angle = i * 2.39996;
        const out = i === 0 ? 0 : 0.12 + 0.17 * Math.sqrt(i / count);
        member.scale.setScalar(0.22);
        member.position.set(Math.cos(angle) * out, 0, Math.sin(angle) * out);
        return member;
      });
      return group(...members);
    },
    size: "small",
    ring: null,
  };
}

export const PLACEMENT_PRESETS: readonly PlacementPreset[] = [
  { id: "place-1", name: "Placement: one explorer", figures: TABLE.slice(0, 1) },
  { id: "place-3", name: "Placement: three explorers", figures: TABLE.slice(0, 3) },
  { id: "place-6", name: "Placement: six explorers", figures: TABLE },
  { id: "place-6-spider", name: "Placement: six explorers and the Spider", figures: [...TABLE, SPIDER] },
  {
    id: "place-worst",
    name: "Placement: the worst case (haunt 28): six explorers, the Demon Lord, six demons, two companions, a dog and a swarm",
    figures: [...TABLE, SPIDER, ...Array.from({ length: 6 }, () => DEMON), COMPANION, COMPANION, swarm(1, "wood"), swarm(9, "bloodLight")],
  },
];

export function placementPreset(id: string): PlacementPreset | undefined {
  return PLACEMENT_PRESETS.find((preset) => preset.id === id);
}

/** The count badge over a crowded room: a figure icon and how many stand
 *  there, facing the camera at a fixed size on screen, drawn over the room. */
export function countBadge(count: number, at: THREE.Vector3): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 80;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas for the count badge");
  context.fillStyle = PALETTE.void;
  context.strokeStyle = PALETTE.boneLight;
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(4, 4, 152, 72, 36);
  context.fill();
  context.stroke();
  context.fillStyle = PALETTE.boneLight;
  // A figure: a head over a rounded body.
  context.beginPath();
  context.arc(46, 28, 10, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.roundRect(32, 41, 28, 24, [12, 12, 3, 3]);
  context.fill();
  context.font = "bold 44px sans-serif";
  context.textBaseline = "middle";
  context.fillText(String(count), 72, 43);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false, fog: false }));
  sprite.scale.set(0.12, 0.06, 1);
  sprite.position.copy(at);
  sprite.renderOrder = 2000;
  return sprite;
}
