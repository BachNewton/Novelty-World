"use client";

import { RiskOnline, type OnlineGameProps } from "../online/risk-online";
import { GameScreen } from "./game-screen";
import { useOnlineFeed } from "./use-online-feed";

function OnlineGame({ snapshot, act, onLeave }: OnlineGameProps) {
  const feed = useOnlineFeed(snapshot, act);
  return <GameScreen feed={feed} onLeave={onLeave} />;
}

/** Risk online: create a table or join one from the open lobby, with bots in any seat, and play. */
export function Risk() {
  return <RiskOnline Game={OnlineGame} />;
}
