"use client";

import { useEffect, useMemo } from "react";
import { useFamilyTreeStore } from "../store";
import { computeLayout } from "../logic";
import { PanZoom } from "./pan-zoom";
import { Node } from "./node";
import { Edges } from "./edges";
import { ActionPanel } from "./action-panel";

export function FamilyTree() {
  const tree = useFamilyTreeStore((s) => s.tree);
  const status = useFamilyTreeStore((s) => s.status);
  const saving = useFamilyTreeStore((s) => s.saving);
  const selectedId = useFamilyTreeStore((s) => s.selectedId);
  const hydrate = useFamilyTreeStore((s) => s.hydrate);
  const setSelected = useFamilyTreeStore((s) => s.setSelected);
  const addParent = useFamilyTreeStore((s) => s.addParent);
  const addChild = useFamilyTreeStore((s) => s.addChild);
  const addSpouse = useFamilyTreeStore((s) => s.addSpouse);
  const rename = useFamilyTreeStore((s) => s.rename);
  const remove = useFamilyTreeStore((s) => s.remove);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const layout = useMemo(() => computeLayout(tree), [tree]);
  const selectedPerson = selectedId ? tree.persons[selectedId] : undefined;
  const personCount = Object.keys(tree.persons).length;

  return (
    <div className="relative flex h-[calc(100vh-4rem)] w-full flex-col bg-surface-primary">
      <header className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Family Tree</h1>
          <p className="text-xs text-text-muted">
            {personCount} {personCount === 1 ? "person" : "people"}
            {status === "loading" ? " · loading…" : null}
            {status === "error" ? " · offline (local only)" : null}
            {saving ? " · saving…" : null}
          </p>
        </div>
        <p className="hidden text-xs text-text-muted md:block">
          Drag to pan · scroll or pinch to zoom · click a person to edit
        </p>
      </header>

      <div className="relative flex-1">
        <PanZoom
          contentWidth={layout.width}
          contentHeight={layout.height}
          refitKey={`${personCount}-init`}
          onBackgroundPointerDown={() => { setSelected(null); }}
        >
          <Edges layout={layout} />
          {layout.nodes.map((n) => (
            <Node
              key={n.id}
              node={n}
              person={tree.persons[n.id]}
              selected={selectedId === n.id}
              onSelect={setSelected}
            />
          ))}
        </PanZoom>

        {selectedPerson ? (
          <ActionPanel
            key={selectedPerson.id}
            tree={tree}
            person={selectedPerson}
            onClose={() => { setSelected(null); }}
            onAddParent={(name) => { addParent(selectedPerson.id, name); }}
            onAddChild={(name) => { addChild(selectedPerson.id, name); }}
            onAddSpouse={(name) => { addSpouse(selectedPerson.id, name); }}
            onRename={(name) => { rename(selectedPerson.id, name); }}
            onDelete={() => { remove(selectedPerson.id); }}
          />
        ) : null}
      </div>
    </div>
  );
}
