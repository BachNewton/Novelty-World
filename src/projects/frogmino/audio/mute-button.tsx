"use client";

import { useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { cn, isTextEntryTarget } from "@/shared/lib/utils";
import { useSoundSettings } from "./settings";

// A small sound toggle, also on the M key. The saved setting is only known in
// the browser, so the button appears once the page has hydrated.
export function MuteButton({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const muted = useSoundSettings((s) => s.settings.muted);
  const toggleMuted = useSoundSettings((s) => s.toggleMuted);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== "KeyM" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTextEntryTarget(e.target)) return;
      toggleMuted();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [toggleMuted]);

  if (!hydrated) return null;
  const Icon = muted ? VolumeX : Volume2;
  return (
    <button
      type="button"
      onClick={(e) => {
        toggleMuted();
        // Space is the hop key, and it also presses a focused button, so the
        // button lets go of focus rather than toggle again on the next hop.
        e.currentTarget.blur();
      }}
      aria-label={muted ? "Unmute sound (M)" : "Mute sound (M)"}
      aria-pressed={muted}
      title={muted ? "Unmute (M)" : "Mute (M)"}
      className={cn(
        "rounded-lg bg-surface-secondary/80 p-2 text-text-secondary transition-colors hover:text-text-primary",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
