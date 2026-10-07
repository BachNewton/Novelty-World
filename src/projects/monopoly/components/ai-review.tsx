"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { Check, Eye, Pause, Play } from "lucide-react";
import {
  aiDecisionAt,
  aiFlagCategoriesFor,
  sharedReviewFor,
  type AiDecisionView,
  type AiFlagCategory,
} from "../bots/ai/review";
import { useMonopolyStore } from "../store";
import type { AiDecisionRef, GameState } from "../types";
import { DECISION_LABEL } from "./ai-status";

// Praise reads differently from the criticisms at a glance.
const PRAISE: ReadonlySet<AiFlagCategory> = new Set(["good-move", "trade-fair", "trade-tempting"]);

// Reviewing an AI decision mid-game. A BOT row's reveal button opens the
// decision in a dialog (its private reasoning and plan stay off the log), which
// pauses the whole table and opens the same dialog for every seated human, so
// the table reads it together and each player can leave their own flag. The
// opener's close resumes play. Anyone else may close their own copy, which
// leaves the table paused with a Resume button, so an abandoned review never
// freezes the game. Resuming closes every copy.

interface ReviewUi {
  /** The decision this client just opened, shown at once rather than when its
   *  pause lands; from then on the pause says what is open. */
  pending: AiDecisionRef | null;
  /** The control that opened it, which gets focus back on close. */
  opener: HTMLElement | null;
  show: (ref: AiDecisionRef, opener: HTMLElement | null) => void;
  landed: () => void;
  hide: () => void;
}

const useReviewUi = create<ReviewUi>((set) => ({
  pending: null,
  opener: null,
  show: (ref, opener) => set({ pending: ref, opener }),
  landed: () => set({ pending: null }),
  hide: () => set({ pending: null, opener: null }),
}));

/** The latest authoritative state this client knows of. A pause must show the
 *  moment it lands, not once the playback head has animated up to it. */
function useLatestState(): GameState {
  return useMonopolyStore((s) => (s.buffer.length > 0 ? s.buffer[s.buffer.length - 1].state : s.headState));
}

/** Whether this client's player can open AI decisions: a seated human in a
 *  game that is in play. */
export function useCanReview(): boolean {
  const myId = useMonopolyStore((s) => s.myPlayerId);
  const state = useMonopolyStore((s) => s.state);
  if (state.status !== "active" || myId === null) return false;
  return state.players.some((p) => p.id === myId && p.botStrategy === null);
}

/** The reveal control on an AI decision's note (its log row, or where a trade
 *  or an auction shows it): a full 44px tap target
 *  around a small glyph, so it fits a dense row and is still easy to hit. */
