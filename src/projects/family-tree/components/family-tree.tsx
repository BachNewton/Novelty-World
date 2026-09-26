"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Eye, Users } from "lucide-react";
import { useFamilyTreeStore } from "../store";
import {
  ROOT_ID,
  ROOT_FIRST_NAME,
  describeRelation,
  fullName,
  nearestInDirection,
  type NavDirection,
} from "../logic";
import type { LaidOutNode, Layout, Tree } from "../types";
import { PanZoom, type PanZoomHandle, type Point } from "./pan-zoom";
import { NameSearch } from "./name-search";
import { Node } from "./node";
import { Edges } from "./edges";
import { PersonPanel } from "./person-panel";
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

// Below `md` the person panel covers the lower part of the canvas, so a card
// jumped to (and thereby selected) is placed near the top instead of the
// center, where the panel would hide it.
function jumpAnchor(): Point {
  const panelBelow = !window.matchMedia("(min-width: 48rem)").matches;
  return { x: 0.5, y: panelBelow ? 0.2 : 0.5 };
}

export function FamilyTree() {
  const load = useFamilyTreeStore((s) => s.load);
  const hydrate = useFamilyTreeStore((s) => s.hydrate);

  useEffect(() => { void hydrate(); }, [hydrate]);

  if (load.status === "ready") return <TreeView tree={load.tree} layout={load.layout} />;

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col bg-surface-primary">
      <header className="border-b border-border-default px-4 py-3">
        <h1 className="text-xl font-semibold text-text-primary">Family Tree</h1>
      </header>
      <div className="flex flex-1 items-center justify-center p-4" aria-live="polite">
        {load.status === "loading" ? (
          <div className="flex flex-col items-center gap-3 text-text-secondary">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-brand-orange"
              aria-hidden
            />
            <span className="text-sm">Loading the tree…</span>
          </div>
        ) : (
          <div
            role="alert"
            className="w-full max-w-md rounded-lg border border-brand-pink bg-surface-secondary p-4"
          >
            <p className="font-semibold text-brand-pink">The family tree can&apos;t be shown.</p>
            <p className="mt-1 break-words text-sm text-text-secondary">{load.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TreeView({ tree, layout }: { tree: Tree; layout: Layout }) {
  const selectedId = useFamilyTreeStore((s) => s.selectedId);
  const viewRootId = useFamilyTreeStore((s) => s.viewRootId);
  const setSelected = useFamilyTreeStore((s) => s.setSelected);
  const setViewRoot = useFamilyTreeStore((s) => s.setViewRoot);
  const resetViewRoot = useFamilyTreeStore((s) => s.resetViewRoot);

  const [viewMode, setViewMode] = useState<ViewMode>("2d");

  useEffect(() => {
    const store = useFamilyTreeStore;
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        e.preventDefault();
        store.getState().setSelected(null);
        return;
      }

      if (isInteractiveTarget(e.target)) return;

      const dir = arrowDirection(e.key);
      if (dir !== null) {
        e.preventDefault();
        const sid = store.getState().selectedId;
        const current = layout.nodes.find((n) => n.id === sid);
        if (current === undefined) {
          store.getState().setSelected(ROOT_ID);
          return;
        }
        const next = nearestInDirection(current, layout.nodes, dir);
        if (next) store.getState().setSelected(next.id);
        return;
      }

      if (e.key === "Enter" && !e.repeat && store.getState().selectedId === null) {
        e.preventDefault();
        store.getState().setSelected(ROOT_ID);
      }
    };

    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); };
  }, [layout]);

  const effectiveViewRootId =
    viewRootId in tree.persons ? viewRootId : ROOT_ID;
  const viewRoot = tree.persons[effectiveViewRootId];

  // What each card says under the name: "you" on the view root, otherwise
  // the relationship to it. Search results and the person panel show the
  // same line.
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

  const viewRootFocus = useMemo(() => {
    const node = layout.nodes.find((n) => n.id === effectiveViewRootId);
    return node && nodeCenter(node);
  }, [layout.nodes, effectiveViewRootId]);

  const panZoomRef = useRef<PanZoomHandle>(null);
  const [flash, setFlash] = useState<{ id: string; key: number } | null>(null);
  const jumpTo = useCallback(
    (id: string) => {
      setSelected(id);
      const node = layout.nodes.find((n) => n.id === id);
      if (node) panZoomRef.current?.panTo(nodeCenter(node), jumpAnchor());
      setFlash((f) => ({ id, key: (f?.key ?? 0) + 1 }));
    },
    [layout.nodes, setSelected],
  );

  const selectedPerson = selectedId ? tree.persons[selectedId] : undefined;
  const personCount = Object.keys(tree.persons).length;
  const showResetView = effectiveViewRootId !== ROOT_ID;

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
        </p>
        <div className="col-start-2 row-start-1 flex items-center gap-2 sm:row-span-2">
          <NameSearch tree={tree} subtitles={subtitles} onPick={jumpTo} />
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {showResetView ? (
            <Button variant="ghost" onClick={resetViewRoot}>
              Reset to {ROOT_FIRST_NAME}
            </Button>
          ) : null}
          <p className="hidden text-xs text-text-muted lg:block">
            Drag/WASD pan · scroll/+− zoom · arrows select · Esc deselect
          </p>
        </div>
      </header>

      <div className="relative flex-1">
        {viewMode === "3d" ? (
          <Tree3D
            tree={tree}
            rootId={effectiveViewRootId}
            selectedId={selectedId}
            onSelect={setSelected}
          />
        ) : (
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
                flashKey={flash?.id === n.id ? flash.key : null}
                onFlashEnd={() => { setFlash(null); }}
                onSelect={setSelected}
              />
            ))}
          </PanZoom>
        )}

        {selectedPerson ? (
          <PersonPanel
            key={selectedPerson.id}
            person={selectedPerson}
            relation={subtitles.get(selectedPerson.id) ?? null}
            viewRootName={fullName(viewRoot)}
            isViewRoot={selectedPerson.id === effectiveViewRootId}
            onSetAsViewRoot={() => { setViewRoot(selectedPerson.id); }}
            onClose={() => { setSelected(null); }}
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
