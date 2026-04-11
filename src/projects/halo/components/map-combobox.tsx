"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/shared/components/ui/button";

interface MapComboboxProps {
  mapNames: string[];
  onSubmit: (name: string) => void;
  disabled?: boolean;
}

export function MapCombobox({ mapNames, onSubmit, disabled }: MapComboboxProps) {
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const filtered = input
    ? mapNames.filter((n) =>
        n.toLowerCase().includes(input.toLowerCase()),
      )
    : mapNames;

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const selectName = useCallback(
    (name: string) => {
      setInput(name);
      setIsOpen(false);
      setHighlightedIndex(-1);
    },
    [],
  );

  function handleSubmit() {
    if (!input.trim()) return;
    onSubmit(input.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen && e.key === "ArrowDown") {
      setIsOpen(true);
      setHighlightedIndex(0);
      e.preventDefault();
      return;
    }

    if (!isOpen) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
          selectName(filtered[highlightedIndex]);
        } else {
          handleSubmit();
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  }

  function handleBlur() {
    blurTimeoutRef.current = setTimeout(() => setIsOpen(false), 150);
  }

  function handleFocus() {
    clearTimeout(blurTimeoutRef.current);
    if (input || filtered.length > 0) setIsOpen(true);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-2 px-4">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          disabled={disabled}
          placeholder="Type a map name..."
          autoComplete="off"
          onChange={(e) => {
            setInput(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="w-full rounded-md border border-border-default bg-surface-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-orange focus:outline-none disabled:opacity-50"
        />

        {isOpen && filtered.length > 0 && (
          <ul
            ref={listRef}
            className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border-default bg-surface-secondary shadow-lg"
          >
            {filtered.map((name, i) => (
              <li
                key={name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectName(name);
                }}
                className={`cursor-pointer px-4 py-2.5 text-sm ${
                  i === highlightedIndex
                    ? "bg-surface-elevated text-text-primary"
                    : "text-text-secondary hover:bg-surface-tertiary"
                }`}
              >
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button onClick={handleSubmit} disabled={disabled || !input.trim()}>
        Submit
      </Button>
    </div>
  );
}
