"use client";

import { Suspense, use, useState } from "react";
import type { RuleRef } from "../types";
import { describeRule } from "../engine/describe";
import type { Engine } from "../engine/step-loop";
import { loadRuleNotes, ruleDetail, type RuleNotes } from "../data/rule-notes";

let notes: Promise<RuleNotes> | null = null;

/** The rule notes load once, the first time anyone asks why. */
function ruleNotes(): Promise<RuleNotes> {
  notes ??= loadRuleNotes();
  return notes;
}

/** A "why?" toggle: the rule's source, what content/ says it does, and the
 *  rulings recorded against it, each with its authority. */
export function Why({ engine, rule }: { engine: Engine; rule: RuleRef }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ml-1 text-xs text-(--bt-muted) underline decoration-dotted hover:text-(--bt-ink)"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        why?
      </button>
      {open && (
        <div className="mt-1 mb-2 rounded border border-(--bt-line) bg-(--bt-bg) p-2 text-xs">
          <p className="font-semibold">{describeRule(engine, rule)}</p>
          <Suspense fallback={<p className="text-(--bt-muted)">Loading the rules…</p>}>
            <RuleDetail rule={rule} />
          </Suspense>
        </div>
      )}
    </>
  );
}

function RuleDetail({ rule }: { rule: RuleRef }) {
  const texts = ruleDetail(use(ruleNotes()), rule);
  if (rule.source === "scenario")
    return (
      <p className="text-(--bt-muted)">
        Set up by the scenario this game started from, not by a rule.
      </p>
    );
  if (texts.length === 0)
    return <p className="text-(--bt-muted)">No rule text recorded for this yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {texts.map((text) => (
        <section key={text.title}>
          {rule.source === "rulebook" && (
            <h4 className="font-semibold text-(--bt-muted)">{text.title}</h4>
          )}
          <ul className="list-disc pl-4">
            {text.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          {text.rulings.map((ruling, i) => (
            <div key={i} className="mt-1 border-l-2 border-(--bt-accent) pl-2">
              <p>
                <span className="text-(--bt-muted)">Question: </span>
                {ruling.note}
              </p>
              <p>
                <span className="font-semibold">
                  Ruling ({ruling.authority ?? "none recorded"}):{" "}
                </span>
                {ruling.resolution ?? "none recorded"}
              </p>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
