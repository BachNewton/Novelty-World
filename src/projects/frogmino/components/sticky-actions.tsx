import type { ReactNode } from "react";

// A screen's buttons, held at the bottom of the window while a long course
// list scrolls under them, so Start stays in reach on a phone.
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="sticky-actions"
      className="sticky bottom-0 z-10 flex w-full max-w-md flex-wrap items-center justify-center gap-3 border-t border-border-default bg-surface-primary py-3"
    >
      {children}
    </div>
  );
}
