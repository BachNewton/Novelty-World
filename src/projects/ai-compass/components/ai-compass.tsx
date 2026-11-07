"use client";

import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useProfile } from "@/shared/lib/profile";
import { regionAt, regionOf, type Region } from "../compass";
import { scoreAnswers, scoreByStakes, type Answers } from "../quiz";
import type { Background } from "../background";
import { personKey, type SharedResult } from "../results";
import { useLocalResult, type LocalResult } from "../local";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { CompassMap, type Selection } from "./plane";
import { QuizFlow } from "./quiz-flow";
import { LocalResultDetail, RegionDetail, ResultDetail } from "./panels";

const API = "/api/ai-compass";

async function request<T>(method: string, body?: unknown): Promise<T> {
  const response = await fetch(API, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(json.error ?? `${method} ${API} failed with ${response.status}`);
  return json;
}

/** A two-axis map of how people build software with AI: how much of the work
 *  they hand over, and how much of the result they own. */
export function AiCompass() {
  const profile = useProfile();
  const [results, setResults] = useState<SharedResult[]>([]);
  const hydrated = useHydrated();
  const localStore = useLocalResult();
  const local = hydrated ? localStore.result : null;
  const [mine, setMine] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(() => ({ kind: "region", region: regionAt(1, 1) }));
  const [quizzing, setQuizzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<{ results: SharedResult[] }>("GET").then(
      ({ results }) => setResults(results),
      (e: unknown) => setError(`Couldn't load the shared map: ${String(e)}`),
    );
  }, []);

  useEffect(() => {
    void personKey(profile.id).then(setMine);
  }, [profile.id]);

  const openRegion = (region: Region) => setSelection({ kind: "region", region });
  const stakes = selection.kind === "result" || selection.kind === "local" ? selection.result.byStakes : null;
  const taken = local !== null || results.some((r) => r.person === mine);

  /** Sends a result to the public map, scored there from its answers. Each
   *  person has one point, so it replaces their earlier one, shared or kept
   *  in this browser. */
  async function share(answers: Answers, background: Background, name: string) {
    const { result } = await request<{ result: SharedResult }>("POST", { profileId: profile.id, name, answers, background });
    profile.setName(name);
    setResults((current) => [...current.filter((r) => r.person !== result.person), result]);
    localStore.clear();
    setSelection({ kind: "result", result });
  }

  function keepLocally(answers: Answers, background: Background) {
    const result: LocalResult = {
      id: crypto.randomUUID(),
      ...scoreAnswers(answers),
      byStakes: scoreByStakes(answers),
      answers,
      background,
    };
    localStore.set(result);
    setSelection({ kind: "local", result });
  }

  async function finishQuiz(answers: Answers, background: Background, shareAs: string | null) {
    setQuizzing(false);
    if (shareAs === null) {
      keepLocally(answers, background);
      return;
    }
    try {
      await share(answers, background, shareAs);
    } catch (e) {
      keepLocally(answers, background);
      setError(`Couldn't share your result, so it's saved only in this browser for now: ${String(e)}`);
    }
  }

  async function shareLocal(result: LocalResult, name: string) {
    try {
      await share(result.answers, result.background, name);
    } catch (e) {
      setError(`Couldn't share your result: ${String(e)}`);
    }
  }

  function deleteLocal(result: LocalResult) {
    localStore.clear();
    openRegion(regionOf(result));
  }

  async function remove(result: SharedResult) {
    try {
      await request("DELETE", { profileId: profile.id, id: result.id });
      setResults(results.filter((r) => r.id !== result.id));
      openRegion(regionOf(result));
    } catch (e) {
      setError(`Couldn't take your point off the map: ${String(e)}`);
    }
  }

  return (
    <div className={`flex min-h-dvh w-full flex-col gap-4 px-4 py-4 ${quizzing ? "" : "lg:h-dvh"}`}>
      <header className="flex flex-wrap items-center gap-3">
        <div className="rounded-md bg-surface-elevated p-2 text-brand-blue">
          <Compass size={24} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl leading-tight font-bold">AI Compass</h1>
          <p className="text-sm text-text-secondary">
            Map how you build software with AI: how much you hand over, and how much you own.
          </p>
        </div>
        {!quizzing && <Button onClick={() => setQuizzing(true)}>{taken ? "Retake the quiz" : "Take the quiz"}</Button>}
      </header>

      {error && (
        <p role="alert" className="rounded-md border border-brand-pink px-3 py-2 text-sm text-brand-pink">
          {error}
        </p>
      )}

      {quizzing ? (
        <QuizFlow name={profile.name} onFinish={(answers, background, shareAs) => void finishQuiz(answers, background, shareAs)} onQuit={() => setQuizzing(false)} />
      ) : (
        <main className="flex flex-1 flex-col gap-4 lg:min-h-0 lg:flex-row">
          <CompassMap results={results} local={local} stakes={stakes} mine={mine} selection={selection} onSelect={setSelection} />
          {selection.kind === "region" && <RegionDetail region={selection.region} />}
          {selection.kind === "result" && (
            <ResultDetail
              result={selection.result}
              mine={selection.result.person === mine}
              onOpenRegion={openRegion}
              onRemove={() => remove(selection.result)}
            />
          )}
          {selection.kind === "local" && (
            <LocalResultDetail
              key={selection.result.id}
              result={selection.result}
              name={profile.name}
              onOpenRegion={openRegion}
              onShare={(name) => shareLocal(selection.result, name)}
              onDelete={() => deleteLocal(selection.result)}
            />
          )}
        </main>
      )}
    </div>
  );
}
