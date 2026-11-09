"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ChevronsDown, ChevronsUp, CircleArrowDown, Car, Crosshair, Eye, Flag, Fullscreen, Gamepad2, Hand, Keyboard, Map as MapIcon, MapPinOff, Menu as MenuIcon, Minus, MonitorCog, Move3d, MoveHorizontal, Plus, Radar, RefreshCcw, SlidersHorizontal, SwitchCamera, Volume1, Volume2, VolumeX, X } from "lucide-react";
import type { InputKind } from "@/shared/lib/input";
import { subscribeGamepads } from "@/shared/lib/gamepad";
import { ControlGlyph, Prompt, type Binding, type PadGlyph } from "@/shared/components/prompts";
import { useDriveSoundSettings } from "../audio/settings";
import { RENDER_SCALES, useDriveGraphics } from "../render/graphics-settings";
import { TRAFFIC_DENSITIES, TRAFFIC_REACHES, TRAFFIC_VOICE_COUNTS, useTrafficSettings, type TrafficSettings } from "../traffic/settings";
import { tyreOfItem, unitsOfItem, type GameMenu, type MenuItemId } from "../render/game-menu";
import { BINDINGS } from "../input/controls";
import { useUnits, type Units } from "../units";
import type { Tyre } from "../sim/surfaces";
import { ACCENT, INK, MenuButton, SideBySide, TYRE_LOOKS, UNITS_LOOKS, type Icon, type ItemLook } from "./menu-parts";

/*
 * The Settings page off the game menu, in tabs. Gameplay's settings are the
 * game's (`render/game-menu.ts` lists them as items); the others are kept by
 * the page in this browser and followed live. LB and RB, or Q and E, step
 * through the tabs and put the focus on the new tab's first setting.
 */

type Tab = "gameplay" | "controls" | "audio" | "graphics";

const TABS: readonly { id: Tab; icon: Icon; name: string }[] = [
  { id: "gameplay", icon: SlidersHorizontal, name: "Gameplay" },
  { id: "controls", icon: Gamepad2, name: "Controls" },
  { id: "audio", icon: Volume2, name: "Audio" },
  { id: "graphics", icon: MonitorCog, name: "Graphics" },
];

const PREVIOUS_TAB: Binding = { pad: "LB", key: "Q", fills: false };
const NEXT_TAB: Binding = { pad: "RB", key: "E", fills: false };

type TyreItem = `tyres-${Tyre}`;
const isTyreItem = (id: MenuItemId): id is TyreItem => id.startsWith("tyres-");
type UnitsItem = `units-${Units}`;
const isUnitsItem = (id: MenuItemId): id is UnitsItem => id.startsWith("units-");
const ASSISTS = ["abs", "traction", "stability"] as const;

/** The tyres, the driver's aids and the units: the game's own settings, picked through the menu's items. */
function GameplayTab({ menu, first, look, onPick }: { menu: GameMenu; first: RefObject<HTMLButtonElement | null>; look: (id: MenuItemId) => ItemLook; onPick: (id: MenuItemId) => void }) {
  const shownUnits = useUnits((state) => state.units);
  const tyres = menu.items.filter(isTyreItem).map((item) => {
    const tyre = tyreOfItem(item);
    return { id: item, icon: TYRE_LOOKS[tyre].icon, label: TYRE_LOOKS[tyre].name, spoken: `${TYRE_LOOKS[tyre].name} tyres`, on: tyre === menu.tyres };
  });
  const units = menu.items.filter(isUnitsItem).map((item) => {
    const shown = unitsOfItem(item);
    return { id: item, icon: UNITS_LOOKS[shown].icon, label: UNITS_LOOKS[shown].name, spoken: `${UNITS_LOOKS[shown].name} units`, detail: UNITS_LOOKS[shown].detail, on: shown === shownUnits };
  });
  return (
    <div className="flex flex-col gap-2">
      <SideBySide name="Tyres" choices={tyres} first={first} onPick={onPick} />
      {ASSISTS.filter((id) => menu.items.includes(id)).map((id) => (
        <MenuButton key={id} look={look(id)} onPress={() => { onPick(id); }} />
      ))}
      <SideBySide name="Units" choices={units} onPick={onPick} />
    </div>
  );
}

/** A row of the controls: what it does, and the bindings that do it, whose keys and pad buttons are listed once each. */
interface ControlRow {
  icon: Icon;
  label: string;
  bindings: readonly Binding[];
}

