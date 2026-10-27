"use client";

import { useRef } from "react";
import { HelpCircle } from "lucide-react";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { CAST } from "../cast";
import type { World } from "../types";
import { Card, CardButton } from "./card";

/** Every pair: the ones back together with their names and who named them, the rest still to find. */
export function Album({ world, onClose }: { world: World; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root);
  const found = world.pairs.filter((p) => p.naming !== null).length;
  return (
    <div ref={root}>
      <Card className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <p className="mb-3 text-center font-bold">
          {found} / {CAST.length}
        </p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CAST.map((species) => {
            const naming = world.pairs.find((p) => p.species === species.id)?.naming ?? null;
            return (
              <li key={species.id} className="rounded-2xl border-2 border-wh-paper-edge p-2 text-center">
                {naming === null ? (
                  <HelpCircle aria-label="Not found yet" className="mx-auto size-8 text-wh-ink-soft" />
                ) : (
                  <>
                    <p className="font-semibold">{naming.name}</p>
                    <p className="text-sm text-wh-ink-soft">
                      {species.name} · {naming.by}
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-center">
          <CardButton data-pad-start data-pad-back onClick={onClose}>
            Close
          </CardButton>
        </div>
      </Card>
    </div>
  );
}
