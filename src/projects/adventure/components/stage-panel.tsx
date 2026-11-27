"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ban, Clapperboard, Hand as HandIcon, PawPrint, PersonStanding, Rotate3d, Sword, UserRound, Users, X, ZoomIn, type LucideIcon } from "lucide-react";
import { ControlGlyph, type Control } from "@/shared/components/prompts";
import { subscribeGamepads, usePadNavigation } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import { isTextEntryTarget } from "@/shared/lib/utils";
import { ANIMALS } from "../animals";
import { CHARACTERS, characterOrThrow, type CharacterId } from "../characters";
import { BINDINGS, keyLabel, PAD_BINDINGS } from "../input/controls";
import { playerOf, type Lineup } from "../input/lineup";
import type { CharacterViewer } from "../scene/character-viewer";
import { portraitOf, type Subject } from "../scene/stage";
import { PLAYER_CHARACTER } from "../villagers";
import { HANDS, madeForWeapon, WEAPONS, weaponOrThrow, type Hand } from "../weapons";
import { BUTTON, letGo, PRESSED, SidePanel, Tile, TilePicture } from "./side-panel";

/** The viewer's key, and its button on a pad: C for characters, beside the keys play uses, and Y, the face button play leaves free. */
const KEY = { code: "KeyC", label: "C" } as const;
const PAD = "Y" as const;

/**
 * The character and animal viewer: a button and key that open it from play,
 * and while it is open the roster as portraits, the subject's clips, and for
 * a character what it holds and in which hand, all on the stage it draws in
 * the world's place. Closing it with a character on the stage makes the first
 * player that character, holding what it holds and playing its clip until
 * they set off; closing it on an animal leaves the player as they were.
 */
