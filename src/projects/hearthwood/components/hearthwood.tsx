"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { hearthwoodView } from "../view";

const WorldView = dynamic(() => import("./valley/world-view").then((m) => m.WorldView), { ssr: false });
const CatPreview = dynamic(() => import("./cats/cat-preview").then((m) => m.CatPreview), { ssr: false });
const ArtGallery = dynamic(() => import("./gallery/art-gallery").then((m) => m.ArtGallery), { ssr: false });

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
    case "world":
      return <WorldView />;
    case "cats":
      return <CatPreview />;
    case "art":
      return <ArtGallery />;
  }
}
