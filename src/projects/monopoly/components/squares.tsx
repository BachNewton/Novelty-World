"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { SPACES } from "../data";
import { LANE_TOKEN_PX, STRIP_LEFT_PX, lanePitch, laneOffset } from "../lanes";
import { glideAnimMs, slideAnimMs } from "../pacing";
import { useMonopolyStore } from "../store";
import { PLAYER_COLOR_VAR } from "../theme";
import { useTokenAnim } from "../token-anim-store";
import type { Player } from "../types";
import { PlayerToken } from "./player-token";
import { SquareRow } from "./square-row";

// Each row is 44px (h-11). The 1px divider is painted as an inset bottom
// shadow on the row itself, so it doesn't add to the row's box.
const ROW_PX = 44;
const CYCLE_PX = SPACES.length * ROW_PX;

// On each turn the active player's square is parked just under the header, so
// the squares ahead of them fill the screen. The camera then holds still while
// they move — you watch the token slide down — and only scrolls to follow if
// the move would carry the token within this margin of the bottom edge.
const ANCHOR_TOP_PX = 4;
const FOLLOW_BOTTOM_GAP = ROW_PX * 1.5;

// The overlay token rides the same per-player lanes as the static tokens: its x
// is the strip's left edge plus the player's lane offset, so it slides and
// trails in the column its static copy occupies. See `lanes.ts` and the
// `TokenStrip` in square-row.tsx.

// Slides up to a die roll's reach (incl. passing GO) animate; longer jumps
// (teleports, "advance to" cards, going to jail) cut instantly so the token
// never zips the wrong way around the board.
//
// All sub-timings (glide ms, slide ms) now derive from the store's per-client
// `TURN_MS` via `glideAnimMs` / `slideAnimMs` — the board no longer owns
// pacing. Each playback-head change is one atomic transition (a glide to a new
// active player, or a token slide); the store budgets the dwell that holds
// after each, so this component just animates the motion and lets the hold
// fall out of the next snapshot's arrival.
const MAX_SLIDE_ROWS = 12;

interface ActivePlayer {
  id: string;
  position: number;
  // Seat index in the roster — the player's fixed lane (see `lanes.ts`).
  seat: number;
}

// Render + animation data for the overlay token mid-move. The token is parked
// at fromTop; the slide effect carries it to toTop.
interface MovingToken {
  player: Player;
  // Left edge of the token's lane (content coords) — its fixed column.
  laneX: number;
  fromTop: number;
  toTop: number;
  trailTop: number;
  trailHeight: number;
  durationMs: number;
  // Center of the landing square (content coords) for the off-screen check.
  endCenter: number;
  // Viewport height measured when the move was detected. The viewport can't
  // resize mid-slide, so this equals what the slide effect would read live —
  // capturing it here keeps the off-screen check reading from a single source.
  viewportHeight: number;
  // Whether the camera should follow this slide off the bottom edge. Captured
  // at move time so a mid-slide follow toggle doesn't change an in-flight hop.
  follow: boolean;
}

const clampCopy = (n: number) => Math.max(0, Math.min(2, n));
const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// Scroll offset that parks `position`'s row at the top anchor, normalized into
// the middle band so the infinite-scroll snap never fires from a camera write.
const bandedAnchor = (position: number) => {
  let top = position * ROW_PX - ANCHOR_TOP_PX;
  while (top < CYCLE_PX * 0.5) top += CYCLE_PX;
  while (top >= CYCLE_PX * 1.5) top -= CYCLE_PX;
  return top;
};

