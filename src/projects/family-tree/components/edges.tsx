"use client";

import { parentChildPaths, unionLine, type ParentChildEdge } from "../edge-geometry";
import { isDirectLineLink } from "../logic";
import type { LaidOutEdge, LaidOutNode, Layout, UnionStatus } from "../types";

interface EdgesProps {
  layout: Layout;
  // The view root's direct line, whose parent links are highlighted.
  line: ReadonlySet<string>;
}

function parentIds(edge: ParentChildEdge): string[] {
  return edge.parentBId === null ? [edge.parentAId] : [edge.parentAId, edge.parentBId];
}

const MARRIAGE_STROKE = "var(--color-brand-pink)";
const PARTNER_STROKE = "var(--color-brand-green)";
const DIRECT_LINE_STROKE = "var(--color-family-direct-line)";

const UNION_LINE_STYLES: Record<
  UnionStatus,
  { stroke: string; dashed: boolean }
> = {
  married: { stroke: MARRIAGE_STROKE, dashed: false },
  // Drawn exactly like a current marriage: the tree never shows who has died.
  "ended-by-death": { stroke: MARRIAGE_STROKE, dashed: false },
  divorced: { stroke: MARRIAGE_STROKE, dashed: true },
  partner: { stroke: PARTNER_STROKE, dashed: false },
  "ex-partner": { stroke: PARTNER_STROKE, dashed: true },
};

export function Edges({ layout, line }: EdgesProps) {
  const byId = new Map<string, LaidOutNode>(layout.nodes.map((n) => [n.id, n]));
  const pathOf = parentChildPaths(layout);
  const onLine = (edge: LaidOutEdge): boolean =>
    edge.kind === "parent-child" && isDirectLineLink(line, edge.childId, parentIds(edge));
  // Siblings share their parents' drop, so the direct line is drawn last to
  // stay on top where it overlaps a side branch.
  const ordered = layout.edges
    .map((edge, i) => ({ edge, i, highlighted: onLine(edge) }))
    .sort((a, b) => Number(a.highlighted) - Number(b.highlighted));

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0"
      width={layout.width}
      height={layout.height}
      style={{ overflow: "visible" }}
    >
      {ordered.map(({ edge, i, highlighted }) => {
        if (edge.kind === "spouse") {
          const a = byId.get(edge.aId);
          const b = byId.get(edge.bId);
          if (!a || !b) return null;
          const { x1, x2, y } = unionLine(a, b);
          const style = UNION_LINE_STYLES[edge.status];
          return (
            <line
              key={`s-${i}`}
              x1={x1}
              y1={y}
              x2={x2}
              y2={y}
              stroke={style.stroke}
              strokeWidth={2}
              strokeDasharray={style.dashed ? "6 4" : undefined}
              opacity={style.dashed ? 0.7 : 1}
            />
          );
        }
        const points = pathOf(edge);
        if (points === null) return null;
        const d = points.map((p, j) => `${j === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
        return (
          <path
            key={`p-${i}`}
            d={d}
            fill="none"
            stroke={highlighted ? DIRECT_LINE_STROKE : "var(--color-border-hover)"}
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}