export function StagePanel({
  viewer,
  input,
  lineup,
  editing,
  onOpen,
  onFailure,
}: {
  viewer: CharacterViewer;
  input: InputKind;
  lineup: Lineup;
  editing: boolean;
  onOpen: (open: boolean) => void;
  onFailure: (message: string) => void;
}) {
  const [open, setOpenState] = useState(false);
  const [subject, setSubject] = useState<Subject>({ kind: "character", id: PLAYER_CHARACTER });
  const [player, setPlayer] = useState<CharacterId>(PLAYER_CHARACTER);
  const [clips, setClips] = useState<readonly string[]>([]);
  const [clip, setClip] = useState("idle");
  const [weapon, setWeapon] = useState<string | null>(null);
  const [hand, setHand] = useState<Hand>("right");
  const [portraits, setPortraits] = useState<Readonly<Record<string, string>>>({});
  /** Whether the stage has been set yet: the first opening stands the player's character on it. */
  const set = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<() => void>(() => undefined);
  const showing = open && !editing;
  usePadNavigation(root, { enabled: showing, reveal: input === "pad" });

  // The stage is the map editor's to give way to: opened over the viewer, it draws in its place, and the viewer is back when it closes.
  useEffect(() => {
    if (set.current) viewer.stage().setOpen(showing);
  }, [viewer, showing]);

  function stand(next: Subject, playing: string): void {
    setSubject(next);
    viewer
      .stage()
      .show(next, playing)
      .then((shown) => {
        if (shown === null) return;
        setClips(shown.clips);
        setClip(shown.playing);
      }, (error: unknown) => onFailure(String(error)));
  }

  function hold(nextWeapon: string | null, nextHand: Hand): void {
    setWeapon(nextWeapon);
    setHand(nextHand);
    viewer
      .stage()
      .hold(nextWeapon === null ? null : weaponOrThrow(nextWeapon), nextHand)
      .catch((error: unknown) => onFailure(String(error)));
  }

  function setOpen(next: boolean): void {
    const stage = viewer.stage();
    if (next && !set.current) {
      set.current = true;
      stand(subject, clip);
      stage.portraits((name, url) => setPortraits((now) => ({ ...now, [name]: url }))).catch((error: unknown) => onFailure(String(error)));
    }
    stage.setOpen(next && !editing);
    if (!next && subject.kind === "character") {
      setPlayer(subject.id);
      viewer.show(characterOrThrow(subject.id), clip).catch((error: unknown) => onFailure(String(error)));
      viewer.hold(weapon === null ? null : weaponOrThrow(weapon), hand).catch((error: unknown) => onFailure(String(error)));
    }
    setOpenState(next);
    onOpen(next);
  }

  useEffect(() => {
    toggle.current = () => {
      if (!editing) setOpen(!open);
    };
  });

  // Its key and pad button, from play or in it: never the second player's input, whose choices these aren't.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.code !== KEY.code || event.repeat || isTextEntryTarget(event.target) || playerOf(lineup, "keys") === 1) return;
      toggle.current();
    };
    window.addEventListener("keydown", key);
    const stopPads = subscribeGamepads({
      onButton: (edge) => {
        if (edge.pressed && edge.name === PAD && playerOf(lineup, edge.pad) === 0) toggle.current();
      },
    });
    return () => {
      window.removeEventListener("keydown", key);
      stopPads();
    };
  }, [lineup]);

  const glyph: Control = input === "pad" ? { pad: PAD } : { key: KEY.label };

  if (!showing) {
    if (editing) return null;
    return (
      <button type="button" className={`${BUTTON} absolute top-3 left-3`} title="Characters and animals" aria-label="Characters and animals" onClick={() => setOpen(true)}>
        <PersonStanding aria-hidden className="size-4" />
        <ControlGlyph control={glyph} className="text-xs" />
      </button>
    );
  }

  const character = subject.kind === "character";
  return (
    <>
      <SidePanel
        ref={root}
        label="Characters and animals"
        top={
          <div className="flex items-center gap-1.5">
            <PersonStanding aria-hidden className="size-5 text-brand-blue" />
            <span className="flex-1" />
            <button type="button" data-pad-back className={BUTTON} title="Back to play" aria-label="Back to play" onClick={() => setOpen(false)}>
              <X aria-hidden className="size-4" />
              <ControlGlyph control={input === "pad" ? { pad: "B" } : { key: KEY.label }} className="text-xs" />
            </button>
          </div>
        }
      >
        <Section icon={Users} label="Characters">
          <div className="grid grid-cols-5 gap-1">
            {CHARACTERS.map((c) => (
              <Portrait
                key={c.id}
                name={c.name}
                url={portraits[portraitOf("character", c.id)]}
                chosen={character && subject.id === c.id}
                player={c.id === player}
                start={character && subject.id === c.id}
                onPick={() => stand({ kind: "character", id: c.id }, clip)}
              />
            ))}
          </div>
        </Section>
        <Section icon={PawPrint} label="Animals">
          <div className="grid grid-cols-5 gap-1">
            {ANIMALS.map((a) => (
              <Portrait
                key={a.id}
                name={a.name}
                url={portraits[portraitOf("animal", a.id)]}
                chosen={!character && subject.id === a.id}
                player={false}
                start={!character && subject.id === a.id}
                onPick={() => stand({ kind: "animal", id: a.id }, clip)}
              />
            ))}
          </div>
        </Section>
        <Section icon={Clapperboard} label="Animation">
          <div className="flex flex-wrap gap-1">
            {clips.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={clip === name}
                title={character && madeForWeapon(name) ? `${name}: made for a held weapon` : name}
                className={`flex items-center gap-1 rounded border border-border-default bg-surface-elevated px-1.5 py-0.5 font-mono text-xs text-text-primary hover:border-border-hover ${PRESSED}`}
                onClick={(event) => {
                  letGo(event);
                  setClip(name);
                  viewer.stage().play(name);
                }}
              >
                {character && madeForWeapon(name) && <Sword aria-label="Made for a held weapon" className="size-3 text-text-secondary" />}
                {name}
              </button>
            ))}
          </div>
        </Section>
        {character && (
          <Section icon={Sword} label="Held">
            <div className="grid grid-cols-6 gap-1">
              <button
                type="button"
                title="Nothing"
                aria-label="Nothing"
                aria-pressed={weapon === null}
                className={`flex aspect-square items-center justify-center rounded-md border border-border-default bg-surface-elevated hover:border-border-hover ${PRESSED}`}
                onClick={(event) => {
                  letGo(event);
                  hold(null, hand);
                }}
              >
                <Ban aria-hidden className="size-5 text-text-secondary" />
              </button>
              {WEAPONS.map((w) => (
                <Portrait key={w.id} name={w.name} url={portraits[portraitOf("weapon", w.id)]} chosen={weapon === w.id} player={false} start={false} onPick={() => hold(w.id, hand)} />
              ))}
            </div>
            <div role="group" aria-label="In which hand" className="mt-1 flex gap-1">
              {HANDS.map((h) => (
                <button
                  key={h}
                  type="button"
                  title={h === "right" ? "In the right hand" : "In the left hand"}
                  aria-label={h === "right" ? "In the right hand" : "In the left hand"}
                  aria-pressed={hand === h}
                  disabled={weapon === null}
                  className={`${BUTTON} flex-1 justify-center ${PRESSED}`}
                  onClick={(event) => {
                    letGo(event);
                    hold(weapon, h);
                  }}
                >
                  <HandIcon aria-hidden className={`size-4 ${h === "left" ? "-scale-x-100" : ""}`} />
                  <span className="text-xs">{h === "right" ? "R" : "L"}</span>
                </button>
              ))}
            </div>
          </Section>
        )}
      </SidePanel>
      <StageHints input={input} />
    </>
  );
}

