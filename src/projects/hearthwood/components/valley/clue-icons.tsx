import type { ClueMark } from "../../stories/story";

/*
 * The clues as small drawings for the examining card and the casebook, in
 * the same tones as their models in the world.
 */

const c = (name: string) => `var(--color-hearthwood-clue-${name})`;

function paw(x: number, y: number, key: string) {
  return (
    <g key={key}>
      <ellipse cx={x} cy={y} rx="2" ry="1.7" fill={c("print")} />
      {[
        [-1.9, -2.3],
        [-0.65, -3],
        [0.65, -3],
        [1.9, -2.3],
      ].map(([dx, dy]) => (
        <circle key={`${dx}`} cx={x + dx} cy={y + dy} r="0.65" fill={c("print")} />
      ))}
    </g>
  );
}

function drawing(mark: ClueMark) {
  switch (mark) {
    case "fox-prints":
      return (
        <>
          <ellipse cx="16" cy="16" rx="10" ry="14" fill={c("mud")} />
          {paw(15, 25, "a")}
          {paw(17, 18.5, "b")}
          {paw(15, 12, "c")}
          {paw(17, 5.8, "d")}
        </>
      );
    case "fur":
      return (
        <>
          <path d="M16 30 L16 15 M16 21 L10 13 M16 18 L22 10" stroke={c("twig")} strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <circle cx="15" cy="14" r="4" fill={c("fox")} />
          <circle cx="19.5" cy="12.5" r="3.4" fill={c("fox")} />
          <circle cx="12" cy="12" r="2.8" fill={c("fox")} />
          <circle cx="17" cy="11" r="2" fill={c("fox-light")} />
          <path d="M9.5 9.5 L8 7.5 M21.5 9 L23 7 M15 9.5 L15 7.4" stroke={c("fox")} strokeWidth="1.1" strokeLinecap="round" />
        </>
      );
    case "mitten":
      return (
        <>
          <path d="M9 25 L9 13 C9 7 12 4.5 15.5 4.5 C19 4.5 21.5 7 21.5 12 L21.5 25 Z" fill={c("mitten")} />
          <path d="M21.2 15.5 C24 13.5 27 14.6 26.2 17.5 C25.5 20 23 21 21.2 21.5 Z" fill={c("mitten")} />
          <rect x="8" y="23.5" width="14.5" height="5" rx="1.5" fill={c("cuff")} />
          <path d="M11 11 L19 11 M11 15 L19 15" stroke={c("cuff")} strokeWidth="1" strokeDasharray="1.6 1.4" opacity="0.8" />
        </>
      );
    case "crumbs":
      return (
        <>
          {[
            [6, 27],
            [9, 23.5],
            [8, 19.5],
            [12, 16.5],
            [14, 12.5],
            [18, 10.5],
            [21, 7],
            [25, 5],
          ].map(([x, y], i) => (
            <rect key={i} x={x - 1.3} y={y - 1.3} width="2.6" height="2.6" rx="0.7" transform={`rotate(${i * 27} ${x} ${y})`} fill={c("crumb")} />
          ))}
          {[
            [11, 25],
            [16.5, 15],
            [23.5, 9.5],
          ].map(([x, y]) => (
            <ellipse key={`${x}`} cx={x} cy={y} rx="1.6" ry="1.2" fill={c("honey")} />
          ))}
        </>
      );
    case "twigs":
      return (
        <>
          <path d="M4 22 L26 16 M7 14 L27 24 M10 27 L22 9 M5 18 L18 27" stroke={c("twig")} strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="13" cy="18" r="3.4" fill={c("wool")} />
          <circle cx="20" cy="20.5" r="2.8" fill={c("wool")} />
          <ellipse cx="22" cy="12.5" rx="3" ry="1.8" fill={c("moss")} />
        </>
      );
    case "feather":
      return (
        <>
          <path d="M24.5 4.5 C14 7 8 16 8.5 25 C17 23 24 14 24.5 4.5 Z" fill={c("feather")} />
          <path d="M8.5 25 C10 22 11.2 20.5 12.5 19 C11 22 9.6 24 8.5 25 Z" fill={c("sheen")} />
          <path d="M5.5 28.5 L24 5" stroke={c("sheen")} strokeWidth="1" strokeLinecap="round" />
          <path d="M15 14 L19 15 M13 18 L16.6 19.4 M17 10.5 L21 11" stroke={c("sheen")} strokeWidth="0.6" opacity="0.7" />
        </>
      );
    case "button":
      return (
        <>
          <circle cx="16" cy="16" r="10.5" fill={c("brass")} />
          <circle cx="16" cy="16" r="8" fill="none" stroke={c("print")} strokeWidth="0.8" opacity="0.4" />
          {[
            [13.3, 13.3],
            [18.7, 13.3],
            [13.3, 18.7],
            [18.7, 18.7],
          ].map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r="1.4" fill={c("print")} />
          ))}
          <path d="M24.5 10 C25.6 12 26 13.5 26.3 15" stroke={c("print")} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
          <path d="M9.5 10.5 C11 8.5 13 7.6 15 7.4" stroke={c("glint")} strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </>
      );
    case "rope":
      return (
        <>
          <ellipse cx="15" cy="17" rx="11" ry="8" fill="none" stroke={c("rope")} strokeWidth="3" />
          <ellipse cx="15" cy="16" rx="7.5" ry="5.2" fill="none" stroke={c("rope")} strokeWidth="2.8" opacity="0.9" />
          <ellipse cx="15" cy="15.4" rx="4" ry="2.6" fill="none" stroke={c("rope")} strokeWidth="2.6" />
          <path d="M24 21 C27 23 28.5 26 29 29" stroke={c("rope")} strokeWidth="3" strokeLinecap="round" fill="none" />
        </>
      );
    case "cane-prints":
      return (
        <>
          <ellipse cx="16" cy="16" rx="11" ry="14.5" fill={c("mud")} />
          {[
            [12.5, 23],
            [18.5, 15],
            [12.5, 7.5],
          ].map(([x, y]) => (
            <g key={`${x},${y}`}>
              <ellipse cx={x} cy={y - 1.3} rx="2.1" ry="3" fill={c("print")} />
              <ellipse cx={x} cy={y + 3} rx="1.7" ry="1.4" fill={c("print")} />
            </g>
          ))}
          <circle cx="23.5" cy="22" r="1.3" fill={c("print")} />
          <circle cx="7.5" cy="13" r="1.3" fill={c("print")} />
        </>
      );
    case "cloudberry-leaf":
      return (
        <>
          <path d="M16 29 L16 20" stroke={c("twig")} strokeWidth="1.4" strokeLinecap="round" />
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="16" cy="9.5" rx="4.6" ry="6.2" transform={`rotate(${a} 16 15)`} fill={c("leaf")} />
          ))}
          <circle cx="16" cy="15" r="3" fill={c("leaf")} />
          {[
            [24, 23],
            [26.2, 24.4],
            [24.6, 25.8],
            [26.6, 21.8],
            [23, 25.2],
          ].map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r="1.6" fill={c("berry")} />
          ))}
        </>
      );
  }
}

export function ClueIcon({ mark, label, className = "" }: { mark: ClueMark; label: string; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={label}>
      {drawing(mark)}
    </svg>
  );
}
