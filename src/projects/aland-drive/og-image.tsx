import { OG_COLORS } from "@/shared/lib/og/colors";
import { Wordmark } from "@/shared/lib/og/default-card";
import type { ProjectOgImage } from "@/shared/lib/og/project-card";
import { PROJECTS } from "@/shared/lib/constants";

const C = (token: string) => OG_COLORS[`aland-drive-${token}` as keyof typeof OG_COLORS];
const svgSrc = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

// Åland's flag: a blue field, a yellow Nordic cross and a red one inside it.
function flag(x: number, y: number, w: number) {
  const h = w * (17 / 26);
  const u = w / 26;
  return `<g transform="translate(${x} ${y})">
    <rect width="${w}" height="${h}" fill="${C("flag-ax-blue")}"/>
    <rect x="${8 * u}" width="${4 * u}" height="${h}" fill="${C("flag-ax-yellow")}"/>
    <rect y="${6.5 * u}" width="${w}" height="${4 * u}" fill="${C("flag-ax-yellow")}"/>
    <rect x="${9.5 * u}" width="${u}" height="${h}" fill="${C("flag-ax-red")}"/>
    <rect y="${8 * u}" width="${w}" height="${u}" fill="${C("flag-ax-red")}"/>
  </g>`;
}

function spruce(x: number, base: number, h: number, color: string) {
  const w = h * 0.42;
  return `<path d="M${x} ${base - h} L${x + w / 2} ${base} L${x - w / 2} ${base} Z" fill="${color}"/>`;
}

function sailboat(x: number, y: number, k: number) {
  return `<g transform="translate(${x} ${y}) scale(${k})">
    <path d="M-30 0 L34 0 L26 10 L-24 10 Z" fill="${C("wall-trim")}"/>
    <path d="M0 -4 L0 -78 L28 -6 Z" fill="${C("ui-ink")}"/>
    <path d="M-3 -6 L-3 -64 L-26 -6 Z" fill="${C("ui-ink")}" opacity="0.85"/>
    <rect x="-1.5" y="-80" width="3" height="78" fill="${C("car-trim")}"/>
  </g>`;
}

// A summer's day on the shore: the sun's glare over the sea, sails, a red cottage under Åland's flag, and the car
// heading off up the road into the spruce.
const SCENE = `<svg viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C("sky")}"/>
      <stop offset="1" stop-color="${C("sun")}"/>
    </linearGradient>
    <radialGradient id="glare" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${C("sun")}" stop-opacity="1"/>
      <stop offset="0.3" stop-color="${C("sun")}" stop-opacity="0.8"/>
      <stop offset="1" stop-color="${C("sun")}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="345" fill="url(#sky)"/>
  <circle cx="990" cy="230" r="340" fill="url(#glare)"/>
  <circle cx="990" cy="230" r="50" fill="${C("sun")}"/>
  <rect y="340" width="1200" height="290" fill="${C("water")}"/>
  <path d="M560 344 Q600 326 650 336 Q700 330 740 344 Z" fill="${C("tree-spruce")}" opacity="0.55"/>
  <path d="M0 344 Q60 330 140 338 Q200 332 250 344 Z" fill="${C("tree-spruce")}" opacity="0.5"/>
  <path d="M0 470 Q120 440 260 452 Q380 430 520 440 Q700 418 860 404 Q1000 392 1200 396 L1200 630 L0 630 Z" fill="${C("ground")}"/>
  <path d="M40 470 Q70 446 110 462 Q130 470 120 476 Z" fill="${C("church-granite-pink")}"/>
  <path d="M150 458 Q200 438 250 454 Q240 462 160 464 Z" fill="${C("church-granite-pink")}"/>
  ${[880, 920, 960, 1000, 1040, 1080, 1120, 1160, 1195].map((x, i) => spruce(x, 410 + (i % 2) * 6, 90 + ((i * 37) % 50), C("tree-spruce"))).join("")}
  ${[820, 852].map((x) => spruce(x, 412, 70, C("tree-pine"))).join("")}
  <path d="M1000 404 L1016 404 C1000 470 1040 540 1110 630 L560 630 C700 540 900 470 1000 404 Z" fill="${C("road-main")}"/>
  <path d="M1008 406 C960 470 940 540 850 630" stroke="${C("road-paint")}" stroke-width="7" stroke-dasharray="44 34" fill="none"/>
  <g transform="translate(250 380)">
    <path d="M-10 32 L55 -6 L120 32 Z" fill="${C("barn-tar")}"/>
    <rect y="30" width="110" height="56" fill="${C("wall-red")}"/>
    <rect y="30" width="6" height="56" fill="${C("wall-trim")}"/>
    <rect x="104" y="30" width="6" height="56" fill="${C("wall-trim")}"/>
    <rect x="18" y="44" width="22" height="22" fill="${C("wall-glass")}" stroke="${C("wall-trim")}" stroke-width="4"/>
    <rect x="70" y="50" width="20" height="36" fill="${C("wall-trim")}"/>
  </g>
  <rect x="400" y="350" width="4" height="100" fill="${C("wall-trim")}"/>
  ${flag(404, 352, 52)}
  ${sailboat(620, 382, 0.75)}
  ${sailboat(470, 364, 0.45)}
  <g transform="translate(720 492)">
    <rect x="14" y="0" width="92" height="34" rx="12" fill="${C("car-body")}"/>
    <rect x="24" y="4" width="72" height="22" rx="7" fill="${C("car-glass")}"/>
    <rect x="0" y="28" width="120" height="44" rx="10" fill="${C("car-body")}"/>
    <rect x="8" y="38" width="22" height="9" rx="3" fill="${C("car-glow-tail")}"/>
    <rect x="90" y="38" width="22" height="9" rx="3" fill="${C("car-glow-tail")}"/>
    <rect x="6" y="66" width="24" height="18" rx="4" fill="${C("car-trim")}"/>
    <rect x="90" y="66" width="24" height="18" rx="4" fill="${C("car-trim")}"/>
  </g>
</svg>`;

