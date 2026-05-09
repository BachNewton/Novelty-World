"use client";

import type { LaidOutNode, Layout } from "../types";
import { ROW_GAP } from "../logic";

interface EdgesProps {
  layout: Layout;
}

export function Edges({ layout }: EdgesProps) {
  const byId = new Map<string, LaidOutNode>(layout.nodes.map((n) => [n.id, n]));

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0"
      width={layout.width}
      height={layout.height}
      style={{ overflow: "visible" }}
    >
      {layout.edges.map((edge, i) => {
        if (edge.kind === "spouse") {
          const a = byId.get(edge.aId);
          const b = byId.get(edge.bId);
          if (!a || !b) return null;
          const y = a.y + a.h / 2;
          const x1 = a.x + a.w;
          const x2 = b.x;
          return (
            <line
              key={`s-${i}`}
              x1={x1}
              y1={y}
              x2={x2}
              y2={y}
              stroke="var(--color-brand-pink)"
              strokeWidth={2}
            />
          );
        }
        const child = byId.get(edge.childId);
        const a = byId.get(edge.parentAId);
        const b = edge.parentBId !== null ? byId.get(edge.parentBId) : null;
        if (!child || !a) return null;
        let parentMidX: number;
        if (b) {
          // Use the inner edges of the marriage line regardless of which
          // parent was passed first.
          const left = a.x <= b.x ? a : b;
          const right = a.x <= b.x ? b : a;
          parentMidX = (left.x + left.w + right.x) / 2;
        } else {
          parentMidX = a.x + a.w / 2;
        }
        const parentBottomY = a.y + a.h;
        const childTopY = child.y;
        const childMidX = child.x + child.w / 2;
        const elbowY = parentBottomY + ROW_GAP / 2;
        const d = `M ${parentMidX} ${parentBottomY} L ${parentMidX} ${elbowY} L ${childMidX} ${elbowY} L ${childMidX} ${childTopY}`;
        return (
          <path
            key={`p-${i}`}
            d={d}
            fill="none"
            stroke="var(--color-border-hover)"
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}
