"use client";

import { useEffect, useMemo } from "react";
import { useFamilyTreeStore } from "../store";
import { ROOT_ID, ROOT_NAME, computeLayout, describeRelation } from "../logic";
import { PanZoom } from "./pan-zoom";
import { Node } from "./node";
import { Edges } from "./edges";
import { ActionPanel } from "./action-panel";
import { Button } from "@/shared/components/ui/button";

export function FamilyTree() {
  const tree = useFamilyTreeStore((s) => s.tree);
  const status = useFamilyTreeStore((s) => s.status);
  const saving = useFamilyTreeStore((s) => s.saving);
  const selectedId = useFamilyTreeStore((s) => s.selectedId);
  const viewRootId = useFamilyTreeStore((s) => s.viewRootId);
  const hydrate = useFamilyTreeStore((s) => s.hydrate);
  const setSelected = useFamilyTreeStore((s) => s.setSelected);
  const setViewRoot = useFamilyTreeStore((s) => s.setViewRoot);
  const resetViewRoot = useFamilyTreeStore((s) => s.resetViewRoot);
  const addParent = useFamilyTreeStore((s) => s.addParent);
  const addChild = useFamilyTreeStore((s) => s.addChild);
  const addSpouse = useFamilyTreeStore((s) => s.addSpouse);
  const rename = useFamilyTreeStore((s) => s.rename);
  const setGender = useFamilyTreeStore((s) => s.setGender);
  const remove = useFamilyTreeStore((s) => s.remove);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const layout = useMemo(() => computeLayout(tree), [tree]);

  // If viewRootId points at a person no longer in the tree (shouldn't happen
  // since `remove` clears it, but be defensive after a hydrate), fall back.
  const effectiveViewRootId =
    viewRootId in tree.persons ? viewRootId : ROOT_ID;
  const viewRoot = tree.persons[effectiveViewRootId];

  const relations = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const id of Object.keys(tree.persons)) {
      const r = describeRelation(tree, effectiveViewRootId, id);
      map.set(id, r.label);
    }
    return map;
  }, [tree, effectiveViewRootId]);

  const selectedPerson = selectedId ? tree.persons[selectedId] : undefined;
  const personCount = Object.keys(tree.persons).length;
  const showResetView = effectiveViewRootId !== ROOT_ID;

  return (
    <div className="relative flex h-[calc(100vh-4rem)] w-full flex-col bg-surface-primary">
      <header className="flex items-center justify-between gap-3 border-b border-border-default px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text-primary">Family Tree</h1>
          <p className="truncate text-xs text-text-muted">
            {personCount} {personCount === 1 ? "person" : "people"}
            <span className="mx-1">·</span>
            viewing from{" "}
            <span className="text-brand-blue">{viewRoot.name}</span>
            {status === "loading" ? " · loading…" : null}
            {status === "error" ? " · offline (local only)" : null}
            {saving ? " · saving…" : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showResetView ? (
            <Button variant="ghost" onClick={resetViewRoot}>
              Reset to {ROOT_NAME.split(" ")[0]}
            </Button>
          ) : null}
          <p className="hidden text-xs text-text-muted lg:block">
            Drag or WASD to pan · scroll, pinch, or +/− to zoom · click a person
          </p>
        </div>
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
              isViewRoot={n.id === effectiveViewRootId}
              relation={relations.get(n.id) ?? null}
              onSelect={setSelected}
            />
          ))}
        </PanZoom>

        {selectedPerson ? (
          <ActionPanel
            key={selectedPerson.id}
            tree={tree}
            person={selectedPerson}
            isViewRoot={selectedPerson.id === effectiveViewRootId}
            onClose={() => { setSelected(null); }}
            onAddParent={(name, gender) => { addParent(selectedPerson.id, name, gender); }}
            onAddChild={(name, gender) => { addChild(selectedPerson.id, name, gender); }}
            onAddSpouse={(name, gender) => { addSpouse(selectedPerson.id, name, gender); }}
            onRename={(name) => { rename(selectedPerson.id, name); }}
            onSetGender={(gender) => { setGender(selectedPerson.id, gender); }}
            onSetAsViewRoot={() => { setViewRoot(selectedPerson.id); }}
            onDelete={() => { remove(selectedPerson.id); }}
          />
        ) : null}
      </div>
    </div>
  );
}
