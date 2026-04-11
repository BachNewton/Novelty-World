import { starPoints, STAR_GLOW_RATIO, STAR_GLOW_OPACITY } from "@/shared/lib/stars";

// Centered in a 120x120 viewBox with outer radius 55
const CX = 60;
const CY = 60;
const OUTER_R = 55;
const POINTS = starPoints(CX, CY, OUTER_R);
const GLOW_R = OUTER_R * STAR_GLOW_RATIO;

interface StarProps {
  fill: string;
  className?: string;
}

export function Star({ fill, className }: StarProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx={CX} cy={CY} r={GLOW_R} fill={fill} opacity={STAR_GLOW_OPACITY} />
      <polygon points={POINTS} fill={fill} />
    </svg>
  );
}
