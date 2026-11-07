"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Globe, Lock, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { ANSWERS, STATEMENTS, type Answer, type Answers } from "../quiz";
import { MODELS, SINCE, TOOLS, USES, type Background, type Choice, type ChoiceGroup } from "../background";
import { NAME_MAX } from "../results";

/** Circle sizes along the scale: strong answers are big, "Neutral" small. */
const ANSWER_SIZES = ["size-12", "size-9", "size-6", "size-9", "size-12"];
const ANSWER_COLORS = ["border-brand-pink", "border-brand-pink", "border-text-muted", "border-brand-green", "border-brand-green"];
const ANSWER_FILLS = ["bg-brand-pink", "bg-brand-pink", "bg-text-muted", "bg-brand-green", "bg-brand-green"];

const PICK_PAUSE_MS = 350;

interface QuizFlowProps {
  /** The name the person goes by elsewhere on the site, offered for sharing. */
  name: string;
  /** `shareAs` is the name to share under, or null to keep the result in this
   *  browser only. */
  onFinish: (answers: Answers, background: Background, shareAs: string | null) => void;
  onQuit: () => void;
}

/** The statements one at a time, then the optional questions about the
 *  person's own use of AI. */
export function QuizFlow({ name, onFinish, onQuit }: QuizFlowProps) {
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const [showingPick, setShowingPick] = useState(false);

  // The pick stays on screen a moment, so the person sees it took before the
  // next statement replaces it.
  useEffect(() => {
    if (!showingPick) return;
    const timer = setTimeout(() => {
      setIndex((i) => i + 1);
      setShowingPick(false);
    }, PICK_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [showingPick]);

  function back() {
    setShowingPick(false);
    setIndex(index - 1);
  }

  if (index === STATEMENTS.length) {
    return <BackgroundStep name={name} onBack={back} onFinish={(background, shareAs) => onFinish(answers, background, shareAs)} />;
  }

  return (
    <StatementStep
      index={index}
      answer={answers[STATEMENTS[index].id]}
      onAnswer={(answer) => {
        if (showingPick) return;
        setAnswers({ ...answers, [STATEMENTS[index].id]: answer });
        setShowingPick(true);
      }}
      onBack={back}
      onQuit={onQuit}
    />
  );
}

function StatementStep({
  index,
  answer,
  onAnswer,
  onBack,
  onQuit,
}: {
  index: number;
  answer: Answer | undefined;
  onAnswer: (answer: Answer) => void;
  onBack: () => void;
  onQuit: () => void;
}) {
  const statement = STATEMENTS[index];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const answer = Number(event.key) - 1;
      if (answer === 0 || answer === 1 || answer === 2 || answer === 3 || answer === 4) onAnswer(answer);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnswer]);

  return (
    <section aria-label="The quiz" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 py-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={index === 0}
          aria-label="Previous statement"
          className="rounded-md p-1.5 text-text-secondary hover:bg-surface-tertiary disabled:invisible"
        >
          <ArrowLeft size={20} />
        </button>
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface-tertiary"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={STATEMENTS.length}
          aria-valuenow={index}
        >
          <div className="h-full rounded-full bg-brand-blue transition-[width]" style={{ width: `${(index / STATEMENTS.length) * 100}%` }} />
        </div>
        <span className="w-14 text-right font-mono text-sm text-text-secondary">
          {index + 1}/{STATEMENTS.length}
        </span>
        <button type="button" onClick={onQuit} aria-label="Leave the quiz" className="rounded-md p-1.5 text-text-secondary hover:bg-surface-tertiary">
          <X size={20} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-2xl font-bold text-balance sm:text-3xl">
        <p>{statement.scene}</p>
        <p>{statement.text}</p>
      </div>

      <div className="grid grid-cols-5 items-start gap-1 pb-8">
        {ANSWERS.map((label, i) => (
          <button
            key={label}
            type="button"
            aria-pressed={answer === i}
            onClick={() => onAnswer(i as Answer)}
            className="group flex flex-col items-center gap-2"
          >
            <span className="flex h-12 items-center">
              <span
                className={`block rounded-full border-2 transition-transform group-hover:scale-110 ${ANSWER_SIZES[i]} ${ANSWER_COLORS[i]} ${
                  answer === i ? ANSWER_FILLS[i] : ""
                }`}
              />
            </span>
            <span className="text-center text-xs text-text-secondary sm:text-sm">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function BackgroundStep({
  name,
  onBack,
  onFinish,
}: {
  name: string;
  onBack: () => void;
  onFinish: (background: Background, shareAs: string | null) => void;
}) {
  const [background, setBackground] = useState<Background>({});
  const [sharing, setSharing] = useState(false);
  const [shareName, setShareName] = useState(name);
  const trimmed = shareName.trim();

  function toggle(key: "uses" | "tools" | "models", id: string) {
    const current = background[key] ?? [];
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    setBackground({ ...background, [key]: next });
  }

  return (
    <section aria-label="About you" className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Previous statement" className="rounded-md p-1.5 text-text-secondary hover:bg-surface-tertiary">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-2xl font-bold">About you</h2>
          <p className="text-sm text-text-secondary">All optional. Pick as many as fit.</p>
        </div>
      </div>

      <Question title="How long have you used AI for coding?">
        <Chips
          choices={SINCE}
          isOn={(id) => background.since === id}
          onToggle={(id) => setBackground({ ...background, since: background.since === id ? undefined : id })}
        />
      </Question>

      <Question title="Where do you use it?">
        <Chips choices={USES} isOn={(id) => background.uses?.includes(id) ?? false} onToggle={(id) => toggle("uses", id)} />
      </Question>

      <Question title="Which tools have you used?">
        <Groups groups={TOOLS} isOn={(id) => background.tools?.includes(id) ?? false} onToggle={(id) => toggle("tools", id)} />
      </Question>

      <Question title="Which models have you used?">
        <Groups groups={MODELS} isOn={(id) => background.models?.includes(id) ?? false} onToggle={(id) => toggle("models", id)} />
      </Question>

      <Question title="Who sees your result?">
        <div className="grid gap-3 sm:grid-cols-2">
          <ShareOption
            selected={!sharing}
            onSelect={() => setSharing(false)}
            icon={<Lock size={20} />}
            title="Only you, in this browser"
            detail="Your result is saved only in this browser. Nothing is sent anywhere, and clearing this browser's data deletes it."
          />
          <ShareOption
            selected={sharing}
            onSelect={() => setSharing(true)}
            icon={<Globe size={20} />}
            title="Everyone, on the public map"
            detail="Everyone who opens this page sees your name, your point and your answers above. You can take it off again from this browser."
          >
            <label className="block space-y-1 text-sm">
              <span className="text-text-secondary">Name to show</span>
              <input
                type="text"
                value={shareName}
                maxLength={NAME_MAX}
                onFocus={() => setSharing(true)}
                onChange={(event) => setShareName(event.target.value)}
                className="w-full rounded-md border border-border-default bg-surface-primary px-2 py-1.5 text-text-primary focus:border-brand-blue focus:outline-none"
              />
            </label>
          </ShareOption>
        </div>
      </Question>

      <Button className="self-center" disabled={sharing && trimmed.length === 0} onClick={() => onFinish(background, sharing ? trimmed : null)}>
        See where I land
      </Button>
    </section>
  );
}

function ShareOption({
  selected,
  onSelect,
  icon,
  title,
  detail,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  detail: string;
  /** Fields that belong to this option, shown inside its card. */
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-md border-2 p-4 transition-colors ${
        selected ? "border-brand-blue bg-brand-blue/10" : "border-border-default hover:border-border-hover"
      }`}
    >
      <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className="flex flex-1 gap-3 text-left">
        <span className={selected ? "text-brand-blue" : "text-text-secondary"}>{icon}</span>
        <span className="space-y-1">
          <span className="block font-bold">{title}</span>
          <span className="block text-sm text-text-secondary">{detail}</span>
        </span>
      </button>
      {children}
    </div>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-bold">{title}</h3>
      {children}
    </div>
  );
}

function Groups({ groups, isOn, onToggle }: { groups: ChoiceGroup[]; isOn: (id: string) => boolean; onToggle: (id: string) => void }) {
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.name} className="space-y-1.5">
          <h4 className="text-xs font-bold tracking-widest text-text-muted uppercase">{group.name}</h4>
          <Chips choices={group.choices} isOn={isOn} onToggle={onToggle} />
        </div>
      ))}
    </div>
  );
}

function Chips({ choices, isOn, onToggle }: { choices: Choice[]; isOn: (id: string) => boolean; onToggle: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          aria-pressed={isOn(choice.id)}
          onClick={() => onToggle(choice.id)}
          className={`rounded-full border px-3 py-1 text-sm transition-colors ${
            isOn(choice.id)
              ? "border-brand-blue bg-brand-blue/15 text-text-primary"
              : "border-border-default text-text-secondary hover:border-border-hover"
          }`}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
