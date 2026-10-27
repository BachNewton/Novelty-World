"use client";

import { useRef, useState } from "react";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { speciesOrThrow } from "../cast";
import type { Pair } from "../types";
import { MAX_NAME_LENGTH, cleanName } from "../world";
import { Card, CardButton } from "./card";

/** Naming a pair just back together. The name is always the players' own, typed. */
export function NameCard({ pair, onName, onLater }: {
  pair: Pair;
  onName: (name: string) => void;
  onLater: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root, { reveal: false });
  const species = speciesOrThrow(pair.species);
  const [name, setName] = useState("");
  const clean = cleanName(name);

  function keep() {
    if (clean !== null) onName(clean);
  }

  return (
    <div ref={root}>
      <Card>
        <h2 className="mb-3 text-center text-xl font-bold">{species.name}</h2>
        <input
          aria-label="Name"
          autoFocus
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") keep();
            if (e.key === "Escape") onLater();
          }}
          className="mb-4 w-full rounded-full border-2 border-wh-paper-edge bg-wh-paper px-4 py-2 text-center text-xl font-semibold outline-none focus:border-wh-accent"
        />
        <div className="flex justify-center gap-3">
          <CardButton data-pad-back onClick={onLater}>
            Later
          </CardButton>
          <CardButton primary disabled={clean === null} onClick={keep}>
            Welcome home
          </CardButton>
        </div>
      </Card>
    </div>
  );
}
