"use client";

import { useState } from "react";
import type { Action } from "../types";
import { encodeGame, type SharedGame } from "../share";

const BUTTON = "rounded border border-(--bt-line) px-3 py-1 text-sm";

function link(shared: SharedGame): string {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ game: encodeGame(shared) }).toString();
  return url.toString();
}

/** Links that rebuild this game: from its start, or at this position. */
export function SharePanel({
  game,
  actions,
  onRestart,
}: {
  game: SharedGame["game"];
  actions: Action[];
  onRestart: () => void;
}) {
  const [shown, setShown] = useState<{
    label: string;
    url: string;
    copied: boolean | null;
  } | null>(null);
  const show = (label: string, shared: SharedGame) => {
    const url = link(shared);
    setShown({ label, url, copied: null });
    // The browser may refuse the clipboard (permissions, an unfocused page);
    // the link is shown either way, to copy by hand.
    navigator.clipboard.writeText(url).then(
      () => {
        setShown({ label, url, copied: true });
      },
      () => {
        setShown({ label, url, copied: false });
      },
    );
  };
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-xs text-(--bt-muted)">
        Seed {game.seed}
        {game.scenario ? ", from a scenario" : ""}; {actions.length} action
        {actions.length === 1 ? "" : "s"} played.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            show("Link to this game's start", { game, actions: [] });
          }}
        >
          Copy link to the start
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            show("Link to this position", { game, actions });
          }}
        >
          Copy link to this position
        </button>
        <button type="button" className={BUTTON} onClick={onRestart}>
          Restart from the start
        </button>
      </div>
      {shown && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-(--bt-muted)">
            {shown.label}
            {shown.copied === true ? " (copied to the clipboard)" : ""}
            {shown.copied === false ? " (select it and copy)" : ""}:
          </span>
          <input
            readOnly
            className="rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-1 font-mono text-xs"
            value={shown.url}
            onFocus={(e) => {
              e.target.select();
            }}
          />
        </label>
      )}
    </div>
  );
}
