"use client";

import { Check } from "lucide-react";
import { Suspense, use, useEffect, useRef } from "react";
import type { HouseScene, Pin } from "../../art/house-scene";
import { TILE } from "../../art/room";
import type { RuleNotes } from "../../data/rule-notes";
import type { GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import { bonusLines } from "../../play/inspect";
import { bonusBadges, type BonusBadge } from "../../play/room-bonus";
import type { FigureId } from "../../types";
import { TraitIcon, traitLabel } from "../icons";
import { ruleNotes } from "../why";
import { seatDot } from "./seat-colour";

/*
 * Room bonuses in the house: each bonus room carries its trait's icon as a
 * small badge on its floor, in a corner clear of the doorways. For the
 * explorer whose turn it is it is lit while they can still take it, and dim
 * with a tick once they have. Held up, the details expand it to the seat
 * colours of everyone who has taken it; inspected, it adds the room's rule
 * and their names. It is a flat mark drawn over the floor, never a model on
 * a plate, so it never reads as a card lying there.
 */

/** How high over the floor a badge stands, in metres: just off it. */
const BADGE_HEIGHT = 0.05;

const LOOK: Record<NonNullable<BonusBadge["state"]> | "none", string> = {
  available: "border-(--bt-mood-holy) text-(--bt-mood-holy) shadow-[0_0_0.5em_var(--bt-mood-holy)]",
  taken: "border-(--bt-muted) text-(--bt-muted)",
  none: "border-(--bt-line) text-(--bt-ink)",
};

const stateWords = (badge: BonusBadge) => (badge.state === "taken" ? "taken" : badge.state === "available" ? "yours to take" : "");

function Badge({ view, badge, details, inspected, notes }: { view: GameView; badge: BonusBadge; details: boolean; inspected: boolean; notes: RuleNotes | null }) {
  const traits = badge.traits.map(traitLabel).join(" or ");
  const icons = badge.traits.map((trait) => <TraitIcon key={trait} trait={trait} className="size-[1em] shrink-0" />);
  if (!details) {
    return (
      <span
        role="img"
        aria-label={`${ENGINE.catalog.rooms[badge.room].name}: +1 ${traits} once a game${badge.state ? `, ${stateWords(badge)}` : ""}`}
        data-bonus-badge={badge.room}
        data-state={badge.state ?? "none"}
        className={`relative flex size-[2em] items-center justify-center rounded-full border-2 bg-(--bt-bg)/85 text-[calc(1rem*var(--bt-pin-scale,1))] ${LOOK[badge.state ?? "none"]}`}
      >
        {icons}
        {badge.state === "taken" && (
          <span className="absolute -right-[0.35em] -bottom-[0.35em] flex size-[0.9em] items-center justify-center rounded-full bg-(--bt-ink) text-(--bt-bg)">
            <Check aria-hidden className="size-[0.7em]" strokeWidth={4} />
          </span>
        )}
      </span>
    );
  }
  return (
    <span
      data-bonus-badge={badge.room}
      data-state={badge.state ?? "none"}
      data-inspected={inspected || undefined}
      className={`flex flex-col gap-0.5 rounded border bg-(--bt-panel)/90 px-1.5 py-0.5 text-[11px] leading-3.5 text-(--bt-ink) ${inspected ? "max-w-48 border-(--bt-accent)" : "border-(--bt-line)"}`}
    >
      <span className="flex items-center gap-1 whitespace-nowrap">
        <span className={`flex items-center ${badge.state === "taken" ? "text-(--bt-muted)" : "text-(--bt-mood-holy)"}`}>{icons}</span>
        <span className="font-semibold">+1</span>
        <span aria-label={`Taken by ${badge.takers.length}`} className="flex items-center gap-0.5">
          {badge.takers.length === 0 ? <span className="text-(--bt-muted)">no one yet</span> : badge.takers.map((figure) => <span key={figure} data-taker={figure} className={`inline-block size-2 rounded-full ${seatDot(ENGINE, view.figures[figure].definition)}`} />)}
        </span>
      </span>
      {inspected && notes !== null && bonusLines(ENGINE, view, notes, badge.room).map((line) => <span key={line}>{line}</span>)}
    </span>
  );
}

interface RoomBadgesProps {
  scene: HouseScene;
  view: GameView;
  /** The explorer whose turn it is, whom the badges are lit for; null between turns. */
  active: FigureId | null;
  details: boolean;
  inspected: string | null;
}

/** Every bonus room's badge, pinned to its floor. */
export function RoomBadges(props: RoomBadgesProps) {
  return (
    <Suspense fallback={<Badges {...props} notes={null} />}>
      <WithNotes {...props} />
    </Suspense>
  );
}

function WithNotes(props: RoomBadgesProps) {
  // The rules' text is loaded only once something is inspected.
  return props.details && props.inspected !== null ? <Badges {...props} notes={use(ruleNotes())} /> : <Badges {...props} notes={null} />;
}

function Badges({ scene, view, active, details, inspected, notes }: RoomBadgesProps & { notes: RuleNotes | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const badges = bonusBadges(ENGINE, view, active, TILE / 2);
  // Held up, it hangs below its spot: a room's name stands above its own point, and the two may meet.
  const pinOf = (badge: BonusBadge): Omit<Pin, "element"> => ({ at: { room: badge.room, spot: badge.at }, height: BADGE_HEIGHT, lift: details ? -0.6 : 0.5, clamp: false, apart: true, inspect: badge.id });
  const key = badges.map((badge) => JSON.stringify(pinOf(badge))).join("|");
  useEffect(() => {
    const root = ref.current;
    if (!root) throw new Error("The room badges have no element");
    const pins = [...root.children].map((element): Pin => {
      if (!(element instanceof HTMLElement) || element.dataset.pin === undefined) throw new Error("A room badge has no pin");
      return { element, ...(JSON.parse(element.dataset.pin) as Omit<Pin, "element">) };
    });
    scene.setPins("room-badges", pins);
    return () => {
      scene.setPins("room-badges", []);
    };
  }, [scene, key]);
  return (
    <div ref={ref} aria-label="Room bonuses" className="contents">
      {badges.map((badge) => (
        <div key={badge.id} data-pin={JSON.stringify(pinOf(badge))} className="pointer-events-none invisible absolute top-0 left-0">
          <Badge view={view} badge={badge} details={details} inspected={inspected === badge.id} notes={notes} />
        </div>
      ))}
    </div>
  );
}