// SquareRow subscribes to the store per-instance, so Squares doesn't take
// or thread state — it lays out three copies of the board, handles the
// infinite-scroll snap-back, follows the active player, and animates moves.
export function Squares() {
  const ref = useRef<HTMLDivElement>(null);
  // Camera mode. Starts in follow; any manual scroll drops to free view, and
  // only the Follow pill re-enters. Per-viewer UI, not gameplay — local state.
  const [following, setFollowing] = useState(true);

  const active = useMonopolyStore(
    useShallow((s): ActivePlayer | null => {
      const seat = s.state.players.findIndex(
        (pl) => pl.id === s.state.turn.playerId,
      );
      if (seat < 0) return null;
      const p = s.state.players[seat];
      return { id: p.id, position: p.position, seat };
    }),
  );

  // Lane geometry: track the board's width and the roster size, and publish the
  // resulting lane pitch so every SquareRow's TokenStrip and the overlay below
  // lay tokens out in the same per-player columns. See `lanes.ts`.
  const playerCount = useMonopolyStore((s) => s.state.players.length);
  const [boardWidth, setBoardWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBoardWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    useTokenAnim.getState().setLanePitch(lanePitch(playerCount, boardWidth));
  }, [playerCount, boardWidth]);

  // True while a follow scroll is animating, so the infinite-scroll snap-back
  // (handleScroll) holds off — a ±CYCLE snap mid-scroll would jump the overlay
  // token, which lives in scroll-content coordinates. Left out-of-band scroll
  // is harmless (every copy is identical) and self-corrects on the next user
  // scroll or handoff anchor.
  const suppressSnap = useRef(false);
  const scrollRaf = useRef<number | null>(null);

  // Park a given board square just under the header (instant). Used for the
  // non-sliding cases (mount, follow toggle, teleports).
  const anchorTop = useCallback((position: number) => {
    const el = ref.current;
    if (el) el.scrollTop = bandedAnchor(position);
  }, []);

  const anchorActiveTop = useCallback(() => {
    const s = useMonopolyStore.getState().state;
    const p = s.players.find((pl) => pl.id === s.turn.playerId);
    if (!ref.current) return;
    if (!p) {
      ref.current.scrollTop = CYCLE_PX;
      return;
    }
    anchorTop(p.position);
  }, [anchorTop]);

  const animateScroll = useCallback(
    (
      el: HTMLDivElement,
      target: number,
      durationMs: number,
      onDone?: () => void,
    ) => {
      if (scrollRaf.current !== null) cancelAnimationFrame(scrollRaf.current);
      suppressSnap.current = true;
      const start = el.scrollTop;
      const startedAt = performance.now();
      const step = (now: number) => {
        const t = durationMs <= 0 ? 1 : Math.min(1, (now - startedAt) / durationMs);
        el.scrollTop = start + (target - start) * easeInOut(t);
        if (t < 1) {
          scrollRaf.current = requestAnimationFrame(step);
        } else {
          scrollRaf.current = null;
          suppressSnap.current = false;
          onDone?.();
        }
      };
      scrollRaf.current = requestAnimationFrame(step);
    },
    [],
  );

  // Smoothly scroll a board square to the top anchor — the `glide` transition
  // when a turn hands off to a new active player. Distance-scaled within the
  // glide phase's budget (see `glideAnimMs`), leaving the rest of the dwell as
  // an orient hold. No-op when already there (avoids a zero-length animation).
  const glideToAnchor = useCallback(
    (el: HTMLDivElement, target: number) => {
      const distance = Math.abs(target - el.scrollTop);
      if (distance < 1) return;
      const { turnMs } = useMonopolyStore.getState();
      animateScroll(el, target, glideAnimMs(turnMs, distance));
    },
    [animateScroll],
  );

  // Re-enter follow when toggling on (and on mount): jump the active player to
  // the top. Keyed on `following` only, so a mid-turn move never re-anchors.
  useEffect(() => {
    if (following) anchorActiveTop();
  }, [following, anchorActiveTop]);

  // A wheel/touch gesture is unambiguously user-driven (the scrollbar is
  // hidden), so it — not the onScroll event, which also fires for our own
  // anchor + follow + snap-back writes — is what drops us out of follow mode.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const exit = () => setFollowing(false);
    el.addEventListener("wheel", exit, { passive: true });
    el.addEventListener("touchmove", exit, { passive: true });
    return () => {
      el.removeEventListener("wheel", exit);
      el.removeEventListener("touchmove", exit);
    };
  }, []);

  // --- Moving-token animation -------------------------------------------
  const [moving, setMoving] = useState<MovingToken | null>(null);
  const tokenRef = useRef<HTMLDivElement>(null);
  // Last board position we recorded for each player. Seeded once from the full
  // roster so even a player's first move animates from the right square. Every
  // authoritative update is a single unit (the route applies one beat per
  // call), so a roll lands as its own commit and the diff against this map
  // drives the slide. Only the active player moves on a given turn, so updating
  // the active entry keeps the whole map current.
  const prevPos = useRef<Map<string, number> | null>(null);
  // The active player id at the last effect run, so we can tell a turn handoff
  // (id changed) from the same player moving. Each authoritative update is a
  // single unit, so the handoff arrives as its own commit — before the new
  // player has rolled — and needs a smooth camera glide, not an instant snap.
  const lastActiveId = useRef<string | null>(null);

  const endAnim = useCallback(() => {
    if (scrollRaf.current !== null) {
      cancelAnimationFrame(scrollRaf.current);
      scrollRaf.current = null;
    }
    suppressSnap.current = false;
    setMoving(null);
    useTokenAnim.getState().clear();
  }, []);

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const prevActiveId = lastActiveId.current;
    lastActiveId.current = active.id;
    const isHandoff = prevActiveId !== null && prevActiveId !== active.id;

    if (prevPos.current === null) {
      prevPos.current = new Map(
        useMonopolyStore
          .getState()
          .state.players.map((p) => [p.id, p.position]),
      );
    }
    const map = prevPos.current;
    const from = map.get(active.id);
    map.set(active.id, active.position);

    const forward =
      from === undefined ? 0 : (active.position - from + 40) % 40;
    const signed = forward <= 20 ? forward : forward - 40;
    // Not a slide (first time we see this player, they didn't move, or a
    // teleport like jail / "advance to" cards): re-anchor, no slide.
    if (from === undefined || signed === 0 || Math.abs(signed) > MAX_SLIDE_ROWS) {
      if (following) {
        // A handoff is its own `glide` transition — glide the camera to the new
        // active player so the next turn doesn't snap into view. Same-player
        // non-moves (teleports) still snap.
        if (isHandoff) glideToAnchor(el, bandedAnchor(active.position));
        else anchorActiveTop();
      }
      return;
    }

    const player = useMonopolyStore
      .getState()
      .state.players.find((p) => p.id === active.id);
    if (!player) return;

    // Geometry of the hop, starting from wherever the token currently sits on
    // screen. A fresh turn's handoff glide already parked the start square near
    // the top; a doubles re-roll just continues from where the last slide left
    // off (no re-anchor). The copy math finds the nearest board copy in both
    // cases, so one path serves follow and free view.
    const viewCenter = el.scrollTop + el.clientHeight / 2;
    const copy = clampCopy(
      Math.round((viewCenter - (from * ROW_PX + ROW_PX / 2)) / CYCLE_PX),
    );
    const startCenter = (copy * SPACES.length + from) * ROW_PX + ROW_PX / 2;
    const endCenter = startCenter + signed * ROW_PX;
    const durationMs = slideAnimMs(useMonopolyStore.getState().turnMs, signed);
    // Slide and trail in the player's fixed lane, reading the live pitch
    // published by the measurement effect above.
    const laneX =
      STRIP_LEFT_PX + laneOffset(active.seat, useTokenAnim.getState().lanePitch);

    // Package the hop; the slide effect below plays it.
    setMoving({
      player,
      laneX,
      fromTop: startCenter - LANE_TOKEN_PX / 2,
      toTop: endCenter - LANE_TOKEN_PX / 2,
      trailTop: Math.min(startCenter, endCenter),
      trailHeight: Math.abs(signed) * ROW_PX,
      durationMs,
      endCenter,
      viewportHeight: el.clientHeight,
      follow: following,
    });
    // Hide the static copy of the token at its destination row so it isn't
    // drawn twice while the overlay slides; the slide effect reveals it again.
    useTokenAnim.getState().hide(active.id, active.position);
  }, [active, following, anchorActiveTop, glideToAnchor]);

  // Play a slide transition: move the token to its landing, following the
  // camera only if the hop would carry it past the bottom margin. The orient
  // hold and landing hold are not timers here — they're the dwell the store
  // budgets before the next snapshot arrives, so this effect just animates the
  // motion. setMoving(null) runs only via the slide's onfinish (endAnim),
  // never directly, so this effect stays cascade-free.
  //
  // Driven imperatively (Web Animations API) rather than a re-render-timed CSS
  // transition: the move commit also re-renders the hidden destination row, and
  // competing renders were swallowing a transition flip. A new move cancels the
  // in-flight animation.
  useEffect(() => {
    if (!moving) return;
    const tokenEl = tokenRef.current;
    const scrollEl = ref.current;
    if (!tokenEl || !scrollEl) return;
    const { fromTop, toTop, durationMs, endCenter, viewportHeight, follow } =
      moving;

    const slide = tokenEl.animate(
      [
        { transform: "translateY(0px)" },
        { transform: `translateY(${toTop - fromTop}px)` },
      ],
      { duration: durationMs, easing: "ease-in-out", fill: "forwards" },
    );
    slide.onfinish = endAnim;
    // Follow only if the landing would fall past the bottom margin; otherwise
    // hold the camera still and let the token slide down into view.
    if (follow) {
      const overflow =
        endCenter - scrollEl.scrollTop - (viewportHeight - FOLLOW_BOTTOM_GAP);
      if (overflow > 0) {
        animateScroll(scrollEl, scrollEl.scrollTop + overflow, durationMs);
      }
    }

    return () => {
      slide.cancel();
    };
  }, [moving, endAnim, animateScroll]);

  // When the user crosses into the prev/next copy, silently snap back into
  // the middle copy. The jump is invisible because all three copies render
  // identical content at identical offsets (mod CYCLE_PX).
  const handleScroll = () => {
    const el = ref.current;
    if (!el || suppressSnap.current) return;
    if (el.scrollTop < CYCLE_PX * 0.5) {
      el.scrollTop += CYCLE_PX;
    } else if (el.scrollTop >= CYCLE_PX * 1.5) {
      el.scrollTop -= CYCLE_PX;
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        onScroll={handleScroll}
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {[0, 1, 2].flatMap((copy) =>
          SPACES.map((_, position) => (
            <SquareRow key={`${copy}-${position}`} position={position} />
          )),
        )}
        {moving && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{
                left: moving.laneX + LANE_TOKEN_PX / 2 - 2,
                top: moving.trailTop,
                width: 4,
                height: moving.trailHeight,
                backgroundColor: PLAYER_COLOR_VAR[moving.player.color],
                opacity: 0.35,
                zIndex: 9,
              }}
            />
            <div
              ref={tokenRef}
              className="pointer-events-none absolute"
              style={{
                left: moving.laneX,
                top: moving.fromTop,
                width: LANE_TOKEN_PX,
                height: LANE_TOKEN_PX,
                zIndex: 10,
              }}
            >
              <PlayerToken player={moving.player} className="h-full w-full" />
            </div>
          </>
        )}
      </div>
      {!following && active && (
        <FollowPill onClick={() => setFollowing(true)} />
      )}
    </div>
  );
}

function FollowPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // The pill follows whoever is active, not a named player, so its label is
      // constant — it sizes to its content with no reflow. z-20 keeps it above
      // the tokens on the overlay/board so it stays visible and clickable.
      className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg"
      style={{
        backgroundColor: "var(--mono-card)",
        borderColor: "var(--mono-ink)",
        color: "var(--mono-ink)",
      }}
    >
      <LocateFixed className="h-3.5 w-3.5" strokeWidth={2.5} />
      <span>Follow active player</span>
    </button>
  );
}
