"use client";

import { Suspense, useEffect, useRef } from "react";
import type { WhyItem } from "../../play/status";
import { RuleDetail } from "../why";
import { enterLayer } from "./pad-focus";

/*
 * Why, opened from the status box: a small centred panel over the house with
 * each rule behind the beat, named by its source, in a plain sentence, then
 * its full text and rulings. It scrolls inside when long. It takes the pad's
 * focus while open, and B, Escape or Close shuts it. Reading never costs a
 * beat: the next waits while it is open, and opening it skips nothing.
 */

export function WhyDialog({ whys, hold, close }: { whys: WhyItem[]; hold: (on: boolean) => void; close: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    hold(true);
    return () => {
      hold(false);
    };
  }, [hold]);
  useEffect(() => {
    if (ref.current) enterLayer(ref.current);
  }, []);
  return (
    <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-(--bt-bg)/70 p-3">
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Why"
        data-pad-layer="2"
        className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded border border-(--bt-line) bg-(--bt-panel) p-4 text-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Why</h2>
          <button type="button" data-pad-back data-pad-start onClick={close} className="inline-flex min-h-11 items-center rounded border border-(--bt-line) px-3 hover:border-(--bt-accent)">
            Close
          </button>
        </div>
        <ul className="flex flex-col gap-4">
          {whys.map((why) => (
            <li key={why.statement} className="flex flex-col gap-1 border-t border-(--bt-line) pt-3 first:border-t-0 first:pt-0">
              <h3 className="font-semibold text-(--bt-accent)">{why.name}</h3>
              {/* Named in the heading, so its sentence doesn't name it again. */}
              <p>{why.statement.startsWith(`${why.name}: `) ? why.statement.slice(why.name.length + 2) : why.statement}</p>
              <div className="text-xs text-(--bt-muted)">
                <Suspense fallback={<p>Loading the rules…</p>}>
                  <RuleDetail rule={why.rule} />
                </Suspense>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
