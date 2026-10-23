import { OG_COLORS } from "@/shared/lib/og/colors";
import { ProjectOgCard, type ProjectOgImage } from "@/shared/lib/og/project-card";

// A sound wave across the chapter art: bar heights as fractions of the tile.
const WAVE = [0.18, 0.32, 0.5, 0.36, 0.62, 0.8, 0.54, 0.7, 0.42, 0.58, 0.3, 0.46, 0.24, 0.14];

const MONO = { fontFamily: "Space Mono", fontWeight: 700 } as const;

function PlayerArt() {
  return (
    <div
      style={{
        width: 400,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        padding: 26,
        borderRadius: 20,
        border: `2px solid ${OG_COLORS["border-default"]}`,
        backgroundColor: OG_COLORS["surface-secondary"],
      }}
    >
      <div
        style={{
          height: 160,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
          borderRadius: 14,
          backgroundImage: `linear-gradient(135deg, ${OG_COLORS["brand-pink"]}, ${OG_COLORS["brand-orange"]} 55%, ${OG_COLORS["brand-blue"]})`,
        }}
      >
        {WAVE.map((h, i) => (
          <div
            key={i}
            style={{ width: 12, height: 150 * h, borderRadius: 6, backgroundColor: OG_COLORS["surface-primary"], opacity: 0.75 }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 30, fontWeight: 700 }}>Chapter 7</span>
          <span style={{ ...MONO, fontSize: 18, color: OG_COLORS["text-muted"] }}>7 of 24</span>
        </div>
        <div style={{ display: "flex" }}>
          <div
            style={{
              width: 72,
              height: 72,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 36,
              backgroundColor: OG_COLORS["brand-orange"],
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24">
              <path d="M7 4.5v15l12-7.5z" fill={OG_COLORS["surface-primary"]} />
            </svg>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ height: 8, display: "flex", borderRadius: 4, backgroundColor: OG_COLORS["surface-elevated"] }}>
          <div style={{ width: "42%", height: "100%", borderRadius: 4, backgroundColor: OG_COLORS["brand-orange"] }} />
        </div>
        <div style={{ ...MONO, display: "flex", justifyContent: "space-between", fontSize: 18, color: OG_COLORS["text-secondary"] }}>
          <span>12:48</span>
          <span>-17:31</span>
        </div>
      </div>
    </div>
  );
}

export const ogImage: ProjectOgImage = {
  alt: "Audiobook: a player with the chapter's art, its progress and a play button",
  Card: () => (
    <ProjectOgCard slug="audiobook">
      <PlayerArt />
    </ProjectOgCard>
  ),
};
