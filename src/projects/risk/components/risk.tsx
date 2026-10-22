"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { RiskOnline, type OnlineGameProps } from "../online/risk-online";
import { GameScreen } from "./game-screen";
import { useOnlineFeed } from "./use-online-feed";

const RiskSoundLab = dynamic(() => import("./sound-lab").then((m) => m.RiskSoundLab), { ssr: false });
const RiskInsigniaLab = dynamic(() => import("./insignia-lab").then((m) => m.RiskInsigniaLab), { ssr: false });

function OnlineGame({ snapshot, act, onLeave }: OnlineGameProps) {
  const feed = useOnlineFeed(snapshot, act);
  return <GameScreen feed={feed} onLeave={onLeave} />;
}

const subscribeToNothing = () => () => {};
function pageOf() {
  const search = new URLSearchParams(window.location.search);
  if (search.has("sounds")) return "sounds";
  if (search.has("insignia")) return "insignia";
  return "game";
}

/** Risk online: create a table or join one from the open lobby, with bots in any seat, and play.
 *  `?sounds` opens the sound audition instead, and `?insignia` the ranks' insignia. Which it is is known only in the browser, and the
 *  server renders neither, so the audition never mounts the lobby, which goes online. */
export function Risk() {
  const page = useSyncExternalStore(subscribeToNothing, pageOf, () => null);
  if (page === null) return null;
  if (page === "sounds") return <RiskSoundLab />;
  if (page === "insignia") return <RiskInsigniaLab />;
  return <RiskOnline Game={OnlineGame} />;
}
