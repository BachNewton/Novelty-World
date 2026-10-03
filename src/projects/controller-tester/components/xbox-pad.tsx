import type { StandardButton, StandardControls, Stick } from "@/shared/lib/gamepad";
import { cn } from "@/shared/lib/utils";

const BODY =
  "M 110 62 C 150 52, 250 52, 290 62 C 330 67, 360 82, 372 122 C 390 182, 395 242, 360 257 " +
  "C 335 267, 315 242, 295 212 C 285 197, 270 192, 255 192 L 145 192 C 130 192, 115 197, 105 212 " +
  "C 85 242, 65 267, 40 257 C 5 242, 10 182, 28 122 C 40 82, 70 67, 110 62 Z";

const FACE: { name: StandardButton; x: number; y: number; fill: string; stroke: string; text: string }[] = [
  { name: "Y", x: 300, y: 92, fill: "fill-brand-orange", stroke: "stroke-brand-orange", text: "fill-brand-orange" },
  { name: "X", x: 274, y: 118, fill: "fill-brand-blue", stroke: "stroke-brand-blue", text: "fill-brand-blue" },
  { name: "B", x: 326, y: 118, fill: "fill-brand-pink", stroke: "stroke-brand-pink", text: "fill-brand-pink" },
  { name: "A", x: 300, y: 144, fill: "fill-brand-green", stroke: "stroke-brand-green", text: "fill-brand-green" },
];

const STICK_RADIUS = 26;
const NUB_RADIUS = 11;
const STICK_TRAVEL = STICK_RADIUS - NUB_RADIUS;

interface XboxPadProps {
  controls: StandardControls;
  /** Raw stick axes: left x, left y, right x, right y. */
  axes: readonly number[];
  deadzone: number;
}