const CONTROL_SECTIONS: readonly { name: string; rows: readonly ControlRow[] }[] = [
  {
    name: "Driving",
    rows: [
      { icon: ChevronsUp, label: "Accelerate", bindings: [BINDINGS.throttle] },
      { icon: ChevronsDown, label: "Brake, then reverse", bindings: [BINDINGS.brake] },
      { icon: MoveHorizontal, label: "Steer", bindings: [BINDINGS.left, BINDINGS.right] },
      { icon: Hand, label: "Handbrake", bindings: [BINDINGS.handbrake] },
      { icon: RefreshCcw, label: "Back to the road", bindings: [BINDINGS.respawn] },
      { icon: Flag, label: "Challenge, race or invite", bindings: [BINDINGS.challenge] },
    ],
  },
  {
    name: "Camera",
    rows: [
      { icon: SwitchCamera, label: "Chase view or driver's seat", bindings: [BINDINGS.cockpit] },
      { icon: Eye, label: "Look round, held", bindings: [BINDINGS.lookLeft, BINDINGS.lookRight, BINDINGS.lookBehind] },
      { icon: CircleArrowDown, label: "Look down on the car, held", bindings: [BINDINGS.lookDown] },
      { icon: Move3d, label: "Free camera", bindings: [BINDINGS.freeCamera] },
    ],
  },
  {
    name: "Menus",
    rows: [
      { icon: MapIcon, label: "World map", bindings: [BINDINGS.map] },
      { icon: MenuIcon, label: "Game menu", bindings: [BINDINGS.menu] },
      { icon: Volume2, label: "Sound on or off", bindings: [BINDINGS.mute] },
    ],
  },
  {
    name: "World map",
    rows: [
      { icon: Crosshair, label: "Set destination", bindings: [BINDINGS.mapPick] },
      { icon: MapPinOff, label: "Clear route", bindings: [BINDINGS.mapClear] },
      { icon: X, label: "Close map", bindings: [BINDINGS.mapClose, BINDINGS.map] },
    ],
  },
];

const unique = <T,>(values: readonly (T | null)[]): T[] => [...new Set(values.filter((value): value is T => value !== null))];

function Glyphs({ name, controls }: { name: string; controls: readonly ({ key: string } | { pad: PadGlyph })[] }) {
  const spoken = controls.map((control) => ("key" in control ? control.key : control.pad)).join(", ");
  return (
    <td className="py-0.5 pl-3" aria-label={`${name}: ${spoken || "none"}`}>
      <span className="flex items-center gap-1">
        {controls.length === 0 ? <span className="opacity-40">–</span> : controls.map((control) => <ControlGlyph key={"key" in control ? control.key : control.pad} control={control} />)}
      </span>
    </td>
  );
}

