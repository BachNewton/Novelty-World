import { OG_COLORS } from "@/shared/lib/og/colors";
import { ProjectOgCard, type ProjectOgImage } from "@/shared/lib/og/project-card";

// A 0–11 attack with 3 slots at 80%, as the calculator shows it: the crit,
// each success count's damage, and the chance to deal at least that much.
const ROWS = [
  { label: "crit", damage: "13", chance: 0.026, tone: "crit" },
  { label: "3/3", damage: "11", chance: 0.512, tone: "plain" },
  { label: "2/3", damage: "7", chance: 0.896, tone: "plain" },
  { label: "1/3", damage: "3", chance: 0.992, tone: "plain" },
  { label: "0/3", damage: "miss", chance: 0.008, tone: "miss" },
] as const;

const TONE_COLORS = {
  crit: OG_COLORS["brand-orange"],
  plain: OG_COLORS["brand-blue"],
  miss: OG_COLORS["brand-pink"],
};

const MONO = { fontFamily: "Space Mono", fontWeight: 700 } as const;

function ResultTable() {
  return (
    <div
      style={{
        width: 420,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: 28,
        borderRadius: 16,
        border: `2px solid ${OG_COLORS["border-default"]}`,
        backgroundColor: OG_COLORS["surface-secondary"],
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 22 }}>
        <span style={{ fontWeight: 700 }}>Chance to deal at least</span>
        <span style={{ color: OG_COLORS["text-secondary"], fontWeight: 500 }}>avg 8.7</span>
      </div>
      {ROWS.map((row) => (
        <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, height: 32 }}>
          <span
            style={{
              width: 48,
              color: row.tone === "crit" ? TONE_COLORS.crit : OG_COLORS["text-muted"],
              fontWeight: row.tone === "crit" ? 700 : 500,
            }}
          >
            {row.label}
          </span>
          <span style={{ ...MONO, width: 64, color: row.tone === "plain" ? OG_COLORS["text-primary"] : TONE_COLORS[row.tone] }}>
            {row.damage}
          </span>
          <div style={{ flex: 1, height: 26, display: "flex", borderRadius: 5, backgroundColor: OG_COLORS["surface-tertiary"] }}>
            <div
              style={{
                width: `${String(row.chance * 100)}%`,
                minWidth: 4,
                height: "100%",
                borderRadius: 5,
                backgroundColor: TONE_COLORS[row.tone],
              }}
            />
          </div>
          <span style={{ ...MONO, width: 82, textAlign: "right", justifyContent: "flex-end" }}>
            {`${(row.chance * 100).toFixed(1)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

export const ogImage: ProjectOgImage = {
  alt: "For The Stats 2: the chance an attack deals at least each amount of damage, row by row",
  Card: () => (
    <ProjectOgCard slug="for-the-stats-2">
      <ResultTable />
    </ProjectOgCard>
  ),
};