// Blue chrome, as the Test Drive Unlimited logos have it: white into sky, a hard dark horizon, then the sea's blue
// brightening back to white.
const CHROME = `linear-gradient(180deg, ${C("ui-ink")} 0%, ${C("sky")} 44%, ${C("ui-ink")} 50%, ${C("ui-shade")} 51%, ${C("water")} 64%, ${C("sky")} 84%, ${C("ui-ink")} 100%)`;

// The Å's ring stands above the line's box, and Satori clips text to its box, so every layer has room above it.
const TITLE = { fontSize: 108, fontWeight: 700, lineHeight: 1.05, paddingTop: 28 } as const;

function ChromeTitle({ text }: { text: string }) {
  return (
    <div style={{ position: "relative", display: "flex", transform: "skewX(-8deg)", marginLeft: 10 }}>
      {[7, 0].map((offset) => (
        <div
          key={offset}
          style={{
            ...TITLE,
            position: "absolute",
            top: offset,
            left: offset,
            color: C("ui-shade"),
            WebkitTextStroke: `10px ${C("ui-shade")}`,
          }}
        >
          {text}
        </div>
      ))}
      <div style={{ ...TITLE, backgroundImage: CHROME, backgroundClip: "text", color: "transparent" }}>{text}</div>
    </div>
  );
}

function Card() {
  const project = PROJECTS.find((p) => p.slug === "aland-drive");
  if (!project) throw new Error('No project with slug "aland-drive"');
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: "Space Grotesk" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og ImageResponse is rendered by Satori to a PNG, so next/image cannot be used; plain <img> is the documented Satori API */}
      <img alt="" src={svgSrc(SCENE)} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0 }} />
      <div style={{ position: "absolute", top: 14, left: 52, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <ChromeTitle text="Åland Drive" />
        <div
          style={{
            marginTop: 10,
            display: "flex",
            padding: "4px 20px",
            backgroundColor: C("flag-ax-red"),
            color: C("ui-ink"),
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: 16,
          }}
        >
          UNLIMITED
        </div>
        <div style={{ marginTop: 16, fontSize: 28, fontWeight: 500, color: C("ui-shade") }}>{project.description}</div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 28,
          left: 40,
          display: "flex",
          padding: "10px 18px",
          borderRadius: 12,
          backgroundColor: OG_COLORS["surface-primary"],
        }}
      >
        <Wordmark fontSize={24} />
      </div>
    </div>
  );
}

export const ogImage: ProjectOgImage = {
  alt: "Åland Drive Unlimited: a red car drives up a shore road past a red cottage under Åland's flag, sails on the sea beyond",
  Card,
};
