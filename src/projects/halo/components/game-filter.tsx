"use client";

import { getPlayableMaps } from "../logic";
import { useHaloStore } from "../store";

/** Ordered by release date, with short labels for compact display. */
const SOURCE_GAMES: { value: string; label: string }[] = [
  { value: "Halo: Combat Evolved", label: "Halo: CE" },
  { value: "Halo 2", label: "Halo 2" },
  { value: "Halo 3", label: "Halo 3" },
  { value: "Halo Wars", label: "Halo Wars" },
  { value: "Halo: Reach", label: "Halo: Reach" },
  { value: "Halo 4", label: "Halo 4" },
  { value: "Halo 2: Anniversary", label: "Halo 2: Anniversary" },
  { value: "Halo 5: Guardians", label: "Halo 5: Guardians" },
  { value: "Halo Online", label: "Halo Online" },
  { value: "Halo Wars 2", label: "Halo Wars 2" },
  { value: "Halo Infinite", label: "Halo Infinite" },
];

export function GameFilter() {
  const selectedGames = useHaloStore((s) => s.selectedGames);
  const highScore = useHaloStore((s) => s.highScore);
  const toggleGame = useHaloStore((s) => s.toggleGame);
  const selectAllGames = useHaloStore((s) => s.selectAllGames);
  const deselectAllGames = useHaloStore((s) => s.deselectAllGames);

  const mapCount = getPlayableMaps(selectedGames).length;
  const allSelected = selectedGames.length === SOURCE_GAMES.length;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">Games</span>
        <button
          type="button"
          onClick={allSelected ? deselectAllGames : selectAllGames}
          className="text-xs text-brand-blue hover:underline"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {SOURCE_GAMES.map(({ value, label }) => {
          const checked = selectedGames.includes(value);
          return (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-brand-green/40 px-2 py-2.5 text-sm transition-colors hover:bg-surface-elevated"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleGame(value)}
                className="accent-brand-orange"
              />
              <span className={checked ? "text-text-primary" : "text-text-muted"}>
                {label}
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
        <span>{mapCount} map{mapCount !== 1 ? "s" : ""}</span>
        <span>
          High Score: <span className="text-brand-orange" suppressHydrationWarning>{highScore}</span>
        </span>
      </div>
    </div>
  );
}
