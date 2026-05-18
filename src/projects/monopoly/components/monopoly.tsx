"use client";

import { useMonopolyDebugKeys } from "../dev";
import { useMonopolyStore } from "../store";
import { MONOPOLY_THEME } from "../theme";
import { Footer } from "./footer";
import { Header } from "./header";
import { Squares } from "./squares";

export function Monopoly() {
  useMonopolyDebugKeys();
  const state = useMonopolyStore((s) => s.state);

  return (
    <div
      className="flex h-[100dvh] w-full flex-col overflow-hidden"
      style={{ ...MONOPOLY_THEME, backgroundColor: "var(--mono-frame)" }}
    >
      <Header state={state} />
      <Squares state={state} />
      <Footer state={state} />
    </div>
  );
}
