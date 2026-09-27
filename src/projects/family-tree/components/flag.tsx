import { FLAGS } from "../flags";
import type { HeritageCode } from "../heritages";

interface FlagProps {
  code: HeritageCode;
  // "fill" crops the flag to cover its box (medallions); "stretch" squeezes
  // the whole flag into it, so tricolors stay recognizable in a small slot.
  fit: "fill" | "stretch";
  className?: string;
}

export function Flag({ code, fit, className }: FlagProps) {
  const { viewBox, shapes } = FLAGS[code];
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio={fit === "fill" ? "xMidYMid slice" : "none"}
      className={className}
      aria-hidden
    >
      {shapes.map((shape) => (
        <path
          key={shape.d}
          d={shape.d}
          fill={shape.fill}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
        />
      ))}
    </svg>
  );
}
