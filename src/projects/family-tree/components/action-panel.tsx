"use client";

import { useState } from "react";
import type { Gender, MarriageStatus, NameFields, Person } from "../types";
import { ROOT_ID, fullName } from "../logic";
import { Button } from "@/shared/components/ui/button";

export type PanelMode =
  | "menu"
  | "add-parent"
  | "add-child"
  | "add-spouse"
  | "rename"
  | "divorce";

export interface MarriageOption {
  partnerId: string;
  partnerName: string;
  status: MarriageStatus;
}

// Existing children of the selected person whose only listed bio parent is
// the selected person — eligible to be co-parented by a newly added spouse.
export interface BioChildCandidate {
  id: string;
  name: string;
}

interface ActionPanelProps {
  person: Person;
  isViewRoot: boolean;
  marriages: MarriageOption[];
  bioChildCandidates: BioChildCandidate[];
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
  onClose: () => void;
  onAddParent: (name: NameFields, gender: Gender) => void;
  onAddChild: (
    name: NameFields,
    gender: Gender,
    coParentId: string | null,
  ) => void;
  onAddSpouse: (
    name: NameFields,
    gender: Gender,
    status: MarriageStatus,
    bioChildIds: string[],
  ) => void;
  onDivorce: (partnerId: string) => void;
  onRename: (name: NameFields) => void;
  onSetGender: (gender: Gender) => void;
  onSetAsViewRoot: () => void;
  onDelete: () => void;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "M", label: "M" },
  { value: "F", label: "F" },
  { value: "NB", label: "NB" },
];

