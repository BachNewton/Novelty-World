"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Eye, Users } from "lucide-react";
import { useFamilyTreeStore } from "../store";
import {
  ROOT_ID,
  ROOT_FIRST_NAME,
  countChildren,
  describeRelation,
  fullName,
  heritageBreakdowns,
  isCurrentUnion,
  nearestInDirection,
  nextGender,
  type NavDirection,
} from "../logic";
import { useLayoutWorker } from "../use-layout-worker";
import type { LaidOutNode, Layout, Tree } from "../types";
import { PanZoom, type PanZoomHandle, type Point } from "./pan-zoom";
import { NameSearch } from "./name-search";
import { Node } from "./node";
import { Edges } from "./edges";
import { OptimizeStatus } from "./optimize-status";
import { SaveHaltBanner } from "./save-halt-banner";
import {
  ActionPanel,
  type BioChildCandidate,
  type MarriageOption,
  type PanelMode,
} from "./action-panel";
import { Button } from "@/shared/components/ui/button";
import { cn, isTextEntryTarget } from "@/shared/lib/utils";

const Tree3D = dynamic(() => import("./tree-3d").then((m) => m.Tree3D), {
  ssr: false,
});

type ViewMode = "2d" | "3d";

function arrowDirection(key: string): NavDirection | null {
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";
  return null;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (isTextEntryTarget(target)) return true;
  return target instanceof HTMLButtonElement;
}

