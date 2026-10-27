"use client";

import { useRef, useState } from "react";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { useProfile } from "@/shared/lib/profile";
import { cn } from "@/shared/lib/utils";
import {
  DEFAULT_LOOK,
  LOOK_COLOURS,
  LOOK_PARTS,
  lookToken,
} from "../caretaker";
import type { Look } from "../types";
import { Card, CardButton } from "./card";

function swatch(part: keyof Look, colour: string): string {
  return `var(${lookToken(part, colour)})`;
}

/** The caretaker from the shoulders up, in the colours picked so far. */
function Portrait({ look }: { look: Look }) {
  return (
    <svg viewBox="0 0 100 100" className="size-24 shrink-0" aria-hidden>
      <path
        d="M14 100 C14 76 30 68 50 68 C70 68 86 76 86 100 Z"
        fill={swatch("shirt", look.shirt)}
      />
      <rect
        x="43"
        y="56"
        width="14"
        height="16"
        rx="4"
        fill={swatch("skin", look.skin)}
      />
      <circle cx="50" cy="40" r="22" fill={swatch("skin", look.skin)} />
      <path
        d="M27 42 C24 18 40 12 50 12 C62 12 77 18 73 42 C68 30 58 26 50 26 C42 26 32 30 27 42 Z"
        fill={swatch("hair", look.hair)}
      />
      <circle cx="42" cy="43" r="2.6" className="fill-wh-ink" />
      <circle cx="58" cy="43" r="2.6" className="fill-wh-ink" />
    </svg>
  );
}

/** Who you are in the garden: a caretaker's shirt, hair and skin, and your name. */
export function LookPicker({
  initial,
  onDone,
}: {
  initial: Look | null;
  onDone: (look: Look) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root);
  const profile = useProfile();
  const [look, setLook] = useState<Look>(initial ?? DEFAULT_LOOK);
  const [name, setName] = useState(
    profile.name === "Player" ? "" : profile.name,
  );

  function done() {
    const clean = name.trim();
    if (clean !== "") profile.setName(clean.slice(0, 20));
    onDone(look);
  }

  return (
    <div ref={root}>
      <Card>
        <h1 className="mb-3 text-center text-2xl font-bold">Whisker Hollow</h1>
        <div className="mb-5 flex items-center justify-center gap-4">
          <Portrait look={look} />
          <div className="flex flex-col gap-2">
            {LOOK_PARTS.map((part) => (
              <div
                key={part}
                role="group"
                aria-label={part}
                className="flex gap-2"
              >
                {LOOK_COLOURS[part].map((colour) => (
                  <button
                    key={colour}
                    type="button"
                    aria-label={`${colour} ${part}`}
                    aria-pressed={look[part] === colour}
                    title={colour}
                    data-pad-start={
                      part === "shirt" && look.shirt === colour
                        ? true
                        : undefined
                    }
                    onClick={() => setLook({ ...look, [part]: colour })}
                    className={cn(
                      "size-10 rounded-full border-4 transition-transform hover:scale-110",
                      look[part] === colour
                        ? "border-wh-ink"
                        : "border-wh-paper-edge",
                    )}
                    style={{ background: swatch(part, colour) }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <input
          aria-label="Your name"
          placeholder="Your name"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && done()}
          className="mb-5 w-full rounded-full border-2 border-wh-paper-edge bg-wh-paper px-4 py-2 text-center text-lg outline-none focus:border-wh-accent"
        />
        <div className="flex justify-center">
          <CardButton primary onClick={done}>
            Onto the island
          </CardButton>
        </div>
      </Card>
    </div>
  );
}