const STATUS_OPTIONS: { value: MarriageStatus; label: string }[] = [
  { value: "married", label: "Current" },
  { value: "divorced", label: "Divorced" },
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

function StatusPicker({
  value,
  onChange,
}: {
  value: MarriageStatus;
  onChange: (s: MarriageStatus) => void;
}) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Marriage status">
      {STATUS_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
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
  marriages,
  bioChildCandidates,
  mode,
  onModeChange,
  onClose,
  onAddParent,
  onAddChild,
  onAddSpouse,
  onDivorce,
  onRename,
  onSetGender,
  onSetAsViewRoot,
  onDelete,
}: ActionPanelProps) {
  const [firstDraft, setFirstDraft] = useState("");
  const [lastDraft, setLastDraft] = useState("");
  const [commonDraft, setCommonDraft] = useState("");
  const [draftGender, setDraftGender] = useState<Gender | null>(null);
  const [draftStatus, setDraftStatus] = useState<MarriageStatus>("married");
  // null === "this person alone" for add-child; partnerId for a marriage.
  const [draftCoParent, setDraftCoParent] = useState<string | null>(null);
  // IDs of existing single-parent children the new spouse should also bio-parent.
  const [draftBioChildIds, setDraftBioChildIds] = useState<string[]>([]);

  const currentMarriages = marriages.filter((m) => m.status === "married");
  // Show the marriage picker on +Child whenever the person has any spouse.
  // Default picks the first current marriage (or the first ex if no current),
  // so the common case is a single confirm-click — but step-children and
  // single-parent cases are always reachable.
  const showMarriagePicker = marriages.length > 0;

  // Reset draft state when mode changes (including hotkey-driven changes from
  // the parent). Tracking the previous prop in state is React's recommended
  // pattern: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  // For add-parent / add-child / add-spouse we prepopulate lastName from the
  // selected person's lastName so families with a shared surname can be entered
  // quickly. The user can edit it before submitting.
  const [prevMode, setPrevMode] = useState(mode);
  if (prevMode !== mode) {
    setPrevMode(mode);
    if (mode === "rename") {
      setFirstDraft(person.firstName);
      setLastDraft(person.lastName);
      setCommonDraft(person.commonName);
    } else if (mode === "menu" || mode === "divorce") {
      setFirstDraft("");
      setLastDraft("");
      setCommonDraft("");
    } else {
      setFirstDraft("");
      setLastDraft(person.lastName);
      setCommonDraft("");
    }
    setDraftGender(null);
    setDraftStatus("married");
    // Default: first current marriage if any, else first ex. marriages
    // is ordered [...current, ...ex] so marriages[0] gives both correctly.
    setDraftCoParent(marriages[0]?.partnerId ?? null);
    setDraftBioChildIds([]);
  }

  const isCanonicalRoot = person.id === ROOT_ID;
  const canAddParent = person.parentIds.length < 2;
  const canDivorce = currentMarriages.length > 0;
  const needsGender =
    mode === "add-parent" || mode === "add-child" || mode === "add-spouse";
  const trimmedFirst = firstDraft.trim();
  const canSubmit =
    mode === "rename"
      ? trimmedFirst.length > 0
      : trimmedFirst.length > 0 && draftGender !== null;

  function submit() {
    const name: NameFields = {
      firstName: firstDraft.trim(),
      lastName: lastDraft.trim(),
      commonName: commonDraft.trim(),
    };
    if (mode === "rename") {
      if (!name.firstName) return;
      onRename(name);
    } else {
      if (!name.firstName || draftGender === null) return;
      if (mode === "add-parent") onAddParent(name, draftGender);
      else if (mode === "add-child") onAddChild(name, draftGender, draftCoParent);
      else if (mode === "add-spouse")
        onAddSpouse(name, draftGender, draftStatus, draftBioChildIds);
    }
    onModeChange("menu");
  }

  function handleDivorceClick() {
    if (currentMarriages.length === 1) {
      onDivorce(currentMarriages[0].partnerId);
      return;
    }
    onModeChange("divorce");
  }

  return (
    <div className="pointer-events-auto fixed right-4 bottom-4 z-10 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-border-default bg-surface-secondary p-4 shadow-2xl md:top-20 md:right-4 md:bottom-auto">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">
            Selected
          </div>
          <div className="text-lg font-semibold text-text-primary">
            {fullName(person)}
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
            {canDivorce ? (
              <Button
                variant="secondary"
                className="col-span-2"
                onClick={handleDivorceClick}
              >
                Divorce
                {currentMarriages.length === 1
                  ? ` from ${currentMarriages[0].partnerName}`
                  : "…"}
              </Button>
            ) : null}
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
      ) : mode === "divorce" ? (
        <div className="flex flex-col gap-3">
          <div className="text-xs text-text-secondary">
            Divorce {person.firstName} from…
          </div>
          <div className="flex flex-col gap-1">
            {currentMarriages.map((m) => (
              <button
                key={m.partnerId}
                type="button"
                onClick={() => {
                  onDivorce(m.partnerId);
                  onModeChange("menu");
                }}
                className="rounded-md border border-border-default bg-surface-primary px-3 py-2 text-left text-sm text-text-primary transition-colors hover:border-border-hover"
              >
                {m.partnerName}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { onModeChange("menu"); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary">First name</label>
              <input
                type="text"
                value={firstDraft}
                onChange={(e) => { setFirstDraft(e.target.value); }}
                autoFocus
                onFocus={(e) => { e.currentTarget.select(); }}
                className="rounded-md border border-border-default bg-surface-primary px-3 py-2 text-text-primary outline-none focus:border-brand-orange"
                placeholder="First"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary">
                Last name <span className="text-text-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={lastDraft}
                onChange={(e) => { setLastDraft(e.target.value); }}
                onFocus={(e) => { e.currentTarget.select(); }}
                className="rounded-md border border-border-default bg-surface-primary px-3 py-2 text-text-primary outline-none focus:border-brand-orange"
                placeholder="Last"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">
              Common name <span className="text-text-muted">(optional)</span>
            </label>
            <input
              type="text"
              value={commonDraft}
              onChange={(e) => { setCommonDraft(e.target.value); }}
              onFocus={(e) => { e.currentTarget.select(); }}
              className="rounded-md border border-border-default bg-surface-primary px-3 py-2 text-text-primary outline-none focus:border-brand-orange"
              placeholder="Nickname"
            />
          </div>

          {needsGender ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary">Gender</label>
              <GenderPicker value={draftGender} onChange={setDraftGender} />
            </div>
          ) : null}

          {mode === "add-spouse" ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary">Status</label>
              <StatusPicker value={draftStatus} onChange={setDraftStatus} />
            </div>
          ) : null}

          {mode === "add-spouse" && bioChildCandidates.length > 0 ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary">
                Also bio parent of{" "}
                <span className="text-text-muted">(optional)</span>
              </label>
              <div className="flex flex-col gap-1">
                {bioChildCandidates.map((child) => {
                  const active = draftBioChildIds.includes(child.id);
                  return (
                    <button
                      key={child.id}
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      onClick={() => {
                        setDraftBioChildIds((prev) =>
                          active
                            ? prev.filter((id) => id !== child.id)
                            : [...prev, child.id],
                        );
                      }}
                      className={[
                        "rounded-md border px-3 py-1.5 text-left text-xs transition-colors",
                        active
                          ? "border-brand-orange bg-surface-elevated text-text-primary"
                          : "border-border-default bg-surface-primary text-text-secondary hover:border-border-hover",
                      ].join(" ")}
                    >
                      <span aria-hidden className="mr-2">
                        {active ? "☑" : "☐"}
                      </span>
                      {child.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {mode === "add-child" && showMarriagePicker ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary">Parents</label>
              <div className="flex flex-col gap-1">
                {marriages.map((m) => {
                  const id = m.partnerId;
                  const active = draftCoParent === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => { setDraftCoParent(id); }}
                      className={[
                        "rounded-md border px-3 py-1.5 text-left text-xs transition-colors",
                        active
                          ? "border-brand-orange bg-surface-elevated text-text-primary"
                          : "border-border-default bg-surface-primary text-text-secondary hover:border-border-hover",
                      ].join(" ")}
                    >
                      {person.firstName} & {m.partnerName}{" "}
                      <span className="text-text-muted">
                        ({m.status === "married" ? "current" : "divorced"})
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => { setDraftCoParent(null); }}
                  className={[
                    "rounded-md border px-3 py-1.5 text-left text-xs transition-colors",
                    draftCoParent === null
                      ? "border-brand-orange bg-surface-elevated text-text-primary"
                      : "border-border-default bg-surface-primary text-text-secondary hover:border-border-hover",
                  ].join(" ")}
                >
                  {person.firstName} only{" "}
                  <span className="text-text-muted">(single parent)</span>
                </button>
              </div>
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
