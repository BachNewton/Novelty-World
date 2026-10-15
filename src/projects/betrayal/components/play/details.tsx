"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Suspense, use, useEffect, useRef, type ReactNode } from "react";
import type { HouseScene, Pin } from "../../art/house-scene";
import { FLOOR_NAMES, FLOORS } from "../../engine/board";
import type { GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import type { InputKind } from "@/shared/lib/input";
import type { RuleNotes } from "../../data/rule-notes";
import { inspectRoomId, roomLines, thingLines } from "../../play/inspect";
import type { ShownThing } from "../../play/things";
import type { FloorId } from "../../types";
import { PromptButton } from "../prompts";
import { ruleNotes } from "../why";
import { MOOD_BG } from "./moods";

/*
 * Details: what is useful to know at a glance, over the house while the
 * player holds them up (`details-hold.ts`), and gone the moment they let go.
 * Each room is named by its back wall, with where its stairs lead; each
 * thing in a room is named where it lies, a room's objects in one list over
 * their spot; and each explorer's mark adds the explorer's name and its
 * stats (`figure-marks.tsx`). Everything here comes from the seat's own view.
 *
 * Pointing while the details are held inspects (`play/inspect.ts`): the
 * label of whatever is pointed at expands in place with a line from the
 * rules' text, and no pointing tag shows. Each thing keeps one label.
 */

/** How high over the floor a thing's label stands, in metres: over its plate. */
const THING_HEIGHT = 0.3;

interface Detail {
  id: string;
  at: Pin["at"];
  height: number;
  lift: number;
  apart: boolean;
}

/** A room's stairs, where they lead to another floor than its own. */
function stairsTo(view: GameView, tile: string, floor: FloorId): FloorId | null {
  const to = ENGINE.catalog.rooms[tile].links.flatMap((link) => view.board.tiles.find((placed) => placed.tile === link)?.floor ?? []);
  return to.find((other) => other !== floor) ?? null;
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface HouseDetailsProps {
  scene: HouseScene;
  view: GameView;
  things: readonly ShownThing[];
  /** What pointing has found (`play/inspect.ts` names the ids), its label expanded; null for none. */
  inspected: string | null;
}

/** The room names and the things' labels, pinned over the house. */
export function HouseDetails(props: HouseDetailsProps) {
  return (
    <Suspense fallback={<Labels {...props} notes={null} />}>
      <WithNotes {...props} />
    </Suspense>
  );
}

function WithNotes(props: HouseDetailsProps) {
  // The rules' text is loaded only once something is inspected.
  return props.inspected === null ? <Labels {...props} notes={null} /> : <Labels {...props} notes={use(ruleNotes())} />;
}

function Labels({ scene, view, things, inspected, notes }: HouseDetailsProps & { notes: RuleNotes | null }) {
  const ref = useRef<HTMLDivElement>(null);
  // A room's objects share one spot, so they share one label: its first object holds the pin.
  const lying = new Map<string, ShownThing[]>();
  for (const thing of things) if (thing.place.kind === "floor") lying.set(thing.room, [...(lying.get(thing.room) ?? []), thing]);
  const standing = things.filter((thing) => thing.place.kind !== "floor");
  const details: (Detail & { node: ReactNode })[] = [
    ...view.board.tiles.map(({ tile, floor }) => {
      const stairs = stairsTo(view, tile, floor);
      const Arrow = stairs !== null && FLOORS.indexOf(stairs) > FLOORS.indexOf(floor) ? ArrowUp : ArrowDown;
      const explained = inspected === inspectRoomId(tile) && notes !== null ? roomLines(notes, tile) : null;
      return {
        id: `room:${tile}`,
        at: { room: tile, far: true },
        height: 0,
        lift: 1,
        // Rooms never move aside: each has its own place, and the marks and labels over it are what matters.
        apart: false,
        node: (
          <span data-detail-room={tile} data-inspected={explained !== null || undefined} className={`flex flex-col items-center rounded bg-(--bt-bg)/80 px-1.5 text-center text-[11px] leading-3.5 text-(--bt-ink) ${explained === null ? "max-w-32" : "max-w-56 ring-1 ring-(--bt-accent)"}`}>
            <span className="font-semibold tracking-wide uppercase">{ENGINE.catalog.rooms[tile].name}</span>
            {stairs !== null && (
              <span className="inline-flex items-center gap-0.5">
                <Arrow aria-hidden className="size-3" />
                <span>{capitalised(FLOOR_NAMES[stairs])}</span>
              </span>
            )}
            {explained?.map((line) => (
              <span key={line} className="pb-0.5">
                {line}
              </span>
            ))}
          </span>
        ),
      };
    }),
    ...[...lying.values()].map((group) => ({
      id: `things:${group[0].room}`,
      at: { thing: group[0].id },
      height: THING_HEIGHT,
      lift: 1,
      apart: true,
      node: <ThingNames things={group} inspected={inspected} notes={notes} />,
    })),
    ...standing.map((thing) => ({
      id: `thing:${thing.id}`,
      at: { thing: thing.id },
      height: THING_HEIGHT,
      lift: 1,
      apart: true,
      node: <ThingNames things={[thing]} inspected={inspected} notes={notes} />,
    })),
  ];
  // Each element carries its pin, so the pins are set again only when what they say changes.
  const pinOf = ({ at, height, lift, apart }: Detail) => JSON.stringify({ at, height, lift, apart });
  const key = details.map(pinOf).join("|");

  useEffect(() => {
    const root = ref.current;
    if (!root) throw new Error("The details have no element");
    const pins = [...root.children].map((element): Pin => {
      if (!(element instanceof HTMLElement) || element.dataset.pin === undefined) throw new Error("A detail has no pin");
      return { element, ...(JSON.parse(element.dataset.pin) as Omit<Pin, "element" | "clamp">), clamp: false };
    });
    scene.setPins("details", pins);
    return () => {
      scene.setPins("details", []);
    };
  }, [scene, key]);

  return (
    <div ref={ref} aria-label="Details" className="contents">
      {details.map((detail) => (
        <div key={detail.id} data-pin={pinOf(detail)} className="pointer-events-none invisible absolute top-0 left-0">
          {detail.node}
        </div>
      ))}
    </div>
  );
}

function ThingNames({ things, inspected, notes }: { things: readonly ShownThing[]; inspected: string | null; notes: RuleNotes | null }) {
  const open = things.some((thing) => thing.id === inspected);
  return (
    <ul className={`flex flex-col gap-px rounded border bg-(--bt-panel)/90 px-1.5 py-0.5 text-[11px] leading-3.5 ${open ? "max-w-56 border-(--bt-accent)" : "border-(--bt-line)"}`}>
      {things.map((thing) => {
        const explained = thing.id === inspected && notes !== null ? thingLines(notes, thing) : [];
        return (
          <li key={thing.id} data-detail-thing={thing.id} data-inspected={thing.id === inspected || undefined} className="flex flex-col">
            <span className="flex items-center gap-1 whitespace-nowrap">
              <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${MOOD_BG[thing.mood]}`} />
              <span className={thing.id === inspected ? "font-semibold" : ""}>{thing.name}</span>
            </span>
            {explained.map((line) => (
              <span key={line} className="line-clamp-3 pl-3">
                {line}
              </span>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

/** The on-screen button that shows the details while it is held, as Z or a controller's R3 does. */
export function DetailsButton({ held, hold, input, className }: { held: boolean; hold: (on: boolean) => void; input: InputKind; className: string }) {
  return (
    <PromptButton
      meaning="details"
      input={input}
      aria-label="Show the details"
      aria-pressed={held}
      title="Rooms, things and every explorer's stats"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        hold(true);
      }}
      onPointerUp={() => {
        hold(false);
      }}
      onPointerCancel={() => {
        hold(false);
      }}
      // A long press would otherwise open the page's menu over the house.
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      className={`touch-none select-none ${className}`}
    >
      Details
    </PromptButton>
  );
}