function nodeCenter(node: LaidOutNode): Point {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

// Below `md` the action panel covers the lower part of the canvas, so a card
// jumped to (and thereby selected) is placed near the top instead of the
// center, where the panel would hide it.
function jumpAnchor(): Point {
  const panelBelow = !window.matchMedia("(min-width: 48rem)").matches;
  return { x: 0.5, y: panelBelow ? 0.2 : 0.5 };
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
  const setUnionStatus = useFamilyTreeStore((s) => s.setUnionStatus);
  const setUnionDeceased = useFamilyTreeStore((s) => s.setUnionDeceased);
  const rename = useFamilyTreeStore((s) => s.rename);
  const setGender = useFamilyTreeStore((s) => s.setGender);
  const setNotes = useFamilyTreeStore((s) => s.setNotes);
  const setBirthDate = useFamilyTreeStore((s) => s.setBirthDate);
  const setHeritage = useFamilyTreeStore((s) => s.setHeritage);
  const remove = useFamilyTreeStore((s) => s.remove);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const { layout, inSync, optimizing, optimize, cancelOptimize } =
    useLayoutWorker();

  const [panelMode, setPanelMode] = useState<PanelMode>("menu");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
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
        setPanelMode("edit");
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

  // What each card says under the name: "you" on the view root, otherwise
  // the relationship to it. Search results show the same line.
  const subtitles = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const id of Object.keys(tree.persons)) {
      map.set(
        id,
        id === effectiveViewRootId
          ? "you"
          : describeRelation(tree, effectiveViewRootId, id).label,
      );
    }
    return map;
  }, [tree, effectiveViewRootId]);

  const heritage = useMemo(() => heritageBreakdowns(tree), [tree]);

  const viewRootFocus = useMemo(() => {
    if (status !== "ready") return undefined;
    const node = layout.nodes.find((n) => n.id === effectiveViewRootId);
    return node && nodeCenter(node);
  }, [status, layout.nodes, effectiveViewRootId]);

  const panZoomRef = useRef<PanZoomHandle>(null);
  const [flash, setFlash] = useState<{ id: string; key: number } | null>(null);
  const jumpTo = useCallback(
    (id: string) => {
      setSelected(id);
      // Absent while the first layout is still computing.
      const node = layout.nodes.find((n) => n.id === id);
      if (node) panZoomRef.current?.panTo(nodeCenter(node), jumpAnchor());
      setFlash((f) => ({ id, key: (f?.key ?? 0) + 1 }));
    },
    [layout.nodes, setSelected],
  );

  const selectedPerson = selectedId ? tree.persons[selectedId] : undefined;
  const personCount = Object.keys(tree.persons).length;
  const showResetView = effectiveViewRootId !== ROOT_ID;

  const selectedMarriages: MarriageOption[] = useMemo(() => {
    if (!selectedPerson) return [];
    const { unions } = selectedPerson;
    return [
      ...unions.filter((u) => isCurrentUnion(u.status)),
      ...unions.filter((u) => !isCurrentUnion(u.status)),
    ].map((u) => ({
      partnerId: u.personId,
      partnerName: fullName(tree.persons[u.personId]),
      status: u.status,
      deceasedId: u.status === "ended-by-death" ? u.deceasedId : null,
    }));
  }, [selectedPerson, tree.persons]);

  // Kids of the selected person whose only listed bio parent IS the selected
  // person — a newly added spouse can be opted in as the missing second
  // parent for any subset of them.
  const bioChildCandidates: BioChildCandidate[] = useMemo(() => {
    if (!selectedPerson) return [];
    const out: BioChildCandidate[] = [];
    for (const candidate of Object.values(tree.persons)) {
      if (candidate.parentIds.length !== 1) continue;
      if (candidate.parentIds[0] !== selectedPerson.id) continue;
      out.push({ id: candidate.id, name: fullName(candidate) });
    }
    return out;
  }, [selectedPerson, tree.persons]);

  return (
    <div className="relative flex h-[calc(100vh-4rem)] w-full flex-col bg-surface-primary">
      <header className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border-default px-4 py-3">
        <h1 className="col-start-1 row-start-1 truncate text-xl font-semibold text-text-primary">
          Family Tree
        </h1>
        <p className="col-span-2 row-start-2 flex min-w-0 items-center gap-3 text-xs text-text-muted sm:col-span-1">
          <span
            className="flex shrink-0 items-center gap-1"
            title={`${personCount} ${personCount === 1 ? "person" : "people"} in the tree`}
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            {personCount}
          </span>
          <span
            className="flex min-w-0 items-center gap-1"
            title={`Viewing from ${fullName(viewRoot)}`}
          >
            <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate text-brand-blue">{fullName(viewRoot)}</span>
          </span>
          {status === "loading" ? <span className="shrink-0">loading…</span> : null}
          {status === "error" ? <span className="shrink-0">failed to load</span> : null}
          {saving ? <span className="shrink-0">saving…</span> : null}
        </p>
        <div className="col-start-2 row-start-1 flex items-center gap-2 sm:row-span-2">
          <NameSearch tree={tree} subtitles={subtitles} onPick={jumpTo} />
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <OptimizeControl
            ready={status === "ready"}
            inSync={inSync}
            optimizing={optimizing}
            onOptimize={optimize}
            onCancel={cancelOptimize}
          />
          {showResetView ? (
            <Button variant="ghost" onClick={resetViewRoot}>
              Reset to {ROOT_FIRST_NAME}
            </Button>
          ) : null}
          <p className="hidden text-xs text-text-muted lg:block">
            Drag/WASD pan · scroll/+− zoom · arrows select · P/C/M add · R edit · G gender · Del delete
          </p>
        </div>
      </header>

      <SaveHaltBanner />

      <div className="relative flex-1">
        {viewMode === "3d" ? (
          <Tree3D
            tree={tree}
            rootId={effectiveViewRootId}
            selectedId={selectedId}
            onSelect={setSelected}
          />
        ) : (
          <>
            <PanZoom
              ref={panZoomRef}
              contentWidth={layout.width}
              contentHeight={layout.height}
              initialFocus={viewRootFocus}
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
                  subtitle={subtitles.get(n.id) ?? null}
                  heritage={heritage[n.id]}
                  flashKey={flash?.id === n.id ? flash.key : null}
                  onFlashEnd={() => { setFlash(null); }}
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
          </>
        )}

        <OptimizeStatus />

        {selectedPerson ? (
          <ActionPanel
            key={selectedPerson.id}
            person={selectedPerson}
            isViewRoot={selectedPerson.id === effectiveViewRootId}
            marriages={selectedMarriages}
            bioChildCandidates={bioChildCandidates}
            mode={panelMode}
            onModeChange={setPanelMode}
            onClose={() => { setSelected(null); }}
            onAddParent={(name, gender) => { addParent(selectedPerson.id, name, gender); }}
            onAddChild={(name, gender, coParentId) => {
              // Pass null through unchanged — addChild treats null as
              // "explicit single parent" and undefined as "use default".
              addChild(selectedPerson.id, name, gender, coParentId);
            }}
            onAddSpouse={(name, gender, status, bioChildIds) => {
              addSpouse(selectedPerson.id, name, gender, status, bioChildIds);
            }}
            onSetUnionStatus={(partnerId, unionStatus) => {
              setUnionStatus(selectedPerson.id, partnerId, unionStatus);
            }}
            onSetUnionDeceased={(partnerId, deceasedId) => {
              setUnionDeceased(selectedPerson.id, partnerId, deceasedId);
            }}
            onRename={(name) => { rename(selectedPerson.id, name); }}
            onSetNotes={(notes) => { setNotes(selectedPerson.id, notes); }}
            onSetBirthDate={(birthDate) => { setBirthDate(selectedPerson.id, birthDate); }}
            heritage={heritage[selectedPerson.id]}
            onSetHeritage={(codes) => { setHeritage(selectedPerson.id, codes); }}
            onSetGender={(gender) => { setGender(selectedPerson.id, gender); }}
            onSetAsViewRoot={() => { setViewRoot(selectedPerson.id); }}
            onDelete={() => { handleDelete(selectedPerson.id); }}
          />
        ) : null}
      </div>
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className="flex rounded-md border border-border-default bg-surface-elevated p-0.5 text-xs font-semibold"
    >
      {(["2d", "3d"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          onClick={() => { onChange(mode); }}
          className={cn(
            "rounded px-2 py-1.5 uppercase transition-colors",
            value === mode
              ? "bg-brand-blue text-surface-primary"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

interface OptimizeControlProps {
  ready: boolean;
  inSync: boolean;
  optimizing: boolean;
  onOptimize: () => void;
  onCancel: () => void;
}

// Three visual states packed into a single control next to "saving…":
//   - in sync           → muted "In sync" pill, non-clickable.
//   - drifted, idle     → primary "Optimize" button.
//   - drifted, running  → "Optimizing…" with a pulse + cancel affordance.
// Hidden entirely until the initial hydrate finishes — clicking Optimize
// before then would solve against the placeholder createInitialTree
// (just root) instead of the real tree the user is about to see. The
// "loading…" text in the header subtitle already covers the gap.
// The mobile breakpoint compresses the label to "Optimize"/"…" so the
// header stays single-row on a phone.
function OptimizeControl({
  ready,
  inSync,
  optimizing,
  onOptimize,
  onCancel,
}: OptimizeControlProps) {
  if (!ready) return null;
  if (optimizing) {
    return (
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1.5 rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover"
        title="Cancel the in-flight solve."
        aria-live="polite"
      >
        <span
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-orange"
          aria-hidden
        />
        <span className="hidden sm:inline">Optimizing… (cancel)</span>
        <span className="sm:hidden">Cancel</span>
      </button>
    );
  }
  if (inSync) {
    return (
      <span
        className="flex items-center gap-1.5 rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-xs text-text-muted"
        title="The displayed layout matches the cached optimal solve."
      >
        <span
          className="inline-block h-2 w-2 rounded-full bg-brand-green"
          aria-hidden
        />
        <span className="hidden sm:inline">Layout in sync</span>
        <span className="sm:hidden">In sync</span>
      </span>
    );
  }
  return (
    <Button
      variant="primary"
      onClick={onOptimize}
      title="Compute the optimal layout for the current tree and cache it for everyone."
    >
      <span className="hidden sm:inline">Optimize layout</span>
      <span className="sm:hidden">Optimize</span>
    </Button>
  );
}
