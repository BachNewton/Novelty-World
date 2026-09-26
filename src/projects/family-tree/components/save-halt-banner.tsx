"use client";

import { useFamilyTreeStore } from "../store";

// Full-width strip under the header once saving has stopped. Editing is
// paused along with it, so the strip has to say why nothing sticks.
export function SaveHaltBanner() {
  const halt = useFamilyTreeStore((s) => s.saveHalt);
  if (halt === null) return null;

  const title =
    halt.kind === "conflict"
      ? "The tree was changed elsewhere — reload to see the latest."
      : "Saving failed — reload to continue.";

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-brand-pink bg-surface-elevated px-4 py-2"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-brand-pink">{title}</p>
        <p className="break-words text-xs text-text-secondary">
          {halt.kind === "error" ? `${halt.message} ` : null}
          Editing is paused so nothing gets overwritten.
        </p>
      </div>
      <button
        type="button"
        onClick={() => { window.location.reload(); }}
        className="shrink-0 rounded-md border border-brand-pink px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-tertiary"
      >
        Reload
      </button>
    </div>
  );
}
