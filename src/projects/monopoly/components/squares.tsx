"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { SPACES } from "../data";
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

// Geometry of the animated token. The strip starts after the 72px left panel,
// the context panel's 8px left padding, and the 150px name cell — so a token's
// first (leftmost) slot sits at this x, which is where the overlay token both
// starts and lands. See `TokenStrip` in square-row.tsx.
const TOKEN_PX = 30;
const LANE_X = 72 + 8 + 150;

// Slides up to a die roll's reach (incl. passing GO) animate; longer jumps
// (teleports, "advance to" cards, going to jail) cut instantly so the token
// never zips the wrong way around the board.
const MAX_SLIDE_ROWS = 12;
const ANIM_BASE_MS = 140;
const ANIM_PER_ROW_MS = 40;
const ANIM_MAX_MS = 600;

// Smooth camera glide that re-anchors the active player at the top — used in
// follow mode between turns and between doubles rolls. Scaled by distance so a
// short hop is quick and a board-spanning jump still finishes promptly.
const ANCHOR_SCROLL_BASE_MS = 180;
const ANCHOR_SCROLL_PER_PX = 0.35;
const ANCHOR_SCROLL_MAX_MS = 600;

// Beat between the camera settling on the player and the move playing, so each
// auto-step turn reads as: glide to player → pause → roll/slide → pause → next.
// The trailing pause is just the idle time left before the next step fires.
const CONTEXT_PAUSE_MS = 350;

interface ActivePlayer {
  id: string;
  position: number;
}

// Render + animation data for the overlay token mid-move. The token is parked
// at fromTop; the slide effect carries it to toTop.
interface MovingToken {
  player: Player;
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
  // Scroll offset to glide the start square to the top before sliding, or null
  // to slide in place (free view).
  anchorTarget: number | null;
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
      const p = s.state.players.find((pl) => pl.id === s.state.turn.playerId);
      return p ? { id: p.id, position: p.position } : null;
    }),
  );

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
  // roster so even a player's first move animates from the right square — and
  // crucially, so a move still animates when the engine folds the turn handoff
  // and the next player's roll into one state commit (which it does for every
  // turn after the game's opening roll). Only the active player moves on a
  // given turn, so updating the active entry keeps the whole map current.
  const prevPos = useRef<Map<string, number> | null>(null);

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
    // Not a move (first time we see this player, they didn't move, or a
    // teleport like jail / "advance to" cards): just re-anchor, no slide.
    if (from === undefined || signed === 0 || Math.abs(signed) > MAX_SLIDE_ROWS) {
      if (following) anchorActiveTop();
      return;
    }

    const player = useMonopolyStore
      .getState()
      .state.players.find((p) => p.id === active.id);
    if (!player) return;

    // Geometry of the hop in scroll-content coordinates. When following, the
    // start square will sit at the top anchor, so derive it from that target;
    // in free view, place it on whichever board copy is nearest what's shown.
    let startCenter: number;
    let anchorTarget: number | null = null;
    if (following) {
      anchorTarget = bandedAnchor(from);
      startCenter = anchorTarget + ANCHOR_TOP_PX + ROW_PX / 2;
    } else {
      const viewCenter = el.scrollTop + el.clientHeight / 2;
      const copy = clampCopy(
        Math.round((viewCenter - (from * ROW_PX + ROW_PX / 2)) / CYCLE_PX),
      );
      startCenter = (copy * SPACES.length + from) * ROW_PX + ROW_PX / 2;
    }
    const endCenter = startCenter + signed * ROW_PX;
    const durationMs = Math.min(
      ANIM_BASE_MS + Math.abs(signed) * ANIM_PER_ROW_MS,
      ANIM_MAX_MS,
    );

    // Package the hop; the slide effect below plays it.
    setMoving({
      player,
      fromTop: startCenter - TOKEN_PX / 2,
      toTop: endCenter - TOKEN_PX / 2,
      trailTop: Math.min(startCenter, endCenter),
      trailHeight: Math.abs(signed) * ROW_PX,
      durationMs,
      endCenter,
      viewportHeight: el.clientHeight,
      anchorTarget,
    });
    // Hide the static copy of the token at its destination row so it isn't
    // drawn twice while the overlay slides; the slide effect reveals it again.
    useTokenAnim.getState().hide(active.id, active.position);
  }, [active, following, anchorActiveTop]);

  // Play each move's beat: glide the start square to the top (follow mode),
  // pause so the player reads where they are, then slide the token to the
  // landing — scrolling further only if it would fall off the bottom. The
  // token is parked at fromTop until the slide, so the deferral causes no
  // flash. setMoving runs only via the slide's onfinish (endAnim), never
  // directly, so this effect stays cascade-free too.
  useEffect(() => {
    if (!moving) return;
    const tokenEl = tokenRef.current;
    const scrollEl = ref.current;
    if (!tokenEl || !scrollEl) return;
    const { fromTop, toTop, durationMs, endCenter, viewportHeight, anchorTarget } =
      moving;
    let cancelled = false;
    let pauseTimer = 0;

    const runSlide = () => {
      if (cancelled) return;
      const slide = tokenEl.animate(
        [
          { transform: "translateY(0px)" },
          { transform: `translateY(${toTop - fromTop}px)` },
        ],
        { duration: durationMs, easing: "ease-in-out", fill: "forwards" },
      );
      slide.onfinish = endAnim;
      if (anchorTarget !== null) {
        const overflow =
          endCenter - scrollEl.scrollTop - (viewportHeight - FOLLOW_BOTTOM_GAP);
        if (overflow > 0) {
          animateScroll(scrollEl, scrollEl.scrollTop + overflow, durationMs);
        }
      }
    };
    const pauseThenSlide = () => {
      if (!cancelled) pauseTimer = window.setTimeout(runSlide, CONTEXT_PAUSE_MS);
    };

    if (anchorTarget !== null && Math.abs(anchorTarget - scrollEl.scrollTop) >= 1) {
      const distance = Math.abs(anchorTarget - scrollEl.scrollTop);
      const anchorMs = Math.min(
        ANCHOR_SCROLL_MAX_MS,
        ANCHOR_SCROLL_BASE_MS + distance * ANCHOR_SCROLL_PER_PX,
      );
      animateScroll(scrollEl, anchorTarget, anchorMs, pauseThenSlide);
    } else {
      pauseThenSlide();
    }

    return () => {
      cancelled = true;
      clearTimeout(pauseTimer);
    };
  }, [moving, endAnim, animateScroll]);

  // Drive the slide imperatively (Web Animations API) rather than via a
  // re-render-timed CSS transition: the move commit also re-renders the hidden
  // destination row, and competing renders were swallowing a transition flip.
  // The token rests at toTop; we animate it up from the source offset. A new
  // move cancels the in-flight animation.
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
                left: LANE_X + TOKEN_PX / 2 - 2,
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
                left: LANE_X,
                top: moving.fromTop,
                width: TOKEN_PX,
                height: TOKEN_PX,
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
