"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useProfile } from "@/shared/lib/profile";
import { Pencil } from "lucide-react";

const subscribe = () => () => {};

export function ProfileEditor() {
  const { name, setName } = useProfile();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Callback ref: focus + select as soon as the input mounts.
  // This keeps focus inside the original user-gesture frame so
  // mobile browsers open the virtual keyboard immediately.
  const attachInput = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    node?.select();
  }, []);

  function startEdit() {
    setDraft(name);
    setIsEditing(true);
  }

  function save() {
    const trimmed = draft.trim();
    setName(trimmed || "Player");
    setIsEditing(false);
  }

  function cancel() {
    setIsEditing(false);
  }

  return (
    <div className={`mt-3 flex items-center justify-center gap-2${mounted ? "" : " invisible"}`}>
      {isEditing ? (
        <input
          ref={attachInput}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          onBlur={save}
          maxLength={20}
          className="rounded-md border border-border-default bg-surface-secondary px-2 py-1 text-center text-sm text-text-primary focus:border-brand-orange focus:outline-none"
        />
      ) : (
        <>
          <span className="text-sm text-text-secondary">
            Welcome,{" "}
            <button
              onClick={startEdit}
              className="font-medium text-brand-orange hover:underline"
            >
              {name}
            </button>
          </span>
          <button
            onClick={startEdit}
            className="text-text-muted transition-colors hover:text-text-secondary"
          >
            <Pencil size={14} />
          </button>
        </>
      )}
    </div>
  );
}
