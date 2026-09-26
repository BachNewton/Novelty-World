"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { flushSync } from "react-dom";
import { Search, X } from "lucide-react";
import { fullName, searchByName } from "../logic";
import type { Tree } from "../types";
import { cn, isTextEntryTarget } from "@/shared/lib/utils";

interface NameSearchProps {
  tree: Tree;
  subtitles: ReadonlyMap<string, string | null>;
  onPick: (id: string) => void;
}

// A toolbar search box. From `sm` up it sits inline; below that it is a
// magnifying-glass button that opens the field over the whole toolbar.
export function NameSearch({ tree, subtitles, onPick }: NameSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const results = useMemo(() => searchByName(tree, query), [tree, query]);
  const showList = focused && query.trim() !== "";
  const active = Math.min(activeIndex, results.length - 1);

  // flushSync so the field is visible before focus() runs inside the same
  // gesture — iOS only raises the keyboard for focus in a user gesture.
  const open = useCallback((): void => {
    flushSync(() => { setExpanded(true); });
    inputRef.current?.focus();
  }, []);

  function close(): void {
    setQuery("");
    setExpanded(false);
    inputRef.current?.blur();
  }

  function pick(id: string): void {
    close();
    onPick(id);
  }

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent): void => {
      if (e.altKey || isTextEntryTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const slash = e.key === "/" && !mod;
      const ctrlK = mod && e.key.toLowerCase() === "k";
      if (!slash && !ctrlK) return;
      e.preventDefault();
      open();
    };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); };
  }, [open]);

  useEffect(() => {
    if (!showList || active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [showList, active]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Escape") {
      // Keep the tree's own Esc (deselect) from also firing.
      e.stopPropagation();
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((active + step + results.length) % results.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(results[active].id);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Search names"
        className="flex h-11 w-11 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary sm:hidden"
      >
        <Search className="h-5 w-5" aria-hidden />
      </button>
      <div
        className={cn(
          expanded
            ? "absolute inset-0 z-20 flex items-center gap-2 bg-surface-primary px-4"
            : "hidden",
          "sm:relative sm:z-auto sm:flex sm:bg-transparent sm:px-0",
        )}
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="search"
            role="combobox"
            aria-label="Search names"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              showList && active >= 0 ? `${listId}-${active}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            placeholder="Search names"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => { setFocused(true); }}
            onBlur={() => {
              setFocused(false);
              setExpanded(false);
            }}
            className="h-11 w-full rounded-md border border-border-default bg-surface-elevated pr-3 pl-9 text-base text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none sm:h-9 sm:w-48 sm:text-sm lg:w-60"
          />
        </div>
        <button
          type="button"
          // Keeps focus in the field until the click lands, so blur doesn't
          // collapse the overlay out from under the tap.
          onMouseDown={(e) => { e.preventDefault(); }}
          onClick={close}
          aria-label="Close search"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-elevated hover:text-text-primary sm:hidden"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        {showList ? (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Matching people"
            className="absolute top-full right-2 left-2 z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-md border border-border-hover bg-surface-secondary py-1 shadow-lg sm:right-0 sm:left-auto sm:w-80"
          >
            {results.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-text-muted">
                No one by that name
              </li>
            ) : (
              results.map((person, i) => (
                <ResultRow
                  key={person.id}
                  id={`${listId}-${i}`}
                  name={fullName(person)}
                  subtitle={subtitles.get(person.id) ?? null}
                  active={i === active}
                  onHover={() => { setActiveIndex(i); }}
                  onPick={() => { pick(person.id); }}
                />
              ))
            )}
          </ul>
        ) : null}
      </div>
    </>
  );
}

interface ResultRowProps {
  id: string;
  name: string;
  subtitle: string | null;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}

function ResultRow({ id, name, subtitle, active, onHover, onPick }: ResultRowProps) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      // Keeps focus in the field; blur would close the list before the click
      // registers.
      onMouseDown={(e) => { e.preventDefault(); }}
      onClick={onPick}
      onMouseMove={onHover}
      className={cn(
        "flex min-h-11 cursor-pointer flex-col justify-center px-3 py-2",
        active && "bg-surface-elevated",
      )}
    >
      <span className="text-sm text-text-primary">{name}</span>
      {subtitle !== null ? (
        <span className="text-xs text-text-muted">{subtitle}</span>
      ) : null}
    </li>
  );
}
