"use client";

import { useState } from "react";
import type { Person, Tree } from "../types";
import { ROOT_ID } from "../logic";
import { Button } from "@/shared/components/ui/button";

type Mode = "menu" | "add-parent" | "add-child" | "add-spouse" | "rename";

interface ActionPanelProps {
  tree: Tree;
  person: Person;
  onClose: () => void;
  onAddParent: (name: string) => void;
  onAddChild: (name: string) => void;
  onAddSpouse: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export function ActionPanel({
  tree,
  person,
  onClose,
  onAddParent,
  onAddChild,
  onAddSpouse,
  onRename,
  onDelete,
}: ActionPanelProps) {
  const [mode, setMode] = useState<Mode>("menu");
  const [draft, setDraft] = useState("");

  const isRoot = person.id === ROOT_ID;
  const canAddParent = person.parentIds.length < 2;
  const childCount = Object.values(tree.persons).filter((p) =>
    p.parentIds.includes(person.id),
  ).length;

  function enterMode(next: Exclude<Mode, "menu">) {
    setMode(next);
    setDraft(next === "rename" ? person.name : "");
  }

  function submit() {
    const name = draft.trim();
    if (mode !== "rename" && !name) return;
    if (mode === "add-parent") onAddParent(name);
    else if (mode === "add-child") onAddChild(name);
    else if (mode === "add-spouse") onAddSpouse(name);
    else if (mode === "rename") onRename(name);
    setMode("menu");
    setDraft("");
  }

  function handleDelete() {
    if (childCount > 0) {
      const ok = window.confirm(
        `${person.name} has ${childCount} ${childCount === 1 ? "child" : "children"} listed. Remove anyway? Their children will keep their other parent (if any).`,
      );
      if (!ok) return;
    }
    onDelete();
  }

  return (
    <div className="pointer-events-auto fixed right-4 bottom-4 z-10 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-border-default bg-surface-secondary p-4 shadow-2xl md:top-20 md:right-4 md:bottom-auto">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">
            Selected
          </div>
          <div className="text-lg font-semibold text-text-primary">
            {person.name}
          </div>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          ×
        </Button>
      </div>

      {mode === "menu" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            disabled={!canAddParent}
            onClick={() => { enterMode("add-parent"); }}
          >
            + Parent
          </Button>
          <Button
            variant="secondary"
            onClick={() => { enterMode("add-child"); }}
          >
            + Child
          </Button>
          <Button
            variant="secondary"
            onClick={() => { enterMode("add-spouse"); }}
          >
            + Spouse
          </Button>
          <Button
            variant="secondary"
            onClick={() => { enterMode("rename"); }}
          >
            Rename
          </Button>
          <Button
            variant="ghost"
            disabled={isRoot}
            className="col-span-2 text-brand-pink hover:text-brand-pink"
            onClick={handleDelete}
          >
            {isRoot ? "Root can't be deleted" : "Delete"}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex flex-col gap-2"
        >
          <label className="text-xs text-text-secondary">
            {mode === "rename" ? "New name" : "Name"}
          </label>
          <input
            type="text"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); }}
            autoFocus
            onFocus={(e) => { e.currentTarget.select(); }}
            className="rounded-md border border-border-default bg-surface-primary px-3 py-2 text-text-primary outline-none focus:border-brand-orange"
            placeholder={
              mode === "add-parent"
                ? "Parent's name"
                : mode === "add-child"
                  ? "Child's name"
                  : mode === "add-spouse"
                    ? "Spouse's name"
                    : "Name"
            }
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setMode("menu"); }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!draft.trim()}>
              {mode === "rename" ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
