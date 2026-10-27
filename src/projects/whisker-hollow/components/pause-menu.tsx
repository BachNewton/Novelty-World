"use client";

import { useRef } from "react";
import { BookHeart, Palette, Play } from "lucide-react";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { Card, CardButton } from "./card";

/** What the garden shows when the mouse was let go mid-play (Esc, another window): back in, the album, or a new look. */
export function PauseMenu({ onResume, onAlbum, onChangeLook }: { onResume: () => void; onAlbum: () => void; onChangeLook: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root);
  return (
    <div ref={root}>
      <Card className="max-w-xs">
        <div className="flex flex-col gap-3">
          {/* Focused, so Enter presses it: a key press, which may lock the pointer again. */}
          <CardButton primary autoFocus data-pad-start data-pad-back data-pad-menu onClick={onResume} className="flex items-center justify-center gap-2">
            <Play className="size-5" />
            Resume
          </CardButton>
          <CardButton onClick={onAlbum} className="flex items-center justify-center gap-2">
            <BookHeart className="size-5" />
            Album
          </CardButton>
          <CardButton onClick={onChangeLook} className="flex items-center justify-center gap-2">
            <Palette className="size-5" />
            Change look
          </CardButton>
        </div>
      </Card>
    </div>
  );
}
