"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFamilyTreeStore } from "../store";
import {
  ROOT_ID,
  ROOT_FIRST_NAME,
  countChildren,
  describeRelation,
  fullName,
  nearestInDirection,
  nextGender,
  type NavDirection,
} from "../logic";
import { useLayoutWorker } from "../use-layout-worker";
import type { Layout, Tree } from "../types";
import { PanZoom } from "./pan-zoom";
import { Node } from "./node";
import { Edges } from "./edges";
import { ActionPanel, type MarriageOption, type PanelMode } from "./action-panel";
import { Button } from "@/shared/components/ui/button";

function arrowDirection(key: string): NavDirection | null {
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";
  return null;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "BUTTON") return true;
  return target.isContentEditable;
}

function deleteWithConfirm(
  tree: Tree,
  personId: string,
  remove: (id: string) => void,
): void {
  const p = tree.persons[personId];
  if (p.id === ROOT_ID) return;
  const childCount = countChildren(tree, personId);
  if (childCount > 0) {
    const ok = window.confirm(
      `${fullName(p)} has ${childCount} ${childCount === 1 ? "child" : "children"} listed. Remove anyway? Their children will keep their other parent (if any).`,
    );
    if (!ok) return;
  }
  remove(personId);
}

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
  const divorce = useFamilyTreeStore((s) => s.divorce);
  const rename = useFamilyTreeStore((s) => s.rename);
  const setGender = useFamilyTreeStore((s) => s.setGender);
  const remove = useFamilyTreeStore((s) => s.remove);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const { layout, kind } = useLayoutWorker(tree);

  const [panelMode, setPanelMode] = useState<PanelMode>("menu");
  // Reset to the menu whenever the active selection changes — tracking the
  // previous selection in state is React's recommended pattern for resets:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (prevSelectedId !== selectedId) {
    setPrevSelectedId(selectedId);
    if (panelMode !== "menu") setPanelMode("menu");
  }

  // Refs let the keyboard handler read latest values without re-attaching
  // the listener on every keystroke (which would also break OS auto-repeat).
  const layoutRef = useRef<Layout>(layout);
  const panelModeRef = useRef<PanelMode>(panelMode);
  useEffect(() => { layoutRef.current = layout; }, [layout]);
  useEffect(() => { panelModeRef.current = panelMode; }, [panelMode]);

  const handleDelete = useCallback(
    (id: string) => { deleteWithConfirm(tree, id, remove); },
    [tree, remove],
  );

  useEffect(() => {
    const store = useFamilyTreeStore;
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Esc always escapes — back out of a submode, or deselect.
      if (e.key === "Escape") {
        e.preventDefault();
        if (panelModeRef.current !== "menu") {
          setPanelMode("menu");
        } else if (store.getState().selectedId !== null) {
          store.getState().setSelected(null);
        }
        return;
      }

      if (isInteractiveTarget(e.target)) return;

      const dir = arrowDirection(e.key);
      if (dir !== null) {
        e.preventDefault();
        const sid = store.getState().selectedId;
        if (sid === null) {
          store.getState().setSelected(ROOT_ID);
          return;
        }
        const lay = layoutRef.current;
        const current = lay.nodes.find((n) => n.id === sid);
        if (!current) {
          store.getState().setSelected(ROOT_ID);
          return;
        }
        const next = nearestInDirection(current, lay.nodes, dir);
        if (next) store.getState().setSelected(next.id);
        return;
      }

      if (e.repeat) return;

      const sid = store.getState().selectedId;
      if (sid === null) {
        if (e.key === "Enter") {
          e.preventDefault();
          store.getState().setSelected(ROOT_ID);
        }
        return;
      }

      const tr = store.getState().tree;
      const person = tr.persons[sid];

      const k = e.key.toLowerCase();
      if (k === "p") {
        if (person.parentIds.length >= 2) return;
        e.preventDefault();
        setPanelMode("add-parent");
      } else if (k === "c") {
        e.preventDefault();
        setPanelMode("add-child");
      } else if (k === "m") {
        e.preventDefault();
        setPanelMode("add-spouse");
      } else if (k === "r") {
        e.preventDefault();
        setPanelMode("rename");
      } else if (k === "g") {
        e.preventDefault();
        store.getState().setGender(sid, nextGender(person.gender));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteWithConfirm(tr, sid, store.getState().remove);
      } else if (e.key === "Enter") {
        if (panelModeRef.current !== "menu") {
          e.preventDefault();
          setPanelMode("menu");
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); };
  }, []);

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

  const selectedMarriages: MarriageOption[] = useMemo(() => {
    if (!selectedPerson) return [];
    const toOption = (
      partnerId: string,
      status: "married" | "divorced",
    ): MarriageOption => ({
      partnerId,
      partnerName: fullName(tree.persons[partnerId]),
      status,
    });
    return [
      ...selectedPerson.spouseIds.map((id) => toOption(id, "married")),
      ...selectedPerson.divorcedSpouseIds.map((id) => toOption(id, "divorced")),
    ];
  }, [selectedPerson, tree.persons]);

  return (
    <div className="relative flex h-[calc(100vh-4rem)] w-full flex-col bg-surface-primary">
      <header className="flex items-center justify-between gap-3 border-b border-border-default px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text-primary">Family Tree</h1>
          <p className="truncate text-xs text-text-muted">
            {personCount} {personCount === 1 ? "person" : "people"}
            <span className="mx-1">·</span>
            viewing from{" "}
            <span className="text-brand-blue">{fullName(viewRoot)}</span>
            {status === "loading" ? " · loading…" : null}
            {status === "error" ? " · offline (local only)" : null}
            {saving ? " · saving…" : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {layout.nodes.length > 0 && (kind === "simple" || kind === "nice") ? (
            <span
              className="flex items-center gap-1.5 rounded-full border border-border-default bg-surface-elevated px-2 py-1 text-xs text-text-secondary sm:px-2.5"
              aria-live="polite"
              aria-label="Optimizing layout"
              title="Showing an approximate layout while we compute the optimal one."
            >
              <span
                className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-orange"
                aria-hidden
              />
              <span className="hidden sm:inline">Optimizing layout…</span>
              <span className="sm:hidden">Optimizing…</span>
            </span>
          ) : null}
          {showResetView ? (
            <Button variant="ghost" onClick={resetViewRoot}>
              Reset to {ROOT_FIRST_NAME}
            </Button>
          ) : null}
          <p className="hidden text-xs text-text-muted lg:block">
            Drag/WASD pan · scroll/+− zoom · arrows select · P/C/M add · R rename · G gender · Del delete
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

        {layout.nodes.length === 0 ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-live="polite"
          >
            <div className="flex flex-col items-center gap-3 text-text-secondary">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-brand-orange"
                aria-hidden
              />
              <span className="text-sm">Computing layout…</span>
            </div>
          </div>
        ) : null}

        {selectedPerson ? (
          <ActionPanel
            key={selectedPerson.id}
            person={selectedPerson}
            isViewRoot={selectedPerson.id === effectiveViewRootId}
            marriages={selectedMarriages}
            mode={panelMode}
            onModeChange={setPanelMode}
            onClose={() => { setSelected(null); }}
            onAddParent={(firstName, lastName, gender) => { addParent(selectedPerson.id, firstName, lastName, gender); }}
            onAddChild={(firstName, lastName, gender, coParentId) => {
              // Pass null through unchanged — addChild treats null as
              // "explicit single parent" and undefined as "use default".
              addChild(
                selectedPerson.id,
                firstName,
                lastName,
                gender,
                coParentId,
              );
            }}
            onAddSpouse={(firstName, lastName, gender, status) => { addSpouse(selectedPerson.id, firstName, lastName, gender, status); }}
            onDivorce={(partnerId) => { divorce(selectedPerson.id, partnerId); }}
            onRename={(firstName, lastName, commonName) => { rename(selectedPerson.id, firstName, lastName, commonName); }}
            onSetGender={(gender) => { setGender(selectedPerson.id, gender); }}
            onSetAsViewRoot={() => { setViewRoot(selectedPerson.id); }}
            onDelete={() => { handleDelete(selectedPerson.id); }}
          />
        ) : null}
      </div>
    </div>
  );
}
