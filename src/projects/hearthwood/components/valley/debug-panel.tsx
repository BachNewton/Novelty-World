"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { isTextEntryTarget } from "@/shared/lib/utils";
import type { DebugContext } from "./debug/section";
import { DEBUG_SECTIONS } from "./debug/sections";

// The developer's panel, opened and closed with ~ (the physical key left of
// 1, whatever the layout): its sections (`debug/sections.ts`), each its own
// component under its own heading. Opening it frees a locked pointer.

const PANEL_COLOURS = {
  background: "var(--color-hearthwood-valley-ui-shade)",
  color: "var(--color-hearthwood-valley-ui-ink)",
  accentColor: "var(--color-hearthwood-valley-witch-scarf)",
} as CSSProperties;

export function DebugPanel({ context }: { context: DebugContext }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== "Backquote" || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTextEntryTarget(e.target)) return;
      e.preventDefault();
      setOpen((was) => !was);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The controls need the pointer, so opening the panel hands a locked one back; only a click on the game locks it again.
  useEffect(() => {
    if (open && document.pointerLockElement !== null) document.exitPointerLock();
  }, [open]);

  if (!open) return null;

  return (
    <div
      data-testid="hearthwood-debug-panel"
      className="absolute top-2 left-2 z-40 flex max-h-[calc(100%-1rem)] w-72 flex-col gap-3 overflow-y-auto rounded-md p-3 font-mono text-sm shadow-lg"
      style={PANEL_COLOURS}
    >
      {DEBUG_SECTIONS.map(({ id, title, Section }) => (
        <section key={id} data-testid={`hearthwood-debug-${id}`} className="flex flex-col gap-2">
          <h2 className="text-xs font-bold uppercase opacity-80">{title}</h2>
          <Section context={context} />
        </section>
      ))}
    </div>
  );
}