/** A part of the panel, marked by its icon. */
function Section({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-1">
      <Icon aria-label={label} className="size-4 text-text-secondary" />
      {children}
    </section>
  );
}

/** One of the roster, or a weapon, by its portrait, its name its tooltip; the character the player plays as is badged. */
function Portrait({ name, url, chosen, player, start, onPick }: { name: string; url: string | undefined; chosen: boolean; player: boolean; start: boolean; onPick: () => void }) {
  return (
    <Tile
      name={name}
      title={player ? `${name}: you play as them` : name}
      pressed={chosen}
      start={start}
      badges={
        player && (
          <span className="absolute top-0.5 right-0.5 rounded-full bg-brand-orange p-0.5">
            <UserRound aria-label="You play as them" className="size-2.5 text-surface-primary" />
          </span>
        )
      }
      onPick={onPick}
    >
      <TilePicture url={url} className="size-full" />
    </Tile>
  );
}

/** How the camera goes round the stage, as glyphs: the arrow keys or a drag, the right stick; + and −, the wheel, or the triggers. */
function StageHints({ input }: { input: InputKind }) {
  const pad = input === "pad";
  return (
    <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-3 text-xs text-text-muted">
      <span className="flex items-center gap-0.5" title="Turn round: drag, or the arrow keys">
        <span className="sr-only">Turn round:</span>
        {pad ? <ControlGlyph control={{ pad: PAD_BINDINGS.camera }} /> : <ControlGlyph control={{ mouse: "left" }} />}
        <Rotate3d aria-hidden className="ml-0.5 size-4" />
      </span>
      <span className="flex items-center gap-0.5" title="Zoom: the wheel, or + and −">
        <span className="sr-only">Zoom:</span>
        {pad ? (
          <>
            <ControlGlyph control={{ pad: PAD_BINDINGS.zoomIn }} />
            <ControlGlyph control={{ pad: PAD_BINDINGS.zoomOut }} />
          </>
        ) : (
          [BINDINGS.zoomIn, BINDINGS.zoomOut].map(([code]) => <ControlGlyph key={code} control={{ key: keyLabel(code) }} />)
        )}
        <ZoomIn aria-hidden className="ml-0.5 size-4" />
      </span>
    </div>
  );
}
