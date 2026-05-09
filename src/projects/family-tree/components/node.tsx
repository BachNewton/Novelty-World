"use client";

import { type PointerEvent } from "react";
import type { LaidOutNode, Person } from "../types";
import { ROOT_ID } from "../logic";

interface NodeProps {
  node: LaidOutNode;
  person: Person;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function Node({ node, person, selected, onSelect }: NodeProps) {
  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
  }

  function handleClick() {
    onSelect(person.id);
  }

  const isRoot = person.id === ROOT_ID;

  return (
    <div
      className={[
        "absolute flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 px-3 py-2 text-center transition-colors",
        selected
          ? "border-brand-orange bg-surface-elevated"
          : isRoot
            ? "border-brand-blue bg-surface-tertiary hover:border-brand-pink"
            : "border-border-default bg-surface-secondary hover:border-border-hover",
      ].join(" ")}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <span className="text-sm font-medium text-text-primary leading-tight">
        {person.name}
      </span>
      {isRoot ? (
        <span className="mt-1 text-xs text-brand-blue">root</span>
      ) : null}
    </div>
  );
}