/** Every control on the keyboard and on a controller, side by side, from the game's one map of them (`input/controls.ts`). */
function ControlsTab() {
  const half = Math.ceil(CONTROL_SECTIONS.length / 2);
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
      {[CONTROL_SECTIONS.slice(0, half), CONTROL_SECTIONS.slice(half)].map((column, index) => (
        <div key={index} className="flex flex-col gap-3">
          {column.map(({ name, rows }) => (
            <table key={name} aria-label={name} className="w-full border-collapse">
              {/* Fixed widths for the glyph columns, so every section's keys and buttons line up under one another. */}
              <colgroup>
                <col />
                <col className="w-24" />
                <col className="w-[4.5rem]" />
              </colgroup>
              <thead>
                <tr className="text-xs font-semibold opacity-75">
                  <th scope="col" className="pb-1 text-left">{name}</th>
                  <th scope="col" className="pb-1 pl-3 text-left" aria-label="Keyboard" title="Keyboard"><Keyboard aria-hidden className="size-4" /></th>
                  <th scope="col" className="pb-1 pl-3 text-left" aria-label="Controller" title="Controller"><Gamepad2 aria-hidden className="size-4" /></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ icon: RowIcon, label, bindings }) => (
                  <tr key={label}>
                    <th scope="row" className="py-0.5 text-left font-semibold whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        <RowIcon aria-hidden className="size-4 shrink-0" />
                        {label}
                      </span>
                    </th>
                    <Glyphs name="Keyboard" controls={unique(bindings.map(({ key }) => key)).map((key) => ({ key }))} />
                    <Glyphs name="Controller" controls={unique(bindings.map(({ pad }) => pad)).map((pad) => ({ pad }))} />
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      ))}
    </div>
  );
}

const STEPPER = "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded border-2 aria-disabled:cursor-default aria-disabled:opacity-40";

/** Sound on or off and the master volume, both kept in this browser. The slider is for a mouse; a pad steps it by tens with its buttons. */
function AudioTab({ first }: { first: RefObject<HTMLButtonElement | null> }) {
  const { muted, volume } = useDriveSoundSettings((state) => state.settings);
  const toggleMuted = useDriveSoundSettings((state) => state.toggleMuted);
  const setVolume = useDriveSoundSettings((state) => state.setVolume);
  const percent = Math.round(volume * 100);
  const step = (way: number) => {
    setVolume(Math.round(volume * 10 + way) / 10);
  };
  return (
    <div className="flex flex-col gap-3">
      <MenuButton look={{ icon: muted ? VolumeX : Volume2, label: "Sound", on: !muted }} start buttonRef={first} onPress={toggleMuted} />
      <div role="group" aria-label="Volume" className="flex items-center gap-2" style={{ opacity: muted ? 0.5 : 1 }}>
        <Volume1 aria-hidden className="size-5 shrink-0" />
        <span className="text-lg font-semibold">Volume</span>
        {/* aria-disabled rather than disabled, so a pad's focus stays on a button pressed to its end. */}
        <button type="button" aria-label="Lower volume" aria-disabled={percent === 0} className={STEPPER} style={{ borderColor: INK }} onClick={() => { step(-1); }}>
          <Minus aria-hidden className="size-4" />
        </button>
        <input type="range" min={0} max={100} value={percent} aria-label="Volume" className="grow cursor-pointer" style={{ accentColor: ACCENT }} onChange={(event) => { setVolume(Number(event.target.value) / 100); }} />
        <button type="button" aria-label="Raise volume" aria-disabled={percent === 100} className={STEPPER} style={{ borderColor: INK }} onClick={() => { step(1); }}>
          <Plus aria-hidden className="size-4" />
        </button>
        <span className="w-12 text-center text-lg font-semibold tabular-nums" role="status" aria-label="Volume level">{percent}%</span>
      </div>
      <TrafficRow setting="voiced" steps={TRAFFIC_VOICE_COUNTS} icon={Car} name="Cars heard" title="How many of the nearest traffic cars are heard" shown={String} />
    </div>
  );
}

/**
 * A setting stepped by whole steps with a minus and a plus, its value between them. aria-disabled rather than disabled,
 * so a pad's focus stays on a button pressed to its end.
 */
function StepRow({ icon: Icon, name, title, detail, value, lowest, highest, first, onStep }: { icon: Icon; name: string; title: string; detail?: { label: string; text: string }; value: string; lowest: boolean; highest: boolean; first?: RefObject<HTMLButtonElement | null>; onStep: (way: number) => void }) {
  return (
    <div role="group" aria-label={name} className="flex items-center gap-2">
      <Icon aria-hidden className="size-5 shrink-0" />
      <div className="flex grow flex-col leading-tight" title={title}>
        <span className="text-lg font-semibold">{name}</span>
        {detail && <span className="text-xs tabular-nums opacity-75" aria-label={detail.label}>{detail.text}</span>}
      </div>
      <button ref={first} type="button" data-pad-start={first ? true : undefined} aria-label={`Lower ${name.toLowerCase()}`} aria-disabled={lowest} className={STEPPER} style={{ borderColor: INK }} onClick={() => { onStep(-1); }}>
        <Minus aria-hidden className="size-4" />
      </button>
      <span className="w-12 text-center text-lg font-semibold tabular-nums" role="status" aria-label={name}>{value}</span>
      <button type="button" aria-label={`Raise ${name.toLowerCase()}`} aria-disabled={highest} className={STEPPER} style={{ borderColor: INK }} onClick={() => { onStep(1); }}>
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
}

/** A traffic setting's row: its value among its steps, kept by the page and followed by the game live. */
function TrafficRow<Key extends keyof TrafficSettings>({ setting, steps, icon, name, title, shown }: { setting: Key; steps: readonly number[]; icon: Icon; name: string; title: string; shown: (value: number) => string }) {
  const value = useTrafficSettings((state) => state.settings[setting]);
  const step = useTrafficSettings((state) => state.step);
  return <StepRow icon={icon} name={name} title={title} value={shown(value)} lowest={value === steps[0]} highest={value === steps[steps.length - 1]} onStep={(way) => { step(setting, way); }} />;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** The graphics settings, which the page keeps and the game follows live. The menu covers the game, so its size is the game's. */
function GraphicsTab({ view, first }: { view: { width: number; height: number }; first: RefObject<HTMLButtonElement | null> }) {
  const scale = useDriveGraphics((state) => state.settings.renderScale);
  const step = useDriveGraphics((state) => state.stepRenderScale);
  // As three sizes the canvas: CSS pixels times the pixel ratio, rounded down.
  const ratio = window.devicePixelRatio * scale;
  const resolution = `${Math.floor(view.width * ratio)}×${Math.floor(view.height * ratio)}`;
  return (
    <div className="flex flex-col gap-3">
      <StepRow icon={Fullscreen} name="Render scale" title="Share of the screen's physical pixels the world is drawn at" detail={{ label: "Resolution", text: resolution }} value={percent(scale)} lowest={scale === RENDER_SCALES[0]} highest={scale === RENDER_SCALES[RENDER_SCALES.length - 1]} first={first} onStep={step} />
      <TrafficRow setting="density" steps={TRAFFIC_DENSITIES} icon={Car} name="Traffic" title="How many cars, cyclists and walkers are out, against Åland's own" shown={percent} />
      <TrafficRow setting="reach" steps={TRAFFIC_REACHES} icon={Radar} name="Traffic reach" title="How far round you traffic is kept moving" shown={percent} />
    </div>
  );
}

export function SettingsMenu({ menu, input, view, first, look, onPick }: { menu: GameMenu; input: InputKind; view: { width: number; height: number }; first: RefObject<HTMLButtonElement | null>; look: (id: MenuItemId) => ItemLook; onPick: (id: MenuItemId) => void }) {
  const [tab, setTab] = useState<Tab>("gameplay");
  const tabButtons = useRef(new Map<Tab, HTMLButtonElement>());
  // Set when a bumper or key stepped the tabs, so the focus follows to the new tab once it's drawn.
  const focusNewTab = useRef(false);

  useEffect(() => {
    const stepTab = (way: number) => {
      focusNewTab.current = true;
      setTab((at) => TABS[(TABS.findIndex(({ id }) => id === at) + way + TABS.length) % TABS.length].id);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === "KeyQ") stepTab(-1);
      if (event.code === "KeyE") stepTab(1);
    };
    window.addEventListener("keydown", onKey);
    const stopPads = subscribeGamepads({
      onButton: ({ pressed, name }) => {
        if (!pressed) return;
        if (name === "LB") stepTab(-1);
        if (name === "RB") stepTab(1);
      },
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      stopPads();
    };
  }, []);

  useEffect(() => {
    if (!focusNewTab.current) return;
    focusNewTab.current = false;
    // Controls has nothing to set, so the focus stays on its tab.
    (first.current ?? tabButtons.current.get(tab))?.focus({ preventScroll: true });
  }, [tab, first]);

  return (
    <div className="mb-1 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Prompt binding={PREVIOUS_TAB} input={input} />
        <div role="tablist" aria-label="Settings" className="flex grow gap-1">
          {TABS.map(({ id, icon: TabIcon, name }) => {
            const selected = id === tab;
            return (
              <button
                key={id}
                ref={(button) => {
                  if (button) tabButtons.current.set(id, button);
                  else tabButtons.current.delete(id);
                }}
                type="button"
                role="tab"
                id={`settings-tab-${id}`}
                aria-selected={selected}
                aria-controls="settings-panel"
                className="flex grow cursor-pointer items-center justify-center gap-2 border-b-2 px-2 py-2 font-semibold"
                style={{ borderColor: selected ? ACCENT : "transparent", color: selected ? ACCENT : INK, opacity: selected ? 1 : 0.75 }}
                onClick={() => { setTab(id); }}
              >
                <TabIcon aria-hidden className="size-5 shrink-0" />
                <span>{name}</span>
              </button>
            );
          })}
        </div>
        <Prompt binding={NEXT_TAB} input={input} />
      </div>
      <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`} className="min-h-[24rem]">
        {tab === "gameplay" && <GameplayTab menu={menu} first={first} look={look} onPick={onPick} />}
        {tab === "controls" && <ControlsTab />}
        {tab === "audio" && <AudioTab first={first} />}
        {tab === "graphics" && <GraphicsTab view={view} first={first} />}
      </div>
      <MenuButton look={{ icon: ArrowLeft, label: "Back" }} back onPress={() => { onPick("back"); }} />
    </div>
  );
}
