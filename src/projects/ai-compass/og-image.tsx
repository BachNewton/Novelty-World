import { OG_COLORS } from "@/shared/lib/og/colors";
import { ProjectOgCard, type ProjectOgImage } from "@/shared/lib/og/project-card";
import { LEVELS, levelCentre, type Level } from "./compass";

// The compass's corners as the page colours them: Satori can't read the CSS
// variables, so the blend is worked out here in plain RGB.
const CORNERS = {
  askSteered: OG_COLORS["brand-orange"],
  delegateSteered: OG_COLORS["brand-pink"],
  askAccepted: OG_COLORS["brand-green"],
  delegateAccepted: OG_COLORS["brand-blue"],
};

function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const rgb = [0, 1, 2].map((i) => Math.round(channel(a, i) * (1 - t) + channel(b, i) * t));
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function colorAt(scope: number, ownership: number): string {
  const top = mix(CORNERS.askSteered, CORNERS.delegateSteered, scope);
  const bottom = mix(CORNERS.askAccepted, CORNERS.delegateAccepted, scope);
  return mix(bottom, top, ownership);
}

const ROWS: Level[] = [2, 1, 0];
const BG = OG_COLORS["surface-primary"];
const SIZE = 380;

/** A few people, placed as the quiz might place them. */
const PEOPLE = [
  { scope: 0.12, ownership: 0.86 },
  { scope: 0.47, ownership: 0.58 },
  { scope: 0.79, ownership: 0.7 },
  { scope: 0.62, ownership: 0.42 },
  { scope: 0.9, ownership: 0.16 },
  { scope: 0.3, ownership: 0.24 },
];

function Plane() {
  const cell = SIZE / 3;
  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE, display: "flex", flexWrap: "wrap", borderRadius: 14, overflow: "hidden" }}>
      {ROWS.flatMap((ownership) =>
        LEVELS.map((scope) => {
          const color = colorAt(levelCentre(scope), levelCentre(ownership));
          return (
            <div
              key={`${scope}-${ownership}`}
              style={{ width: cell, height: cell, backgroundColor: mix(BG, color, 0.2), border: `1px solid ${mix(BG, color, 0.45)}` }}
            />
          );
        }),
      )}
      {PEOPLE.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: p.scope * SIZE - 11,
            top: (1 - p.ownership) * SIZE - 11,
            width: 22,
            height: 22,
            borderRadius: 11,
            border: `3px solid ${BG}`,
            backgroundColor: colorAt(p.scope, p.ownership),
          }}
        />
      ))}
    </div>
  );
}

export const ogImage: ProjectOgImage = {
  alt: "AI Compass: a grid shaded from corner to corner, with people placed on it by how much of their coding they hand to AI and how much of the result they own",
  Card: () => (
    <ProjectOgCard slug="ai-compass">
      <Plane />
    </ProjectOgCard>
  ),
};
