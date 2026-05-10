"use client";

import { useState } from "react";
import type { Gender, Person } from "../types";
import { ROOT_ID } from "../logic";
import { Button } from "@/shared/components/ui/button";

export type PanelMode =
  | "menu"
  | "add-parent"
  | "add-child"
  | "add-spouse"
  | "rename";

interface ActionPanelProps {
  person: Person;
  isViewRoot: boolean;
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
  onClose: () => void;
  onAddParent: (name: string, gender: Gender) => void;
  onAddChild: (name: string, gender: Gender) => void;
  onAddSpouse: (name: string, gender: Gender) => void;
  onRename: (name: string) => void;
  onSetGender: (gender: Gender) => void;
  onSetAsViewRoot: () => void;
  onDelete: () => void;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "M", label: "M" },
  { value: "F", label: "F" },
  { value: "NB", label: "NB" },
];

function GenderPicker({
  value,
  onChange,
}: {
  value: Gender | null;
  onChange: (g: Gender) => void;
}) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Gender">
      {GENDER_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => { onChange(opt.value); }}
            className={[
              "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-brand-orange bg-surface-elevated text-text-primary"
                : "border-border-default bg-surface-primary text-text-secondary hover:border-border-hover",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function ActionPanel({
  person,
  isViewRoot,
  mode,
  onModeChange,
  onClose,
  onAddParent,
  onAddChild,
  onAddSpouse,
  onRename,
  onSetGender,
  onSetAsViewRoot,
  onDelete,
}: ActionPanelProps) {
  const [draft, setDraft] = useState("");
  const [draftGender, setDraftGender] = useState<Gender | null>(null);

  // Reset draft state when mode changes (including hotkey-driven changes from
  // the parent). Tracking the previous prop in state is React's recommended
  // pattern: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevMode, setPrevMode] = useState(mode);
  if (prevMode !== mode) {
    setPrevMode(mode);
    setDraft(mode === "rename" ? person.name : "");
    setDraftGender(null);
  }

  const isCanonicalRoot = person.id === ROOT_ID;
  const canAddParent = person.parentIds.length < 2;
  const needsGender = mode !== "rename" && mode !== "menu";
  const canSubmit =
    mode === "rename" ? draft.trim().length > 0 : draft.trim().length > 0 && draftGender !== null;

  function submit() {
    const name = draft.trim();
    if (mode === "rename") {
      if (!name) return;
      onRename(name);
    } else {
      if (!name || draftGender === null) return;
      if (mode === "add-parent") onAddParent(name, draftGender);
      else if (mode === "add-child") onAddChild(name, draftGender);
      else if (mode === "add-spouse") onAddSpouse(name, draftGender);
    }
    onModeChange("menu");
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
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1 text-xs text-text-secondary">Gender</div>
            <GenderPicker value={person.gender} onChange={onSetGender} />
          </div>

          <Button
            variant="secondary"
            disabled={isViewRoot}
            onClick={onSetAsViewRoot}
            className="w-full"
          >
            {isViewRoot ? "Viewing from here" : "View relations from here"}
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={!canAddParent}
              onClick={() => { onModeChange("add-parent"); }}
            >
              + Parent
            </Button>
            <Button
              variant="secondary"
              onClick={() => { onModeChange("add-child"); }}
            >
              + Child
            </Button>
            <Button
              variant="secondary"
              onClick={() => { onModeChange("add-spouse"); }}
            >
              + Spouse
            </Button>
            <Button
              variant="secondary"
              onClick={() => { onModeChange("rename"); }}
            >
              Rename
            </Button>
            <Button
              variant="ghost"
              disabled={isCanonicalRoot}
              className="col-span-2 text-brand-pink hover:text-brand-pink"
              onClick={onDelete}
            >
              {isCanonicalRoot ? "Root can't be deleted" : "Delete"}
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
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
          </div>

          {needsGender ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary">Gender</label>
              <GenderPicker value={draftGender} onChange={setDraftGender} />
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { onModeChange("menu"); }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {mode === "rename" ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