export function RevealButton({ aiName, refTo }: { aiName: string; refTo: AiDecisionRef }) {
  const reviewDecision = useMonopolyStore((s) => s.reviewDecision);
  const show = useReviewUi((s) => s.show);
  const landed = useReviewUi((s) => s.landed);
  return (
    <button
      type="button"
      onClick={(e) => {
        // The log toggles its height on a click; this one is ours.
        e.stopPropagation();
        show(refTo, e.currentTarget);
        void reviewDecision(refTo).then((res) => {
          // Paused: the pause holds the dialog open now, and lifting it closes
          // it. Refused: it stays up as it is, for this player to close.
          if (res.ok) landed();
        });
      }}
      aria-label={`Review ${aiName}'s reasoning (pauses the game)`}
      title="See its reasoning and flag it"
      className="-my-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
      style={{ color: "var(--mono-orange)", outlineColor: "var(--mono-orange)" }}
    >
      <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}

/** Mounted once on the board: the review dialog every seated player sees while
 *  the table is paused (or that this player has just opened), or, once they
 *  have closed their copy, the pause notice with its Resume button. */
export function AiReviewLayer() {
  const pending = useReviewUi((s) => s.pending);
  const myId = useMonopolyStore((s) => s.myPlayerId);
  const latest = useLatestState();
  const pause = latest.pause;
  const pauseKey = pause === null ? null : `${pause.by}:${String(pause.ref.turn)}:${String(pause.ref.index)}`;
  // The pause whose copy this player closed. It stays closed until that pause
  // lifts (the render-time reset, not an effect, so it never flashes back).
  const [closedKey, setClosedKey] = useState<string | null>(null);
  if (closedKey !== null && closedKey !== pauseKey) setClosedKey(null);

  const shared = closedKey === null ? sharedReviewFor(latest, myId) : null;
  const refTo = pause === null ? pending : shared;
  if (refTo !== null) {
    const mine = pause === null || pause.by === myId;
    return (
      <ReviewDialog
        key={`${String(refTo.turn)}:${String(refTo.index)}`}
        refTo={refTo}
        state={latest}
        mine={mine}
        onCloseCopy={() => {
          setClosedKey(pauseKey);
        }}
      />
    );
  }
  if (pause !== null) return <PauseNotice state={latest} />;
  return null;
}

/** The visual viewport's box: the part of the page actually on screen, which
 *  shrinks when a phone's keyboard opens (the layout viewport often doesn't).
 *  Sizing the overlay to it keeps the text field and the buttons in view while
 *  typing. Follows the browser's resize and scroll events. */
function useVisualViewport(): { top: number; height: number } | null {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setBox({ top: vv.offsetTop, height: vv.height });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}

/** A modal layer over the whole board, fitted to the visible viewport: a sheet
 *  from the bottom on phones, a centred card from `sm` up. */
function Overlay({
  labelledBy,
  onEscape,
  children,
}: {
  labelledBy: string;
  onEscape: () => void;
  children: ReactNode;
}) {
  const box = useVisualViewport();
  const panel = useRef<HTMLDivElement>(null);
  // Read through a ref so the effect below runs once per open, not on every
  // render (re-running it would pull focus out of the text field mid-word).
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });

  // When the visible viewport changes (a phone keyboard opening or closing),
  // keep the field being typed in on screen. This runs after the overlay has
  // been laid out at its new size, so the scroll lands where it should.
  const height = box?.height;
  useEffect(() => {
    const active = document.activeElement;
    if (height !== undefined && active instanceof HTMLTextAreaElement && panel.current?.contains(active)) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [height]);

  // Focus the panel on open, and keep Tab inside it while it's up.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>("[data-autofocus]") ?? el;
    first.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        escape.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = [
        ...el.querySelectorAll<HTMLElement>("button:not([disabled]), textarea, [href], [tabindex]:not([tabindex='-1'])"),
      ];
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      className="fixed inset-x-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      style={{
        top: box?.top ?? 0,
        height: box ? `${String(box.height)}px` : "100dvh",
        backgroundColor: "rgb(0 0 0 / 0.7)",
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="flex max-h-[calc(100%-12px)] w-full flex-col overflow-hidden rounded-t-2xl outline-none sm:max-h-full sm:max-w-xl sm:rounded-2xl"
        style={{
          backgroundColor: "var(--mono-board)",
          color: "var(--mono-ink)",
          boxShadow: "0 -1px 0 var(--mono-neutral), 0 12px 40px rgb(0 0 0 / 0.6)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The "game paused" badge both dialogs carry, so the pause is unmistakable. */
function PausedBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 self-start whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-wider"
      style={{ backgroundColor: "var(--mono-orange)", color: "var(--mono-frame)" }}
    >
      <Pause className="h-3.5 w-3.5" aria-hidden="true" />
      Game paused
    </span>
  );
}

/** What everyone else at the table sees while someone reviews: who paused, for
 *  what, and a Resume button so an abandoned pause can be lifted. */
function PauseNotice({ state }: { state: GameState }) {
  const titleId = useId();
  const myId = useMonopolyStore((s) => s.myPlayerId);
  const resumeGame = useMonopolyStore((s) => s.resumeGame);
  const [busy, setBusy] = useState(false);
  const pause = state.pause;
  if (pause === null) return null;
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "Someone";
  const decision = aiDecisionAt(state, pause.ref);
  const seated = myId !== null && state.players.some((p) => p.id === myId && p.botStrategy === null);
  const resume = () => {
    setBusy(true);
    void resumeGame().finally(() => {
      setBusy(false);
    });
  };
  return (
    <Overlay labelledBy={titleId} onEscape={() => {}}>
      <div className="flex flex-col gap-4 p-5" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <PausedBadge />
        <h2 id={titleId} className="text-xl font-black leading-tight">
          {name(pause.by)} is reviewing {decision ? `${name(decision.seat)}'s` : "an AI"} decision
        </h2>
        <p className="text-base leading-relaxed" style={{ color: "var(--mono-rail)" }}>
          Play carries on when they close it. Anyone at the table can resume now.
        </p>
        {seated && (
          <button
            type="button"
            data-autofocus
            onClick={resume}
            disabled={busy}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-black disabled:opacity-60"
            style={{ backgroundColor: "var(--mono-orange)", color: "var(--mono-frame)" }}
          >
            <Play className="h-5 w-5" aria-hidden="true" />
            {busy ? "Resuming…" : "Resume game"}
          </button>
        )}
      </div>
    </Overlay>
  );
}

/** This client's copy of the review of one AI decision: everything it said and
 *  planned, and a flag to leave on it. For the player who opened it (`mine`),
 *  closing resumes play and so does their flag; anyone else's close or flag
 *  closes only their own copy and leaves the table paused. */
function ReviewDialog({
  refTo,
  state,
  mine,
  onCloseCopy,
}: {
  refTo: AiDecisionRef;
  state: GameState;
  mine: boolean;
  onCloseCopy: () => void;
}) {
  const titleId = useId();
  const noteId = useId();
  const hide = useReviewUi((s) => s.hide);
  const opener = useReviewUi((s) => s.opener);
  const resumeGame = useMonopolyStore((s) => s.resumeGame);
  const flagDecision = useMonopolyStore((s) => s.flagDecision);
  const [picked, setPicked] = useState<readonly AiFlagCategory[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decision = aiDecisionAt(state, refTo);

  const finish = () => {
    if (!mine) {
      onCloseCopy();
      return;
    }
    hide();
    opener?.focus();
  };
  const close = () => {
    finish();
    if (mine) void resumeGame();
  };
  const submit = () => {
    setBusy(true);
    setError(null);
    void flagDecision(refTo, picked, note).then((res) => {
      setBusy(false);
      if (res.ok) finish();
      else setError(res.reason);
    });
  };
  const toggle = (id: AiFlagCategory) => {
    setPicked((now) => (now.includes(id) ? now.filter((c) => c !== id) : [...now, id]));
  };
  const canSubmit = !busy && (picked.length > 0 || note.trim() !== "");
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name;
  const aiName = decision ? (nameOf(decision.seat) ?? "AI") : "AI";

  return (
    <Overlay labelledBy={titleId} onEscape={close}>
      <header className="flex flex-col gap-1 px-5 pb-3 pt-4" style={{ borderBottom: "1px solid var(--mono-neutral)" }}>
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="min-w-0 text-xl font-black leading-tight">
            {aiName}
            {decision?.record && (
              <span className="font-semibold" style={{ color: "var(--mono-rail)" }}>
                {" "}
                on {DECISION_LABEL[decision.record.decision]}
              </span>
            )}
          </h2>
          <PausedBadge />
        </div>
        {decision?.record && (
          <p className="truncate font-mono text-xs" style={{ color: "var(--mono-rail)" }}>
            {meta(decision)}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {decision === null ? (
          <p className="text-base">This decision isn&apos;t in the game&apos;s log any more.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {decision.failure !== null && (
              <Section title="Why it stalled" tone="var(--mono-red)">
                {decision.failure}
              </Section>
            )}
            {decision.publicNote !== "" && <Section title="Said to the table">{decision.publicNote}</Section>}
            <Section title="Private reasoning">{decision.privateNote ?? "None recorded."}</Section>
            <Section title="Plan">{decision.plan ?? "None recorded."}</Section>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-sm font-black uppercase tracking-wider" style={{ color: "var(--mono-orange)" }}>
                Flag it
              </legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label="What stands out about this decision">
                {aiFlagCategoriesFor(decision.record?.decision ?? null).map((c) => {
                  const on = picked.includes(c.id);
                  const tone = PRAISE.has(c.id) ? "var(--mono-green)" : "var(--mono-orange)";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        toggle(c.id);
                      }}
                      className="flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold transition-colors"
                      style={
                        on
                          ? { backgroundColor: tone, color: "var(--mono-frame)", border: `2px solid ${tone}` }
                          : { color: "var(--mono-ink)", border: "2px solid var(--mono-neutral)" }
                      }
                    >
                      {on && <Check className="h-4 w-4" aria-hidden="true" />}
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <label htmlFor={noteId} className="mt-1 text-sm font-bold" style={{ color: "var(--mono-rail)" }}>
                Why? Your own words help most.
              </label>
              <textarea
                id={noteId}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                }}
                rows={3}
                className="w-full resize-y rounded-xl px-3 py-2.5 text-base leading-relaxed outline-none focus-visible:outline-2"
                style={{
                  backgroundColor: "var(--mono-card)",
                  color: "var(--mono-ink)",
                  border: "2px solid var(--mono-neutral)",
                  outlineColor: "var(--mono-orange)",
                }}
                placeholder="What should it have done?"
              />
            </fieldset>
          </div>
        )}
      </div>

      <footer
        className="flex flex-col gap-2 px-5 pt-3"
        style={{
          borderTop: "1px solid var(--mono-neutral)",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        {error !== null && (
          <p role="alert" className="text-sm font-semibold" style={{ color: "var(--mono-red)" }}>
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            data-autofocus
            onClick={close}
            disabled={busy}
            className="flex min-h-12 flex-1 items-center justify-center whitespace-nowrap rounded-xl px-3 text-base font-bold transition-colors hover:bg-white/10 disabled:opacity-60"
            style={{ border: "2px solid var(--mono-neutral)", color: "var(--mono-ink)" }}
          >
            {mine ? "Close & resume" : "Close"}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || decision === null}
            className="flex min-h-12 flex-1 items-center justify-center whitespace-nowrap rounded-xl px-3 text-base font-black transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "var(--mono-orange)", color: "var(--mono-frame)" }}
          >
            {busy ? "Sending…" : "Submit flag"}
          </button>
        </div>
      </footer>
    </Overlay>
  );
}

function Section({ title, tone, children }: { title: string; tone?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm font-black uppercase tracking-wider" style={{ color: tone ?? "var(--mono-rail)" }}>
        {title}
      </h3>
      <p className="max-w-prose whitespace-pre-wrap text-base leading-relaxed [overflow-wrap:anywhere]">{children}</p>
    </section>
  );
}

/** The decision's version, model and time, compactly. */
function meta(decision: AiDecisionView): string {
  const r = decision.record;
  if (!r) return "";
  const model = r.model?.replace(/\.gguf$/i, "") ?? "model unknown";
  return `${r.version} · ${model} · ${(r.ms / 1000).toFixed(1)}s`;
}
