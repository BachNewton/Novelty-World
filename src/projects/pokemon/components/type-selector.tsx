"use client";

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { POKEMON_TYPES } from "../logic";
import { TypeIcon } from "./type-icon";

interface TypeSelectorProps {
  onSubmit: (types: string[]) => void;
  disabled?: boolean;
}

const MAX_TYPES = 2;

/**
 * Remount (by passing a changing `key` from the parent) to reset the
 * selection between rounds — avoids a setState-in-effect anti-pattern.
 */
export function TypeSelector({ onSubmit, disabled }: TypeSelectorProps) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(type: string) {
    if (disabled) return;
    setSelected((prev) => {
      if (prev.includes(type)) return prev.filter((t) => t !== type);
      if (prev.length >= MAX_TYPES) return prev;
      return [...prev, type];
    });
  }

  function handleSubmit() {
    if (selected.length === 0) return;
    onSubmit(selected);
  }

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-2 px-2">
      <div className="grid w-full grid-cols-3 gap-1.5">
        {POKEMON_TYPES.map((type) => {
          const isSelected = selected.includes(type);
          const atCap = selected.length >= MAX_TYPES && !isSelected;
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggle(type)}
              disabled={disabled ?? atCap}
              aria-pressed={isSelected}
              aria-label={type}
              style={
                isSelected
                  ? { borderColor: `var(--color-poke-${type})` }
                  : undefined
              }
              className={`flex flex-col items-center gap-0.5 rounded-lg border-2 p-1 transition-all ${
                isSelected
                  ? "scale-105"
                  : "border-border-default hover:border-border-hover"
              } ${atCap ? "opacity-40" : ""} ${disabled ? "cursor-not-allowed" : ""}`}
            >
              <TypeIcon type={type} size={32} />
              <span className="text-xs capitalize text-text-secondary">
                {type}
              </span>
            </button>
          );
        })}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={disabled ?? selected.length === 0}
        className="w-full max-w-xs"
      >
        Submit ({selected.length}/{MAX_TYPES})
      </Button>
    </div>
  );
}
