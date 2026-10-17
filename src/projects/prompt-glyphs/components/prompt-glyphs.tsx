"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Check, Gamepad2, Hand, Hourglass, Keyboard, Menu, Mouse, SlidersHorizontal, Trash2, User } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { ControlGlyph, MOUSE_GLYPHS, PAD_GLYPHS, PromptButton, type Binding, type Control } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import { cn } from "@/shared/lib/utils";
import { GAMES, KEYS, type PromptGame } from "../games";

const INPUTS: readonly { kind: InputKind; icon: ReactNode; name: string }[] = [
  { kind: "keyboard-mouse", icon: <Keyboard size={18} />, name: "Keyboard and mouse" },
  { kind: "pad", icon: <Gamepad2 size={18} />, name: "Controller" },
  { kind: "touch", icon: <Hand size={18} />, name: "Touch" },
];

/** Every glyph the shared button prompts can draw, and each game's map from a meaning to them. */
export function PromptGlyphs() {
  const [input, setInput] = useState<InputKind>("keyboard-mouse");

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="space-y-2 text-center">
        <div className="mx-auto w-fit rounded-md bg-surface-elevated p-3 text-brand-blue">
          <Keyboard size={32} />
        </div>
        <h1 className="text-3xl font-bold">Prompt Glyphs</h1>
      </header>

      <GlyphSection icon={<Keyboard size={20} />} title="Keyboard" glyphs={KEYS.map((key) => ({ name: key, control: { key } }))} />
      <GlyphSection icon={<Gamepad2 size={20} />} title="Controller" glyphs={PAD_GLYPHS.map((pad) => ({ name: pad, control: { pad } }))} />
      <GlyphSection icon={<Mouse size={20} />} title="Mouse" glyphs={MOUSE_GLYPHS.map((mouse) => ({ name: mouse, control: { mouse } }))} />

      <InputPicker input={input} onChange={setInput} />
      <Card className="flex flex-wrap items-center justify-center gap-3 p-4">
        <DemoButtons bindings={DEMO} input={input} button="border-border-default bg-surface-elevated text-text-primary" />
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {GAMES.map((game) => (
          <GameCard key={game.name} game={game} input={input} />
        ))}
      </div>

      <Link href="/" className="mx-auto">
        <Button variant="ghost">Back to Novelty World</Button>
      </Link>
    </div>
  );
}

/** Live buttons for the site's own palette: a plain press, and a filling hold. */
const DEMO: Readonly<Record<string, Binding>> = {
  menu: { pad: "Menu", key: "M", fills: false },
  profile: { pad: "Y", key: "I", fills: false },
  settings: { pad: "View", key: "Tab", fills: false },
  discard: { pad: "X", key: "Backspace", fills: true },
};
const DEMO_ICONS: Partial<Record<string, ReactNode>> = {
  menu: <Menu size={16} />,
  profile: <User size={16} />,
  settings: <SlidersHorizontal size={16} />,
  discard: <Trash2 size={16} />,
};

function GlyphSection({ icon, title, glyphs }: { icon: ReactNode; title: string; glyphs: readonly { name: string; control: Control }[] }) {
  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold text-text-secondary">
        {icon}
        {title}
      </h2>
      <ul className="flex flex-wrap gap-x-2 gap-y-3">
        {glyphs.map(({ name, control }) => (
          <li key={name} className="flex min-w-11 flex-col items-center gap-1">
            <ControlGlyph control={control} className="text-2xl" />
            <span className="font-mono text-[10px] text-text-muted">{name}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function InputPicker({ input, onChange }: { input: InputKind; onChange: (input: InputKind) => void }) {
  return (
    <div role="radiogroup" aria-label="Input" className="mx-auto flex gap-1 rounded-lg border border-border-default bg-surface-secondary p-1">
      {INPUTS.map(({ kind, icon, name }) => (
        <button
          key={kind}
          type="button"
          role="radio"
          aria-checked={input === kind}
          aria-label={name}
          title={name}
          onClick={() => {
            onChange(kind);
          }}
          className={cn("rounded-md px-4 py-2 transition-colors", input === kind ? "bg-brand-blue text-surface-primary" : "text-text-secondary hover:bg-surface-elevated")}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

/** Each binding as a live `PromptButton`, a filling hold held by the pointer. */
function DemoButtons({ bindings, input, button }: { bindings: Readonly<Record<string, Binding>>; input: InputKind; button: string }) {
  return (
    <>
      {Object.entries(bindings).map(([meaning, binding]) => (
        <DemoButton key={meaning} meaning={meaning} binding={binding} input={input} button={button} />
      ))}
    </>
  );
}

function DemoButton({ meaning, binding, input, button }: { meaning: string; binding: Binding; input: InputKind; button: string }) {
  const [holding, setHolding] = useState(false);
  const [held, setHeld] = useState(0);
  const label = (
    <>
      {DEMO_ICONS[meaning]}
      {meaning}
      {held > 0 && <Check size={14} aria-label={`held ${held} times`} />}
    </>
  );
  const shape = "rounded-md border px-3 py-1.5 text-sm font-semibold";
  if (!binding.fills) {
    return (
      <PromptButton binding={binding} input={input} className={cn(shape, button)}>
        {label}
      </PromptButton>
    );
  }
  const release = () => {
    setHolding(false);
  };
  return (
    <PromptButton
      binding={binding}
      input={input}
      hold={{ holding, onHeld: () => { setHeld((count) => count + 1); } }}
      onPointerDown={() => {
        setHolding(true);
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      className={cn(shape, "touch-none select-none border-transparent")}
    >
      {label}
    </PromptButton>
  );
}

/** A game's bindings and buttons, painted in its own palette. */
function GameCard({ game, input }: { game: PromptGame; input: InputKind }) {
  return (
    <section style={game.theme} className={cn("space-y-4 rounded-lg border p-4", game.panel)}>
      <h2 className="text-lg font-bold">{game.name}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className={cn("border-b", game.line, game.muted)}>
            <th className="py-1 text-left font-normal">
              <span className="sr-only">Meaning</span>
            </th>
            <th className="py-1" aria-label="Keyboard" title="Keyboard">
              <Keyboard size={16} className="mx-auto" />
            </th>
            <th className="py-1" aria-label="Controller" title="Controller">
              <Gamepad2 size={16} className="mx-auto" />
            </th>
            <th className="py-1" aria-label="Hold to act" title="Hold to act">
              <Hourglass size={16} className="mx-auto" />
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(game.bindings).map(([meaning, binding]) => (
            <tr key={meaning} className={cn("border-b last:border-b-0", game.line)}>
              <td className="py-1.5 pr-2 font-mono text-xs">{meaning}</td>
              <td className="py-1.5 text-center text-lg">{binding.key === null ? <None muted={game.muted} /> : <ControlGlyph control={{ key: binding.key }} />}</td>
              <td className="py-1.5 text-center text-lg">{binding.pad === null ? <None muted={game.muted} /> : <ControlGlyph control={{ pad: binding.pad }} />}</td>
              <td className="py-1.5 text-center">{binding.fills && <Hourglass size={16} aria-label="hold" className="mx-auto" />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-2">
        <DemoButtons bindings={game.bindings} input={input} button={game.button} />
      </div>
      <ul className="flex flex-wrap gap-2 text-xl" aria-label={`${game.name}'s controller glyphs`}>
        {PAD_GLYPHS.map((pad) => (
          <li key={pad} title={pad}>
            <ControlGlyph control={{ pad }} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function None({ muted }: { muted: string }) {
  return (
    <span aria-label="none" className={muted}>
      –
    </span>
  );
}