/** A drawn Xbox-style controller that lights up as it's used. */
export function XboxPad({ controls, axes, deadzone }: XboxPadProps) {
  const held = (name: StandardButton): boolean => controls.buttons[name].pressed;

  return (
    <svg viewBox="0 0 400 272" className="w-full" role="img" aria-label="Controller diagram">
      <Trigger x={70} label="LT" value={controls.leftTrigger} />
      <Trigger x={262} label="RT" value={controls.rightTrigger} />
      <Bumper x={68} label="LB" pressed={held("LB")} />
      <Bumper x={254} label="RB" pressed={held("RB")} />

      <path d={BODY} className="fill-surface-elevated stroke-border-hover" strokeWidth={3} />

      <StickWell
        x={110}
        y={118}
        raw={{ x: axes[0] ?? 0, y: axes[1] ?? 0 }}
        out={controls.leftStick}
        deadzone={deadzone}
        pressed={held("LS")}
      />
      <StickWell
        x={250}
        y={160}
        raw={{ x: axes[2] ?? 0, y: axes[3] ?? 0 }}
        out={controls.rightStick}
        deadzone={deadzone}
        pressed={held("RS")}
      />

      <DPad x={150} y={160} held={held} />

      <SmallButton x={175} y={110} label="View" pressed={held("View")} />
      <SmallButton x={225} y={110} label="Menu" pressed={held("Menu")} />
      <circle
        cx={200}
        cy={82}
        r={12}
        strokeWidth={3}
        className={cn("stroke-brand-green transition-colors", held("Home") ? "fill-brand-green" : "fill-surface-tertiary")}
      />

      {FACE.map((b) => (
        <g key={b.name}>
          <circle
            cx={b.x}
            cy={b.y}
            r={13}
            strokeWidth={3}
            className={cn(b.stroke, "transition-colors", held(b.name) ? b.fill : "fill-surface-tertiary")}
          />
          <text
            x={b.x}
            y={b.y + 5}
            textAnchor="middle"
            fontSize={14}
            fontWeight={700}
            className={cn("pointer-events-none", held(b.name) ? "fill-surface-primary" : b.text)}
          >
            {b.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Trigger({ x, label, value }: { x: number; label: string; value: number }) {
  const height = 22;
  return (
    <g>
      <rect x={x} y={4} width={68} height={height} rx={6} className="fill-surface-tertiary stroke-border-hover" strokeWidth={2} />
      <rect x={x} y={4} width={68 * value} height={height} rx={6} className="fill-brand-orange" />
      <text x={x + 34} y={20} textAnchor="middle" fontSize={11} fontWeight={700} className="pointer-events-none fill-text-primary">
        {label} {Math.round(value * 100)}%
      </text>
    </g>
  );
}

function Bumper({ x, label, pressed }: { x: number; label: string; pressed: boolean }) {
  return (
    <g>
      <rect
        x={x}
        y={34}
        width={78}
        height={20}
        rx={9}
        strokeWidth={2}
        className={cn("stroke-brand-blue transition-colors", pressed ? "fill-brand-blue" : "fill-surface-tertiary")}
      />
      <text x={x + 39} y={48} textAnchor="middle" fontSize={11} fontWeight={700} className={cn("pointer-events-none", pressed ? "fill-surface-primary" : "fill-text-primary")}>
        {label}
      </text>
    </g>
  );
}

function StickWell({ x, y, raw, out, deadzone, pressed }: { x: number; y: number; raw: Stick; out: Stick; deadzone: number; pressed: boolean }) {
  // The nub follows the raw stick, clamped to its circle; it lights up once
  // the stick leaves the deadzone, i.e. once a game would see it.
  const magnitude = Math.hypot(raw.x, raw.y);
  const clamp = magnitude > 1 ? 1 / magnitude : 1;
  const live = out.x !== 0 || out.y !== 0;
  return (
    <g>
      <circle cx={x} cy={y} r={STICK_RADIUS} strokeWidth={3} className={cn("fill-surface-primary transition-colors", pressed ? "stroke-brand-pink" : "stroke-border-hover")} />
      <circle cx={x} cy={y} r={deadzone * STICK_TRAVEL + NUB_RADIUS} strokeWidth={1.5} strokeDasharray="3 3" className="fill-none stroke-text-muted" />
      <circle
        cx={x + raw.x * clamp * STICK_TRAVEL}
        cy={y + raw.y * clamp * STICK_TRAVEL}
        r={NUB_RADIUS}
        className={cn("transition-colors", pressed ? "fill-brand-pink" : live ? "fill-brand-blue" : "fill-text-muted")}
      />
    </g>
  );
}

function DPad({ x, y, held }: { x: number; y: number; held: (name: StandardButton) => boolean }) {
  const arm = 13;
  const reach = 30;
  const arms: { name: StandardButton; dx: number; dy: number }[] = [
    { name: "DpadUp", dx: 0, dy: -1 },
    { name: "DpadDown", dx: 0, dy: 1 },
    { name: "DpadLeft", dx: -1, dy: 0 },
    { name: "DpadRight", dx: 1, dy: 0 },
  ];
  return (
    <g>
      {arms.map((a) => {
        const horizontal = a.dx !== 0;
        const w = horizontal ? reach - arm / 2 : arm;
        const h = horizontal ? arm : reach - arm / 2;
        const left = a.dx < 0 ? x - reach : a.dx > 0 ? x + arm / 2 : x - arm / 2;
        const top = a.dy < 0 ? y - reach : a.dy > 0 ? y + arm / 2 : y - arm / 2;
        return (
          <rect
            key={a.name}
            x={left}
            y={top}
            width={w}
            height={h}
            rx={3}
            strokeWidth={2}
            className={cn("stroke-border-hover transition-colors", held(a.name) ? "fill-brand-orange" : "fill-surface-tertiary")}
          />
        );
      })}
      <rect x={x - arm / 2} y={y - arm / 2} width={arm} height={arm} className="fill-surface-tertiary" />
    </g>
  );
}

function SmallButton({ x, y, label, pressed }: { x: number; y: number; label: string; pressed: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} strokeWidth={2} className={cn("stroke-text-secondary transition-colors", pressed ? "fill-brand-pink" : "fill-surface-tertiary")} />
      <text x={x} y={y + 22} textAnchor="middle" fontSize={9} className="fill-text-secondary">
        {label}
      </text>
    </g>
  );
}
