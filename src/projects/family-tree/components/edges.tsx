"use client";

import { parentChildPaths, unionPaths, unionPoints, type ParentChildEdge, type Point } from "../edge-geometry";
import { isDirectLineLink } from "../logic";
import type { LaidOutEdge, Layout, UnionStatus } from "../types";

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

function pathData(points: Point[]): string {
  return points.map((p, j) => `${j === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function Edges({ layout, line }: EdgesProps) {
  const unionOf = unionPaths(layout);
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
          const union = unionOf(edge);
          if (union === null) return null;
          const style = UNION_LINE_STYLES[edge.status];
          return (
            <path
              key={`s-${i}`}
              d={pathData(unionPoints(union))}
              fill="none"
              stroke={style.stroke}
              strokeWidth={2}
              strokeDasharray={style.dashed ? "6 4" : undefined}
              opacity={style.dashed ? 0.7 : 1}
            />
          );
        }
        const points = pathOf(edge);
        if (points === null) return null;
        return (
          <path
            key={`p-${i}`}
            d={pathData(points)}
            fill="none"
            stroke={highlighted ? DIRECT_LINE_STROKE : "var(--color-border-hover)"}
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}
