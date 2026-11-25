"use client";

import { useEffect, useRef, useState } from "react";
import { Clapperboard, LoaderCircle, User } from "lucide-react";
import { useFrameStats } from "@/shared/lib/three/frame-stats";
import { CHARACTERS, characterOrThrow } from "../characters";
import { CharacterViewer, type Backend } from "../scene/character-viewer";

const DEFAULT_CHARACTER = "female-a";
const DEFAULT_CLIP = "idle";

/** What the address asks for: `?character=knight&clip=walk` opens on exactly that. */
function fromAddress(): { character: string; clip: string } {
  const search = new URLSearchParams(window.location.search);
  const character = search.get("character");
  return {
    character: CHARACTERS.find((c) => c.id === character)?.id ?? DEFAULT_CHARACTER,
    clip: search.get("clip") ?? DEFAULT_CLIP,
  };
}

function toAddress(character: string, clip: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("character", character);
  url.searchParams.set("clip", clip);
  window.history.replaceState(null, "", url);
}

interface Showing {
  character: string;
  clips: readonly string[];
  clip: string;
}

interface Setters {
  picked: (character: string) => void;
  showing: (showing: Showing) => void;
  failure: (message: string) => void;
}

/** Show a character, keeping the animation playing when it has one of that name. */
function show(viewer: CharacterViewer, character: string, clip: string, set: Setters): void {
  set.picked(character);
  viewer.show(characterOrThrow(character), clip).then(
    (shown) => {
      // Null when a later pick overtook this one.
      if (shown === null) return;
      set.showing({ character, clips: shown.clips, clip: shown.playing });
      toAddress(character, shown.playing);
    },
    (error: unknown) => set.failure(String(error)),
  );
}

const SELECT_CLASS =
  "min-w-0 flex-1 rounded-md border border-border-default bg-surface-elevated px-2 py-1.5 text-sm text-text-primary hover:border-border-hover disabled:opacity-50";

/** The debug view: pick a character and one of its animations, and watch it play in 3D. */
export function Adventure() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CharacterViewer | null>(null);
  const [backend, setBackend] = useState<Backend | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** What is on screen, once the first character has loaded. */
  const [showing, setShowing] = useState<Showing | null>(null);
  /** The character picked last, which may still be loading. */
  const [picked, setPicked] = useState<string | null>(null);
  const setters: Setters = { picked: setPicked, showing: setShowing, failure: setFailure };
  useFrameStats();

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const viewer = new CharacterViewer(container, setFailure);
    viewerRef.current = viewer;
    viewer.start().then(
      (got) => {
        if (got === null) return;
        setBackend(got);
        const asked = fromAddress();
        show(viewer, asked.character, asked.clip, { picked: setPicked, showing: setShowing, failure: setFailure });
      },
      (error: unknown) => setFailure(String(error)),
    );
    return () => {
      viewerRef.current = null;
      viewer.dispose();
    };
  }, []);

  function pickCharacter(character: string): void {
    const viewer = viewerRef.current;
    if (viewer === null || showing === null) return;
    show(viewer, character, showing.clip, setters);
  }

  function pickClip(clip: string): void {
    const viewer = viewerRef.current;
    if (viewer === null || showing === null) return;
    viewer.play(clip);
    setShowing({ ...showing, clip });
    toAddress(showing.character, clip);
  }

  const loading = failure === null && (showing === null || picked !== showing.character);

  return (
    <div className="fixed inset-0 bg-surface-primary">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute inset-x-3 top-3 flex flex-col gap-2 sm:right-auto sm:w-80">
        <label className="flex items-center gap-2">
          <User aria-hidden className="size-5 shrink-0 text-text-secondary" />
          <span className="sr-only">Character</span>
          <select
            className={SELECT_CLASS}
            value={picked ?? ""}
            disabled={showing === null}
            onChange={(event) => pickCharacter(event.target.value)}
          >
            {CHARACTERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <Clapperboard aria-hidden className="size-5 shrink-0 text-text-secondary" />
          <span className="sr-only">Animation</span>
          <select
            className={SELECT_CLASS}
            value={showing?.clip ?? ""}
            disabled={loading}
            onChange={(event) => pickClip(event.target.value)}
          >
            {showing?.clips.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 text-xs text-text-muted">
        {loading && <LoaderCircle aria-label="Loading" className="size-4 animate-spin" />}
        {backend !== null && <span title="The renderer's backend">{backend}</span>}
      </div>
      {failure !== null && (
        <div role="alert" className="absolute inset-x-3 bottom-10 rounded-md border border-brand-pink bg-surface-elevated p-3 text-sm text-text-primary">
          {failure}
        </div>
      )}
    </div>
  );
}
