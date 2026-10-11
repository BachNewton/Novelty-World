import { traitName } from "../../engine/describe";
import { stepsAboveSkull, type TraitTrack } from "../../play/tracks";
import { Lock, Skull } from "lucide-react";
import { TraitIcon } from "../icons";

/*
 * A trait as the character card prints it, shown rather than told: the
 * character's own values in a row, the clip on its step, a tick under the
 * starting step, a bar past the top for the ceiling, and the skull below the
 * lowest, padlocked before the haunt (when no one can die) and bare after.
 * A previewed change marks the step it lands on. The compact form, for six
 * explorers at once, keeps only the value and the steps left above the skull.
 */

/** One trait's track, with a change previewed when it has one. */
export function TrackRow({ track }: { track: TraitTrack }) {
  const name = traitName(track.trait);
  const { lands } = track;
  const moved = lands !== null && lands !== track.clip;
  const gain = typeof lands === "number" && lands > track.clip;
  const locked = track.skull === "locked";
  const skullHit = lands === "skull";
  return (
    <div aria-label={`${name} track`} className="flex items-center gap-1 text-xs">
      <TraitIcon trait={track.trait} label={name} className="size-5 shrink-0" />
      <span
        aria-label={locked ? "Skull: locked until the haunt" : "Skull: death"}
        data-skull={track.skull}
        data-after={skullHit ? "true" : undefined}
        className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded border ${
          skullHit ? "border-(--bt-danger) bg-(--bt-danger) text-(--bt-bg)" : locked ? "border-dashed border-(--bt-line) text-(--bt-muted)" : "border-(--bt-danger) text-(--bt-danger)"
        }`}
      >
        <Skull aria-hidden className="size-4" />
        {locked && <Lock aria-hidden className={`absolute -right-1 -bottom-1 size-3 rounded-sm bg-(--bt-panel) ${track.stopped ? "text-(--bt-accent)" : "text-(--bt-muted)"}`} />}
      </span>
      <ol className="flex min-w-0 flex-1 gap-0.5">
        {track.values.map((value, index) => {
          const now = index === track.clip;
          const then = moved && index === lands;
          return (
            <li
              key={index}
              aria-label={`${value}${now ? ", now" : ""}${index === track.start ? ", start" : ""}${index === track.values.length - 1 ? ", maximum" : ""}`}
              aria-current={now ? "true" : undefined}
              data-after={then ? "true" : undefined}
              className={`relative flex h-7 min-w-0 flex-1 items-center justify-center rounded border ${
                then
                  ? `${gain ? "border-(--bt-mood-supernatural) bg-(--bt-mood-supernatural)" : "border-(--bt-danger) bg-(--bt-danger)"} font-semibold text-(--bt-bg)`
                  : now
                    ? moved
                      ? "border-(--bt-ink) text-(--bt-muted) line-through"
                      : "border-(--bt-ink) bg-(--bt-ink) font-semibold text-(--bt-bg)"
                    : "border-(--bt-line) text-(--bt-muted)"
              }`}
            >
              {value}
              {index === track.start && <span aria-hidden className="absolute bottom-0.5 left-1/2 h-0.5 w-2 -translate-x-1/2 rounded-full bg-current" />}
            </li>
          );
        })}
      </ol>
      <span aria-hidden className="h-7 w-1 shrink-0 rounded-full bg-(--bt-ink)" />
    </div>
  );
}

/** A trait in brief: its value, and how many losses it can take before the skull. */
export function CompactTrait({ track }: { track: TraitTrack }) {
  const name = traitName(track.trait);
  const steps = stepsAboveSkull(track.clip);
  const near = track.skull === "live" && steps === 1;
  return (
    <span aria-label={`${name} ${track.values[track.clip]}, ${steps} ${steps === 1 ? "step" : "steps"} above the skull`} className="inline-flex items-center gap-0.5 whitespace-nowrap">
      <TraitIcon trait={track.trait} />
      <span className="font-semibold">{track.values[track.clip]}</span>
      <span className={`inline-flex items-center text-[10px] ${near ? "text-(--bt-danger)" : "text-(--bt-muted)"}`}>
        {steps}
        <Skull aria-hidden className="size-2.5" />
      </span>
    </span>
  );
}
