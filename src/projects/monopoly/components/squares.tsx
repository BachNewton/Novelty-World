"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  ROW_PX,
  CYCLE_PX,
  MAX_SLIDE_ROWS,
  anchorNear,
  forwardRows,
  signedRows,
  slideGeometry,
  slideGeometryBy,
  followTarget,
} from "../camera";
import { SPACES } from "../data";
import { LANE_TOKEN_PX, STRIP_LEFT_PX, lanePitch, laneOffset } from "../lanes";
import {
  classifyRedirect,
  glideAnimMs,
  redirectPauseMs,
  slideAnimMs,
} from "../pacing";
import { useMonopolyStore } from "../store";
import { PLAYER_COLOR_VAR } from "../theme";
import { useTokenAnim } from "../token-anim-store";
import type { Player } from "../types";
import { PlayerToken } from "./player-token";
import { SquareRow } from "./square-row";

// On each turn the active player's square is parked just under the header, so
// the squares ahead of them fill the screen. The camera then holds still while
// they move — you watch the token slide down — and only scrolls to follow if
// the move would carry the token within a margin of the bottom edge.
//
// The overlay token rides the same per-player lanes as the static tokens: its x
// is the strip's left edge plus the player's lane offset, so it slides and
// trails in the column its static copy occupies. See `lanes.ts` and the
// `TokenStrip` in square-row.tsx.

// Slides up to a die roll's reach (incl. passing GO) animate; longer jumps
// (teleports, "advance to" cards, going to jail) cut instantly so the token
// never zips the wrong way around the board. The scroll-content geometry
// (ROW_PX, CYCLE_PX, anchorNear, slideGeometry, followTarget, …) is pure and
// lives in `../camera`.
//
// All sub-timings (glide ms, slide ms) derive from the store's per-client
// `TURN_MS` via `glideAnimMs` / `slideAnimMs` — the board no longer owns
// pacing. Each playback-head change is one atomic transition (a glide to a new
// active player, or a token slide); the store budgets the dwell that holds
// after each, so this component just animates the motion and lets the hold
// fall out of the next snapshot's arrival.

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
  // What plays once this slide finishes, for a redirect turn (a card / Go-to-
  // Jail relocation animated as two beats). null = a plain move that just ends.
  next: RedirectStep | null;
}

// A redirect's second beat, played after the rolled-landing slide and a pause:
// either another slide (an "advance to" / "back 3" card's relocation) or the
// Go-to-Jail finish. A Go-to-Jail snaps the token into the cell — "do not pass
// GO", no slide — but the camera glides to `jailPos` to reveal it there before
// gliding on to the next player at `nextPos`. See the move-detection effect.
type RedirectStep =
  | { kind: "leg"; leg: PendingLeg }
  | { kind: "jail"; jailPos: number; nextPos: number; follow: boolean };

// One slide of a redirect, laid out lazily: its on-screen geometry is computed
// in `startLeg` from the live scroll position when it actually starts, so the
// second leg continues from exactly where the first left the token.
interface PendingLeg {
  player: Player;
  laneX: number;
  fromPos: number;
  // Explicit signed row delta (forward positive / backward negative) so a leg
  // can slide forward the long way instead of the short way back.
  signed: number;
  // Static board copy of the token to keep hidden while this leg animates —
  // always the turn's final resolved square (the only square the mover's static
  // token occupies), so both legs hide the same one.
  hidePos: number;
  durationMs: number;
  follow: boolean;
  next: RedirectStep | null;
}

