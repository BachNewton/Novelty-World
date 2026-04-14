"use client";

import { useEffect, useCallback, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

interface GuessResultProps {
  correct: boolean;
  onNext: () => void;
  /** Game-specific reveal details (answer, metadata, etc.) */
  children?: ReactNode;
}

export function GuessResult({ correct, onNext, children }: GuessResultProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") onNext();
    },
    [onNext],
  );

  // Delay attaching the listener so the Enter keypress that triggered
  // the reveal doesn't immediately fire advance.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      window.addEventListener("keydown", handleKeyDown);
    });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3 px-4">
      <div className="flex items-center gap-2">
        {correct ? (
          <>
            <Check size={24} className="text-brand-green" />
            <span className="text-lg font-semibold text-brand-green">
              Correct!
            </span>
          </>
        ) : (
          <>
            <X size={24} className="text-brand-pink" />
            <span className="text-lg font-semibold text-brand-pink">
              Wrong!
            </span>
          </>
        )}
      </div>

      {children}

      <Button onClick={onNext} className="mt-1 w-full">
        Next
      </Button>
    </div>
  );
}
