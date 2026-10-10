import { PALETTE } from "./palette";
import type { PathLegend } from "./path-overlay";

/** The paths overlay's key: what each colour marks, and what the overlap check flags on the floor. */
export function PathLegendPanel({ legend }: { legend: PathLegend }) {
  return (
    <div className="pointer-events-none absolute bottom-20 left-3 max-w-[min(22rem,calc(100vw-1.5rem))]">
      <div className="pointer-events-auto max-h-[40vh] overflow-y-auto rounded border border-(--bt-line) bg-(--bt-panel)/90 p-2 text-xs">
        <ul className="space-y-0.5">
          {legend.marks.map(({ colour, label }) => (
            <li key={label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[colour] }} />
              {label}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-(--bt-muted)">Largest open floor: {legend.openFloor.toFixed(2)} m radius</p>
        {legend.findings.length === 0 ? (
          <p className="mt-1 text-(--bt-muted)">The floor checks find nothing.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-(--bt-danger)">
            {legend.findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
