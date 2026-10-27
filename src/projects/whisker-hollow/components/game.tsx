"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Eye, Video } from "lucide-react";
import { Prompt } from "@/shared/components/prompts";
import { createRoom, relayUrlFromSearch, stopOnPageHide } from "@/shared/lib/peer";
import { useProfile } from "@/shared/lib/profile";
import type { InputKind } from "@/shared/lib/input";
import { cn } from "@/shared/lib/utils";
import { speciesOrThrow } from "../cast";
import { SPAWN } from "../level";
import type { CameraMode } from "../camera";
import { BINDINGS, createInput, type GameAction, type Input } from "../input";
import type { Look } from "../types";
import { GAME, worldIdFromSearch } from "../protocol";
import { storeFromSearch } from "../save";
import { loadModels, type Models } from "../scene/assets";
import { GameScene, type Target } from "../scene/game-scene";
import { createSession, type Session } from "../session";
import { awaitingName } from "../world";
import { Album } from "./album";
import { CardButton } from "./card";
import { NameCard } from "./name-card";
import { PauseMenu } from "./pause-menu";

type Overlay = { kind: "none" } | { kind: "name"; species: string } | { kind: "album" } | { kind: "pause" };

function useSessionSnapshot(session: Session) {
  return useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
}

/** The island: the 3D scene, the prompt for what interact would do, and the cards over it. */
export function Game({ look, paused, onChangeLook }: { look: Look; paused: boolean; onChangeLook: () => void }) {
  const [session] = useState(() => {
    const search = window.location.search;
    const worldId = worldIdFromSearch(search);
    const profile = useProfile.getState();
    return createSession({
      profile: { id: profile.id, name: profile.name },
      avatar: { x: SPAWN.x, z: SPAWN.z, heading: 0, moving: false, look },
      store: storeFromSearch(search, worldId),
      createRoom: (events) =>
        createRoom({ game: GAME, target: { mode: "claim", code: worldId }, profile, events, relayUrl: relayUrlFromSearch(search) }),
    });
  });
  const snapshot = useSessionSnapshot(session);
  const surface = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const inputRef = useRef<Input | null>(null);
  const [models, setModels] = useState<Models | null>(null);
  const [progress, setProgress] = useState(0);
  const [target, setTarget] = useState<Target | null>(null);
  const [inputKind, setInputKind] = useState<InputKind>("keyboard-mouse");
  const [cameraMode, setCameraMode] = useState<CameraMode>("third");
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  /** Pairs this player put off naming, so the card doesn't spring back at once. */
  const [deferred, setDeferred] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    session.start();
    const unbind = stopOnPageHide(session);
    return () => {
      unbind();
      session.stop();
    };
  }, [session]);

  useEffect(() => {
    let live = true;
    loadModels((loaded, total) => live && setProgress(loaded / total)).then(
      (loadedModels) => live && setModels(loadedModels),
      (error: unknown) => {
        throw error;
      },
    );
    return () => {
      live = false;
    };
  }, []);

  // A pair this player just brought together asks them for its name, unless they put it off.
  const world = snapshot.world;
  const waiting = world === null ? undefined : awaitingName(world, session.selfId);
  const asking = overlay.kind === "none" && waiting !== undefined && !deferred.has(waiting.species) ? waiting.species : null;
  const naming = world?.pairs.find((p) => p.naming === null && p.species === (overlay.kind === "name" ? overlay.species : asking));

  // The scene is built once, so it reads whether the garden has the controls through a ref.
  // A card frees the mouse; closing it locks it again, in the click or key press that closed it
  // (React runs this effect within that event). Closed from a controller, the browser refuses
  // the lock, and the garden plays on until a click in it.
  const playing = overlay.kind === "none" && asking === null && !paused;
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
    const input = inputRef.current;
    if (input === null) return;
    input.setEnabled(playing);
    if (playing) input.lock();
    else input.unlock();
  }, [playing]);

  useEffect(() => {
    const element = surface.current;
    if (models === null || element === null) return;
    const onAction = (action: GameAction) => {
      if (action === "interact") sceneRef.current?.interact();
      else if (action === "view") sceneRef.current?.toggleView();
      else setOverlay({ kind: action });
    };
    // Losing the lock mid-play (Esc, another window) pauses; a card letting it go doesn't.
    const onLockChange = (nowLocked: boolean) => {
      if (!nowLocked && playingRef.current) setOverlay({ kind: "pause" });
    };
    const input = createInput(element, onAction, setInputKind, onLockChange);
    inputRef.current = input;
    input.setEnabled(playingRef.current);
    if (playingRef.current) input.lock();
    const scene = new GameScene(element, models, session, look, input, {
      onTarget: setTarget,
      onNameRequest: (species) => setOverlay({ kind: "name", species }),
      onCameraMode: setCameraMode,
    }, new URLSearchParams(window.location.search).has("overview"));
    sceneRef.current = scene;
    Object.assign(window, {
      __whiskerHollow: { ...scene.probe, locked: () => input.locked, world: () => session.snapshot().world },
    });
    scene.start().catch((error: unknown) => {
      throw error;
    });
    return () => {
      scene.dispose();
      input.dispose();
      sceneRef.current = null;
      inputRef.current = null;
    };
    // `look` is read once here; a later change goes through `setLook` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilding the scene for a new look would drop the loaded garden
  }, [models, session]);

  useEffect(() => {
    sceneRef.current?.setLook(look);
  }, [look]);

  useEffect(() => {
    if (overlay.kind === "none") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" || (overlay.kind === "album" && e.code === "Tab")) {
        e.preventDefault();
        setOverlay({ kind: "none" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay.kind]);

  const status = snapshot.room.status;
  const loading = models === null || world === null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-wh-paper select-none">
      <div ref={surface} className="absolute inset-0" />

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-wh-ink">
          <h1 className="text-3xl font-bold">Whisker Hollow</h1>
          <div className="h-3 w-56 overflow-hidden rounded-full bg-wh-paper-edge">
            <div className="h-full bg-wh-accent transition-all" style={{ width: `${Math.round((models === null ? progress * 0.8 : 0.9) * 100)}%` }} />
          </div>
          {snapshot.saveError !== null && <p className="text-sm">{snapshot.saveError}</p>}
          {(status === "offline" || status === "reconnecting") && <p className="text-sm text-wh-ink-soft">Looking for the island…</p>}
        </div>
      )}

      {!loading && (
        <>
          <div className="absolute top-3 left-3 flex gap-2">
            <CardButton
              aria-label={cameraMode === "third" ? "First person" : "Third person"}
              title={cameraMode === "third" ? "First person" : "Third person"}
              onClick={() => sceneRef.current?.toggleView()}
              className="flex items-center gap-2"
            >
              {cameraMode === "third" ? <Eye className="size-5" /> : <Video className="size-5" />}
              <Prompt binding={BINDINGS.view} input={inputKind} />
            </CardButton>
          </div>
          <PlayersBadge players={snapshot.room.players.map((p) => p.name)} />
          {snapshot.saveError !== null && (
            <div className="absolute top-16 left-3 rounded-xl bg-wh-paper px-3 py-1 text-sm text-wh-ink shadow">{snapshot.saveError}</div>
          )}
          {target !== null && playing && <TargetPrompt target={target} input={inputKind} />}
        </>
      )}

      {naming !== undefined && world !== null && (
        <NameCard
          pair={naming}
          onName={(name) => {
            session.name(naming.species, name);
            setOverlay({ kind: "none" });
          }}
          onLater={() => {
            setDeferred((d) => new Set(d).add(naming.species));
            setOverlay({ kind: "none" });
          }}
        />
      )}
      {overlay.kind === "album" && world !== null && <Album world={world} onClose={() => setOverlay({ kind: "none" })} />}
      {overlay.kind === "pause" && (
        <PauseMenu
          onResume={() => setOverlay({ kind: "none" })}
          onAlbum={() => setOverlay({ kind: "album" })}
          onChangeLook={() => {
            setOverlay({ kind: "none" });
            onChangeLook();
          }}
        />
      )}
    </div>
  );
}

function PlayersBadge({ players }: { players: string[] }) {
  return (
    <div data-testid="players" className="absolute top-3 right-3 flex gap-1 rounded-full bg-wh-paper/90 px-3 py-1.5 text-sm font-semibold text-wh-ink shadow">
      {players.map((name, i) => (
        <span key={i} className={cn(i > 0 && "before:mr-1 before:content-['·']")}>{name}</span>
      ))}
    </div>
  );
}

/** What interact does here, shown as its button and a symbol of the act. */
function TargetPrompt({ target, input }: { target: Target; input: InputKind }) {
  let what: React.ReactNode;
  if (target.kind === "put-down" && target.home !== null) {
    // At a home, its pair's name, and whether the one carried belongs there.
    what = (
      <>
        {speciesOrThrow(target.home).name}
        <span aria-label={target.right ? "their home" : "not their home"}>{target.right ? "♥" : "✗"}</span>
      </>
    );
  } else {
    what = { "pick-up": "Pick up", "put-down": "Put down", name: "Name" }[target.kind];
  }
  return (
    <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-wh-paper/95 px-4 py-2 text-lg font-semibold text-wh-ink shadow-lg">
      <Prompt binding={BINDINGS.interact} input={input} />
      {what}
    </div>
  );
}
