"use client";

import { GENERATIONS, getPlayablePokemon } from "../logic";
import { usePokemonStore } from "../store";

const GENERATION_LABELS: Record<number, string> = {
  1: "Gen I",
  2: "Gen II",
  3: "Gen III",
  4: "Gen IV",
  5: "Gen V",
  6: "Gen VI",
  7: "Gen VII",
  8: "Gen VIII",
  9: "Gen IX",
};

export function GenerationFilter() {
  const selectedGenerations = usePokemonStore((s) => s.selectedGenerations);
  const highScore = usePokemonStore((s) => s.highScore);
  const toggleGeneration = usePokemonStore((s) => s.toggleGeneration);
  const selectAllGenerations = usePokemonStore((s) => s.selectAllGenerations);
  const deselectAllGenerations = usePokemonStore((s) => s.deselectAllGenerations);

  const count = getPlayablePokemon(selectedGenerations).length;
  const allSelected = selectedGenerations.length === GENERATIONS.length;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">
          Generations
        </span>
        <button
          type="button"
          onClick={allSelected ? deselectAllGenerations : selectAllGenerations}
          className="text-xs text-brand-blue hover:underline"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {GENERATIONS.map((gen) => {
          const checked = selectedGenerations.includes(gen);
          return (
            <label
              key={gen}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-brand-green/40 px-2 py-2.5 text-sm transition-colors hover:bg-surface-elevated"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleGeneration(gen)}
                className="accent-brand-orange"
              />
              <span className={checked ? "text-text-primary" : "text-text-muted"}>
                {GENERATION_LABELS[gen]}
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
        <span>
          {count} Pokémon
        </span>
        <span>
          High Score:{" "}
          <span className="text-brand-orange" suppressHydrationWarning>
            {highScore}
          </span>
        </span>
      </div>
    </div>
  );
}
