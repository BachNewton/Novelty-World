"use client";

import { COUNTRIES, COUNTRY_CODES_BY_NAME, UNKNOWN_HERITAGE } from "../countries";
import type { HeritageCode } from "../countries";
import { formatShare } from "../logic";
import type { HeritageBreakdown } from "../logic";
import { Button } from "@/shared/components/ui/button";
import { Flag } from "./flag";
import { HeritageChip } from "./heritage-badges";

function heritageName(code: HeritageCode): string {
  return code === UNKNOWN_HERITAGE ? "Unknown" : COUNTRIES[code].name;
}

function HeritageIcon({ code }: { code: HeritageCode }) {
  return (
    <span className="inline-flex h-3 w-[18px] shrink-0 items-center justify-center overflow-hidden rounded-[2px] bg-surface-elevated text-[10px] text-text-muted">
      {code === UNKNOWN_HERITAGE ? "?" : <Flag code={code} fit="stretch" className="block h-full w-full" />}
    </span>
  );
}

const HERITAGE_OPTIONS: readonly HeritageCode[] = [...COUNTRY_CODES_BY_NAME, UNKNOWN_HERITAGE];

const OPTION_CLASS =
  "flex min-h-10 min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors";

// Edits the heritage entered for one person. Changes apply at once, like the
// relationship status picker.
export function HeritageEditor({
  entered,
  derived,
  onChange,
  onDone,
}: {
  entered: readonly HeritageCode[];
  // The person's current breakdown: what they inherit when nothing is entered.
  derived: HeritageBreakdown;
  onChange: (heritage: HeritageCode[]) => void;
  onDone: () => void;
}) {
  const addable = HERITAGE_OPTIONS.filter((code) => !entered.includes(code));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-text-secondary">Heritage</div>
        {entered.length === 0 ? (
          <>
            <p className="text-xs text-text-muted">
              Nothing entered, so it comes from the parents:
            </p>
            {derived.known.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Unknown. Nobody up the line has heritage entered.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {derived.known.map((entry) => (
                  <HeritageChip key={entry.code} code={entry.code} share={entry.share} size="panel" />
                ))}
                {derived.unknown > 0 ? (
                  <HeritageChip code={null} share={derived.unknown} size="panel" />
                ) : null}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              {entered.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-label={`Remove ${heritageName(code)}`}
                  onClick={() => { onChange(entered.filter((c) => c !== code)); }}
                  className={`${OPTION_CLASS} border-brand-orange bg-surface-elevated text-text-primary`}
                >
                  <HeritageIcon code={code} />
                  <span className="flex-1 truncate">{heritageName(code)}</span>
                  <span className="font-mono text-xs text-text-secondary">
                    {formatShare(1 / entered.length)}
                  </span>
                  <span aria-hidden className="text-text-muted">×</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted">
              Split equally. An entry replaces what they would inherit from
              their parents.
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-xs text-text-secondary">Add</div>
        <div className="grid grid-cols-2 gap-1">
          {addable.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => { onChange([...entered, code]); }}
              className={`${OPTION_CLASS} border-border-default bg-surface-primary text-text-secondary hover:border-border-hover`}
            >
              <HeritageIcon code={code} />
              <span className="truncate">{heritageName(code)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