const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

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
  // The hold between a redirect's two legs (see the move-detection effect). Kept
  // in a ref so a new move / the slide's end can cancel a pending second leg.
  const pauseTimer = useRef<number | null>(null);
  // True for the whole duration of a redirect sequence. The board's invisible
  // copy snap-back (`handleScroll`) is held off while it's set: a redirect's
  // forward-wrapping legs cross the copy seam, and a ±CYCLE snap mid-sequence
  // would jump the overlay token (which lives in absolute scroll-content coords).
  const redirectActive = useRef(false);

  // Park a given board square just under the header (instant). Used for the
  // non-sliding cases (mount, follow toggle, teleports).
  const anchorTop = useCallback((position: number) => {
    const el = ref.current;
    if (el) el.scrollTop = anchorNear(position, el.scrollTop);
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
  // drives the slide. We refresh EVERY player's entry on each update, not just
  // the active one: a player can be relocated while OFF-subject — `sendToJail`
  // moves them to the Jail cell and ends their turn in the same beat — so
  // tracking only the active player would leave their stale pre-jail square
  // behind, and the next handoff to that (now jailed) player would read it as a
  // roll-move and slide the token to Jail for no reason.
  const prevPos = useRef<Map<string, number> | null>(null);
  // The active player id at the last effect run, so we can tell a turn handoff
  // (id changed) from the same player moving. Each authoritative update is a
  // single unit, so the handoff arrives as its own commit — before the new
  // player has rolled — and needs a smooth camera glide, not an instant snap.
  const lastActiveId = useRef<string | null>(null);

  const clearPause = useCallback(() => {
    if (pauseTimer.current !== null) {
      clearTimeout(pauseTimer.current);
      pauseTimer.current = null;
    }
  }, []);

  // Park the camera in the middle board copy without moving it on screen — the
  // three copies are identical, so a ±CYCLE shift is invisible. Run before a
  // redirect's first leg so its forward-wrapping slides start from a copy with
  // room ahead, keeping the overlay token within the rendered copies (a leg that
  // ended past the last copy would push the absolute token — and the camera that
  // follows it — into the empty space below the board).
  const recenterCamera = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    while (el.scrollTop >= CYCLE_PX * 1.5) el.scrollTop -= CYCLE_PX;
    while (el.scrollTop < CYCLE_PX * 0.5) el.scrollTop += CYCLE_PX;
  }, []);

  const endAnim = useCallback(() => {
    if (scrollRaf.current !== null) {
      cancelAnimationFrame(scrollRaf.current);
      scrollRaf.current = null;
    }
    clearPause();
    suppressSnap.current = false;
    setMoving(null);
    useTokenAnim.getState().clear();
  }, [clearPause]);

  // Lay out and play one leg from the live scroll position. Reading the geometry
  // here (not when the redirect was detected) is what lets the second leg pick up
  // exactly where the first left the token, even after a follow scroll. Hides the
  // mover's static copy at the resolved square so the overlay isn't drawn twice.
  const startLeg = useCallback((leg: PendingLeg) => {
    const el = ref.current;
    if (!el) return;
    const { startCenter, endCenter } = slideGeometryBy(
      el.scrollTop,
      el.clientHeight,
      leg.fromPos,
      leg.signed,
    );
    setMoving({
      player: leg.player,
      laneX: leg.laneX,
      fromTop: startCenter - LANE_TOKEN_PX / 2,
      toTop: endCenter - LANE_TOKEN_PX / 2,
      trailTop: Math.min(startCenter, endCenter),
      trailHeight: Math.abs(leg.signed) * ROW_PX,
      durationMs: leg.durationMs,
      endCenter,
      viewportHeight: el.clientHeight,
      follow: leg.follow,
      next: leg.next,
    });
    useTokenAnim.getState().hide(leg.player.id, leg.hidePos);
  }, []);

  // Called when a slide finishes. A plain move just ends; a redirect holds on the
  // rolled square for the pause, then plays its second beat — the redirecting
  // slide, or (for a Go-to-Jail) the snap into the cell plus a glide to the next
  // player. This sequence (slide + pause + slide, or slide + pause + glide +
  // pause + glide) must fit inside the dwell `redirectDwell` budgets in
  // `pacing.ts`, or the next snapshot would arrive mid-animation and snap. Both
  // are built from the same anim helpers (`slideAnimMs` / `glideAnimMs` /
  // `redirectPauseMs`); the "budgets enough dwell to cover the animation
  // sequence" test in `pacing.test.ts` guards that the budget always wins.
  const advanceFrom = useCallback(
    (current: MovingToken) => {
      const next = current.next;
      if (!next) {
        // End of the move — a plain slide, or a redirect's final leg.
        endAnim();
        redirectActive.current = false;
        return;
      }
      const pauseMs = redirectPauseMs(useMonopolyStore.getState().turnMs);
      if (next.kind === "leg") {
        pauseTimer.current = window.setTimeout(() => {
          pauseTimer.current = null;
          startLeg(next.leg);
        }, pauseMs);
        return;
      }
      // Go-to-Jail: after the hold on the Go-to-Jail square, the token snaps into
      // the cell (no slide — "do not pass GO"), so clear the overlay and let the
      // static Jail token take over. The camera then glides to the Jail cell to
      // reveal where they landed; once that settles it holds, then glides on to
      // the next player. In free view we move neither camera (the Follow pill
      // re-centers).
      pauseTimer.current = window.setTimeout(() => {
        pauseTimer.current = null;
        endAnim();
        const el = ref.current;
        if (!el || !next.follow) {
          redirectActive.current = false;
          return;
        }
        const turnMs = useMonopolyStore.getState().turnMs;
        const jailTarget = anchorNear(next.jailPos, el.scrollTop);
        animateScroll(
          el,
          jailTarget,
          glideAnimMs(turnMs, Math.abs(jailTarget - el.scrollTop)),
          () => {
            // The token is now revealed in the Jail cell — hold on it, then move
            // the camera on to whoever's turn is next. The overlay is already
            // gone, so the sequence can release the snap-back as it heads off.
            pauseTimer.current = window.setTimeout(() => {
              pauseTimer.current = null;
              redirectActive.current = false;
              const onward = ref.current;
              if (onward) {
                glideToAnchor(onward, anchorNear(next.nextPos, onward.scrollTop));
              }
            }, pauseMs);
          },
        );
      }, pauseMs);
    },
    [endAnim, startLeg, glideToAnchor, animateScroll],
  );

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
    // Read prior positions BEFORE refreshing the map, so the slide diffs are
    // preserved; then bring every entry up to date (see the `prevPos` note above
    // on off-subject relocations like jail). The MOVER is whoever held the dice
    // this beat — the previous active player (a Go-to-Jail ends their turn and
    // hands off in the same snapshot, so the mover isn't always the new active
    // one). `from` is the new active player's prior square for the plain path.
    const from = map.get(active.id);
    const moverId = prevActiveId ?? active.id;
    const moverStart = map.get(moverId);
    for (const p of useMonopolyStore.getState().state.players) {
      map.set(p.id, p.position);
    }

    // A redirect: the dice rolled the mover onto one square but a card / Go-to-
    // Jail moved them on to another. Play the rolled landing first, hold, then
    // the redirect — rather than darting straight to the resolved square (which
    // reads as a backward jump or an out-of-reach leap). Three-doubles is not a
    // redirect (the token never moved) and falls through to the plain glide.
    const toState = useMonopolyStore.getState().state;
    const redirect =
      prevActiveId !== null && moverStart !== undefined
        ? classifyRedirect(toState, moverId, moverStart)
        : null;
    if (redirect && moverStart !== undefined) {
      clearPause();
      // Hold off the snap-back, then park in the middle copy (invisible) so the
      // legs' forward wraps stay within the rendered board. Arm the flag first so
      // recenter's own scroll write can't trip the snap-back.
      redirectActive.current = true;
      recenterCamera();
      // classifyRedirect only returns non-null for a mover present in `toState`,
      // so the seat lookup always resolves.
      const seat = toState.players.findIndex((p) => p.id === moverId);
      const moverPlayer = toState.players[seat];
      const { turnMs } = useMonopolyStore.getState();
      const laneX =
        STRIP_LEFT_PX + laneOffset(seat, useTokenAnim.getState().lanePitch);
      const follow = following;

      // The redirecting second leg. A Go-to-Jail snaps into the cell (camera
      // reveals it at the Jail square, then moves to the next player) rather than
      // sliding; a card slides forward (the long way past GO when needed) or, for
      // "back 3", backward.
      const finish: RedirectStep =
        redirect.finish === "jail"
          ? {
              kind: "jail",
              jailPos: redirect.resolved,
              nextPos: active.position,
              follow,
            }
          : (() => {
              const legSigned =
                redirect.finish === "back"
                  ? -forwardRows(redirect.resolved, redirect.rolledTo)
                  : forwardRows(redirect.rolledTo, redirect.resolved);
              return {
                kind: "leg",
                leg: {
                  player: moverPlayer,
                  laneX,
                  fromPos: redirect.rolledTo,
                  signed: legSigned,
                  hidePos: redirect.resolved,
                  durationMs: slideAnimMs(turnMs, Math.abs(legSigned)),
                  follow,
                  next: null,
                },
              };
            })();

      const leg1Signed = forwardRows(moverStart, redirect.rolledTo);
      startLeg({
        player: moverPlayer,
        laneX,
        fromPos: moverStart,
        signed: leg1Signed,
        hidePos: redirect.resolved,
        durationMs: slideAnimMs(turnMs, leg1Signed),
        follow,
        next: finish,
      });
      return;
    }

    const signed = from === undefined ? 0 : signedRows(from, active.position);
    // Not a slide (first time we see this player, they didn't move, or a
    // teleport like jail / "advance to" cards): re-anchor, no slide.
    if (from === undefined || signed === 0 || Math.abs(signed) > MAX_SLIDE_ROWS) {
      if (following) {
        // A handoff is its own `glide` transition — glide the camera to the new
        // active player so the next turn doesn't snap into view. Same-player
        // non-moves (teleports) still snap.
        if (isHandoff) glideToAnchor(el, anchorNear(active.position, el.scrollTop));
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
    const { startCenter, endCenter } = slideGeometry(
      el.scrollTop,
      el.clientHeight,
      from,
      active.position,
    );
    const durationMs = slideAnimMs(useMonopolyStore.getState().turnMs, signed);
    // Slide and trail in the player's fixed lane, reading the live pitch
    // published by the measurement effect above.
    const laneX =
      STRIP_LEFT_PX + laneOffset(active.seat, useTokenAnim.getState().lanePitch);

    // A plain slide supersedes any pending redirect leg from a prior turn.
    clearPause();
    redirectActive.current = false;
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
      next: null,
    });
    // Hide the static copy of the token at its destination row so it isn't
    // drawn twice while the overlay slides; the slide effect reveals it again.
    useTokenAnim.getState().hide(active.id, active.position);
  }, [
    active,
    following,
    anchorActiveTop,
    glideToAnchor,
    startLeg,
    clearPause,
    recenterCamera,
  ]);

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
    // On finish, advance the turn: a plain move just ends; a redirect plays its
    // next beat (second leg, or snap-to-jail + glide). Captured `moving` is the
    // leg that just finished.
    const finished = moving;
    slide.onfinish = () => advanceFrom(finished);
    // Follow only if the landing would fall past the bottom margin; otherwise
    // hold the camera still and let the token slide down into view.
    if (follow) {
      const target = followTarget(scrollEl.scrollTop, viewportHeight, endCenter);
      if (target !== null) animateScroll(scrollEl, target, durationMs);
    }

    return () => {
      slide.cancel();
    };
  }, [moving, advanceFrom, animateScroll]);

  // When the user crosses into the prev/next copy, silently snap back into
  // the middle copy. The jump is invisible because all three copies render
  // identical content at identical offsets (mod CYCLE_PX).
  const handleScroll = () => {
    const el = ref.current;
    if (!el || suppressSnap.current || redirectActive.current) return;
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
              <PlayerToken
                player={moving.player}
                className="h-full w-full"
                active={moving.player.id === active?.id}
              />
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
