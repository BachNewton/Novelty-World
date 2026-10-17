"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { hearthwoodView } from "../view";

const ValleyView = dynamic(() => import("./valley/valley-view").then((m) => m.ValleyView), { ssr: false });
const CatPreview = dynamic(() => import("./cats/cat-preview").then((m) => m.CatPreview), { ssr: false });

function subscribeToNothing(): () => void {
  return () => undefined;
}

// The server render has no URL, so it renders nothing and the page picks its
// view after hydrating.
export function Hearthwood() {
  const view = useSyncExternalStore(subscribeToNothing, () => hearthwoodView(window.location.search), () => null);
  switch (view) {
    case null:
      return null;
    case "valley":
      return <ValleyView />;
    case "cats":
      return <CatPreview />;
  }
}
