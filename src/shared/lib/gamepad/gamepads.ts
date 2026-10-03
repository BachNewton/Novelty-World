"use client";

import { buttonEdges, snapshotChanged, snapshotOf, type ButtonEdge, type PadSnapshot } from "./state";

export interface GamepadListener {
  /** Every animation frame while a pad is connected, with every connected pad
   *  by index. `changed` is false when no button or axis moved since the last
   *  frame, so a UI can skip re-rendering. */
  onFrame?: (pads: readonly PadSnapshot[], changed: boolean) => void;
  /** Each press and release, in the frame it's first seen. A pad that
   *  disconnects releases whatever it was holding. */
  onButton?: (edge: ButtonEdge) => void;
  /** A pad connected or disconnected, with the pads now connected. */
  onConnectionChange?: (pads: readonly PadSnapshot[]) => void;
}

export type GamepadSupport = "supported" | "insecure-context" | "unsupported";

/** Browsers hide the Gamepad API outside a secure context (https or
 *  localhost), so a phone opening the dev server by LAN IP over http sees
 *  none of it. */
export function gamepadSupport(): GamepadSupport {
  if (!window.isSecureContext) return "insecure-context";
  return "getGamepads" in navigator ? "supported" : "unsupported";
}

const listeners = new Set<GamepadListener>();
/** Slots with a pad in them, from the connection events. */
const connected = new Set<number>();
/** Each pad as the last frame saw it, to find what changed since. */
const lastSeen = new Map<number, PadSnapshot>();
let frame: number | null = null;

function connectedPads(): PadSnapshot[] {
  return navigator
    .getGamepads()
    .filter((pad): pad is Gamepad => pad !== null && connected.has(pad.index))
    .map(snapshotOf)
    .sort((a, b) => a.index - b.index);
}

// Buttons and sticks fire no events in the Gamepad API: reading the pads once
// per animation frame is the only way to see them, so this loop is the input
// feature itself. It runs only while someone listens and a pad is connected.
function tick(): void {
  frame = requestAnimationFrame(tick);
  const pads = connectedPads();
  let changed = false;
  const edges: ButtonEdge[] = [];
  for (const pad of pads) {
    const prev = lastSeen.get(pad.index) ?? null;
    if (!snapshotChanged(prev, pad)) continue;
    changed = true;
    edges.push(...buttonEdges(prev, pad));
    lastSeen.set(pad.index, pad);
  }
  for (const listener of listeners) {
    for (const edge of edges) listener.onButton?.(edge);
    listener.onFrame?.(pads, changed);
  }
}

function updateLoop(): void {
  const shouldRun = listeners.size > 0 && connected.size > 0;
  if (shouldRun && frame === null) frame = requestAnimationFrame(tick);
  if (!shouldRun && frame !== null) {
    cancelAnimationFrame(frame);
    frame = null;
  }
}

function announceConnections(edges: readonly ButtonEdge[] = []): void {
  const pads = connectedPads();
  for (const listener of listeners) {
    for (const edge of edges) listener.onButton?.(edge);
    listener.onConnectionChange?.(pads);
  }
  updateLoop();
}

// The pad's first frame finds no last-seen state, so the press that woke it
// counts as a press.
function onConnected(event: GamepadEvent): void {
  connected.add(event.gamepad.index);
  announceConnections();
}

function onDisconnected(event: GamepadEvent): void {
  const index = event.gamepad.index;
  connected.delete(index);
  const prev = lastSeen.get(index) ?? null;
  lastSeen.delete(index);
  announceConnections(buttonEdges(prev, null));
}

/** Listens to every connected pad. Returns the unsubscribe. A pad only
 *  appears once a button is pressed on it while the page is visible: the
 *  browser hides pads from pages the player hasn't touched them on. */
export function subscribeGamepads(listener: GamepadListener): () => void {
  if (gamepadSupport() !== "supported") return () => {};
  if (listeners.size === 0) {
    window.addEventListener("gamepadconnected", onConnected);
    window.addEventListener("gamepaddisconnected", onDisconnected);
    // Pads already exposed to this page announced themselves before anyone listened.
    for (const pad of navigator.getGamepads()) if (pad) connected.add(pad.index);
  }
  listeners.add(listener);
  if (connected.size > 0) listener.onConnectionChange?.(connectedPads());
  updateLoop();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("gamepadconnected", onConnected);
      window.removeEventListener("gamepaddisconnected", onDisconnected);
      connected.clear();
      lastSeen.clear();
    }
    updateLoop();
  };
}

export interface RumbleOptions {
  /** Milliseconds. */
  duration?: number;
  /** The heavy, low-frequency motor, 0 to 1. */
  strong?: number;
  /** The light, high-frequency motor, 0 to 1. */
  weak?: number;
}

/** "complete" and "preempted" (cut short by a newer effect) come from the
 *  browser; the rest say why nothing played. */
export type RumbleResult = "complete" | "preempted" | "unsupported" | "no-pad";

// lib.dom types `vibrationActuator` as always present, but Firefox has none
// and some browsers' actuators can't play "dual-rumble", so the pad is read
// through this honest shape instead.
interface RumbleSource {
  vibrationActuator?: {
    effects?: readonly string[];
    playEffect?: (type: "dual-rumble", params: GamepadEffectParameters) => Promise<"complete" | "preempted">;
  } | null;
}

function rumbleActuator(index: number) {
  const pad: RumbleSource | undefined = readPadByIndex(index);
  const actuator = pad?.vibrationActuator;
  if (!actuator?.playEffect) return null;
  if (actuator.effects && !actuator.effects.includes("dual-rumble")) return null;
  return { playEffect: actuator.playEffect.bind(actuator) };
}

function readPadByIndex(index: number): Gamepad | undefined {
  if (gamepadSupport() !== "supported") return undefined;
  return navigator.getGamepads().find((pad) => pad?.index === index) ?? undefined;
}

/** Whether the pad in this slot can rumble in this browser. */
export function canRumble(index: number): boolean {
  return rumbleActuator(index) !== null;
}

export async function rumble(index: number, { duration = 200, strong = 1, weak = 1 }: RumbleOptions = {}): Promise<RumbleResult> {
  if (!readPadByIndex(index)) return "no-pad";
  const actuator = rumbleActuator(index);
  if (!actuator) return "unsupported";
  return actuator.playEffect("dual-rumble", { duration, strongMagnitude: strong, weakMagnitude: weak });
}
