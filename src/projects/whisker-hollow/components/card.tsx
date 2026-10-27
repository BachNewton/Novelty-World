import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/** The overlay's paper card, centred over the garden. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-wh-ink/30 p-4">
      <div className={cn("w-full max-w-md rounded-3xl border-4 border-wh-paper-edge bg-wh-paper p-6 text-wh-ink shadow-xl", className)}>
        {children}
      </div>
    </div>
  );
}

export function CardButton({ className, primary = false, ...props }: ComponentProps<"button"> & { primary?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full border-2 px-4 py-2 font-semibold transition-transform hover:scale-105",
        primary ? "border-wh-accent bg-wh-accent text-wh-accent-ink" : "border-wh-paper-edge bg-wh-paper text-wh-ink",
        className,
      )}
      {...props}
    />
  );
}
