"use client";

import { Suspense, use, useEffect, useRef } from "react";
import type { HouseScene } from "../../art/house-scene";
import type { RuleNotes } from "../../data/rule-notes";
import type { InputKind } from "../../input/controls";
import type { PanelChoice } from "../../play/choices";
import { CLUSTER_SHOWN, type Clusters, type RoomThing, type ShownThing } from "../../play/things";
import type { Action } from "../../types";
import { ruleNotes } from "../why";
import { CardFace } from "./card-face";
import { MOOD_BG, MOOD_BORDER } from "./moods";
import { enterLayer } from "./pad-focus";
import { Prompt } from "../prompts";

/*
 * The things in the rooms, read: pointing at one names it (the house's tag
 * over it, `ThingTag`), and choosing it opens its reader over it, as a
 * nameplate opens a figure's card. A card lying on the floor reads as the
 * card, with Pick up where the turn offers it: the same choice as the
 * explorer sheet's row for it, so both name one thing. A token reads as the
 * card that placed it. A pile of the rest of a cluster reads as each of its
 * cards. A cluster past what it shows one by one carries a count.
 */

/** How high over its floor a reader opens, in metres: over the thing, clear of the figures round it. */
const READER_HEIGHT = 0.5;
const BADGE_HEIGHT = 0.4;

/** What pointing at a thing shows: its colour and its name, and on a pad or keys the control that reads it. */
export function ThingTag({ thing, input }: { thing: ShownThing; input: InputKind }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`inline-block size-2.5 rounded-full ${MOOD_BG[thing.mood]}`} />
      {thing.name}
      <Prompt meaning="confirm" input={input} size={16} />
    </span>
  );
}

/** Keeps an element over a thing while it is mounted. */
function usePinnedOver(scene: HouseScene, group: string, thing: string, { height, lift, clamp }: { height: number; lift: number; clamp: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) throw new Error(`The ${group} pin has no element`);
    scene.setPins(group, [{ element, at: { thing }, height, lift, clamp, apart: false }]);
    return () => {
      scene.setPins(group, []);
    };
  }, [scene, group, thing, height, lift, clamp]);
  return ref;
}

export interface ThingReaderProps {
  scene: HouseScene;
  thing: ShownThing;
  /** Every thing in the house, by id: what a pile stands for. */
  things: readonly RoomThing[];
  /** The turn's Pick up for each card on the floor, by card id, where the turn offers it. */
  pickUps: ReadonlyMap<string, PanelChoice>;
  act: (action: Action) => void;
  input: InputKind;
  close: () => void;
}

/** A thing's reader, over it: its card's text, and Pick up where the turn offers it. */
export function ThingReader(props: ThingReaderProps) {
  const { scene, thing, input, close } = props;
  const ref = usePinnedOver(scene, "reader", thing.id, { height: READER_HEIGHT, lift: 1, clamp: true });
  const section = useRef<HTMLElement>(null);
  // It takes the pad's focus once the scene has put it over its thing and it shows.
  useEffect(() => {
    const pinned = ref.current;
    const dialog = section.current;
    if (!pinned || !dialog) throw new Error("The reader has no element");
    const enter = () => {
      if (pinned.style.visibility !== "visible") return;
      observer.disconnect();
      enterLayer(dialog);
    };
    const observer = new MutationObserver(enter);
    observer.observe(pinned, { attributes: true, attributeFilter: ["style"] });
    enter();
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return (
    <div ref={ref} className="pointer-events-none invisible absolute top-0 left-0 w-[min(22rem,calc(100vw-1rem))]">
      <section
        ref={section}
        role="dialog"
        aria-label={thing.name}
        data-pad-layer="1"
        data-reader={thing.id}
        className={`pointer-events-auto flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto rounded border bg-(--bt-panel) p-2 ${MOOD_BORDER[thing.mood]}`}
      >
        <Suspense fallback={<ReaderBody {...props} notes={null} />}>
          <WithNotes {...props} />
        </Suspense>
        <button type="button" data-pad-back onClick={close} className="inline-flex min-h-9 items-center gap-1.5 self-end rounded border border-(--bt-line) px-3 text-sm hover:border-(--bt-accent)">
          Close
          <Prompt meaning="back" input={input} size={16} />
        </button>
      </section>
    </div>
  );
}

function WithNotes(props: ThingReaderProps) {
  return <ReaderBody {...props} notes={use(ruleNotes())} />;
}

const ACTION = "min-h-10 self-start rounded border border-(--bt-line) bg-(--bt-room) px-3 py-1 text-left text-sm hover:border-(--bt-accent)";

function ReaderBody({ thing, things, pickUps, act, notes }: ThingReaderProps & { notes: RuleNotes | null }) {
  const standsFor = thing.things.map((id) => {
    const found = things.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`${thing.id} stands for ${id}, which isn't in the house`);
    return found;
  });
  const pickUpOf = (each: RoomThing) => (each.token === null && each.card !== null ? (pickUps.get(each.card) ?? null) : null);
  // The first Pick up takes the pad's focus as the reader opens.
  const first = standsFor.find((each) => pickUpOf(each) !== null)?.id;
  return (
    <ul className="flex flex-col gap-1.5">
      {standsFor.map((each) => {
        const pickUp = pickUpOf(each);
        return (
          <li key={each.id} className="flex flex-col gap-1">
            {each.token !== null && <p className="text-sm font-semibold">{each.name}</p>}
            {each.card !== null && <CardFace card={each.card} notes={notes} />}
            {pickUp && (
              <button type="button" data-pad-start={each.id === first || undefined} onClick={() => act(pickUp.action)} className={ACTION}>
                Pick up
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A count over each cluster showing more objects than it shows one by one. */
export function ClusterCounts({ scene, clusters, shown }: { scene: HouseScene; clusters: Clusters; shown: readonly ShownThing[] }) {
  const piles = Object.entries(clusters).filter(([id, cluster]) => cluster.things.length > CLUSTER_SHOWN && shown.some((thing) => thing.id === id));
  return piles.map(([id, cluster]) => <ClusterCount key={id} scene={scene} pile={id} count={cluster.things.length} />);
}

function ClusterCount({ scene, pile, count }: { scene: HouseScene; pile: string; count: number }) {
  const ref = usePinnedOver(scene, `count:${pile}`, pile, { height: BADGE_HEIGHT, lift: 1, clamp: false });
  return (
    <div ref={ref} className="pointer-events-none invisible absolute top-0 left-0">
      <span aria-label={`${count} things here`} data-count={pile} className="rounded-full border border-(--bt-line) bg-(--bt-panel) px-1.5 text-xs font-semibold">
        {count}
      </span>
    </div>
  );
}
