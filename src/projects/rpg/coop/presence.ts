/**
 * Presence hook (chunk 1): 12 Hz pos sampler, remote-avatar map, lerp.
 *
 * - Samples `getLocal()` at ~12 Hz + ~1 Hz keepalive; sends `pos` when
 *   dirty (moved >2px or facing/anim changed).
 * - Receives `pos` / `peer-left` via `transport.onMessage`; maintains
 *   `RemoteAvatarMap` with net position + render position (lerped).
 * - Host prunes avatars missing from its guest list; guests rely on the
 *   fanned-out `peer-left`.
 * - Owned transports are destroyed on unmount; injected transports
 *   (e.g. `getSharedCoopTransport`) are caller-owned and only
 *   unsubscribed.
 *
 * No waits/timers: sampler driven by `requestAnimationFrame` loop with
 * timestamp gating. `advanceRemoteRender` does `render += (net-render)
 * * min(1, dt*10)` per the idea doc.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  COOP_HOST_ID,
  type CoopMessage,
  type CoopState,
  type CoopTransport,
  type OutboundMessage,
  type PosPayload,
} from "./types";
import { createCoopTransport } from "./transport";
import {
  type CoopMessageHandler,
  type CoopStateHandler,
} from "./transport";

export const PRESENCE_SEND_INTERVAL_MS = 83;
export const PRESENCE_DIRTY_DIST_PX = 2;
export const PRESENCE_KEEPALIVE_MS = 1000;
export const PRESENCE_LERP_RATE = 10;
export const PRESENCE_STALE_MS = 5000;

export interface RemoteAvatar {
  net: { x: number; y: number };
  renderX: number;
  renderY: number;
  dir: AvatarDir;
  flip: boolean;
  moving: boolean;
  characterId: string;
  lastSeen: number;
}

export type RemoteAvatarMap = Map<string, RemoteAvatar>;

export type AvatarDir = "front" | "side" | "back";

export const DEFAULT_CHARACTER_ID: string = "farmer-bob";

/** Pure gate: should a new position be sent (dirty or keepalive)? Exported for tests. */
export function shouldSendPos(
  lastSent: PosPayload | null,
  lastSentAt: number,
  next: PosPayload,
  now: number,
): boolean {
  if (!lastSent) return true;
  const dx = next.x - lastSent.x;
  const dy = next.y - lastSent.y;
  const moved = dx * dx + dy * dy > PRESENCE_DIRTY_DIST_PX * PRESENCE_DIRTY_DIST_PX;
  const facingChanged =
    next.dir !== lastSent.dir ||
    next.flip !== lastSent.flip ||
    next.moving !== lastSent.moving;
  if (moved || facingChanged) return true;
  // keepalive
  return now - lastSentAt >= PRESENCE_KEEPALIVE_MS;
}

/** Creates a frame-driven sampler for tests: no timers, explicit clock. */
export function createPresenceSampler(
  getLocal: () => PosPayload | null,
  send: (msg: OutboundMessage) => void,
  nowFn: () => number,
) {
  let lastSent: PosPayload | null = null;
  let lastSentAt = 0;
  return {
    sample() {
      const now = nowFn();
      const next = getLocal();
      if (!next) return;
      if (shouldSendPos(lastSent, lastSentAt, next, now)) {
        const msg: OutboundMessage = {
          kind: "pos",
          pos: {
            x: next.x,
            y: next.y,
            dir: next.dir,
            flip: next.flip,
            moving: next.moving,
            characterId: next.characterId,
            timestamp: now,
          },
        };
        send(msg);
        lastSent = { ...next };
        lastSentAt = now;
      }
    },
  };
}

/** One lerp step for a remote avatar's render position. */
export function advanceRemoteRender(
  avatar: RemoteAvatar,
  dtSeconds: number,
  rate: number = PRESENCE_LERP_RATE,
): void {
  const k = Math.min(1, Math.max(0, dtSeconds) * rate);
  avatar.renderX += (avatar.net.x - avatar.renderX) * k;
  avatar.renderY += (avatar.net.y - avatar.renderY) * k;
}

/** Apply an inbound presence message (`pos` or `peer-left`). */
export function applyPresenceMessage(
  remotes: RemoteAvatarMap,
  msg: CoopMessage,
  selfId: string | null,
): boolean {
  if (msg.kind !== "pos") return false;
  if (msg.from === selfId) return false;
  const now = Date.now();
  const characterId = msg.pos.characterId ?? DEFAULT_CHARACTER_ID;
  let avatar = remotes.get(msg.from);
  if (!avatar) {
    avatar = {
      net: { x: msg.pos.x, y: msg.pos.y },
      renderX: msg.pos.x,
      renderY: msg.pos.y,
      dir: msg.pos.dir,
      flip: msg.pos.flip,
      moving: msg.pos.moving,
      characterId,
      lastSeen: now,
    };
    remotes.set(msg.from, avatar);
  } else {
    avatar.net.x = msg.pos.x;
    avatar.net.y = msg.pos.y;
    avatar.dir = msg.pos.dir;
    avatar.flip = msg.pos.flip;
    avatar.moving = msg.pos.moving;
    avatar.characterId = characterId;
    avatar.lastSeen = now;
  }
  return true;
}

/**
 * Drop avatars whose peers are gone from the host's guest list. Guests see
 * only `[hostId]` in `peers` (star topology: other guests arrive via host
 * rebroadcast), so pruning applies to the host role only — guests rely on
 * the fanned-out `peer-left`.
 */
export function prunePresenceRemotes(
  remotes: RemoteAvatarMap,
  state: CoopState,
): boolean {
  if (state.role !== "host") return false;
  const live = new Set(state.peers);
  let changed = false;
  for (const id of remotes.keys()) {
    if (id !== state.peerId && !live.has(id)) {
      remotes.delete(id);
      changed = true;
    }
  }
  return changed;
}

export interface PresenceOptions {
  /** Default creates + owns a per-mount transport; an injected factory's
   * transport is caller-owned (shared singleton or test fake) and is never
   * destroyed on unmount — only unsubscribed. */
  createTransport?: () => CoopTransport;
  autoStart?: boolean;
}

export interface Presence {
  /** Live remote-avatar map, mutated by message handlers and the render
   * pass. A ref (not state) so 12 Hz net traffic never re-renders React. */
  remotesRef: { current: RemoteAvatarMap };
  /** Transport role/status for indicators. */
  state: CoopState;
}

/**
 * Sample `getLocal` at ~12 Hz and send dirty `pos` (+ ~1 Hz `pos`
 * keepalive), maintaining the remote map. Owns the transport by default;
 * pass `createTransport` (e.g. `getSharedCoopTransport`) to share one
 * transport with the map-sync bindings — one PeerJS peer per tab.
 * Pass no getter for receive-only use (e.g. the map editor overlay).
 */
export function usePresence(
  getLocal: (() => PosPayload | null) | undefined,
  options: PresenceOptions = {},
): Presence {
  const { createTransport, autoStart = true } = options;

  const getterRef = useRef(getLocal);
  getterRef.current = getLocal;

  const [owned] = useState(() => createTransport === undefined);
  const [transport] = useState<CoopTransport>(() =>
    createTransport?.() ?? createCoopTransport()
  );

  const remotesRef = useRef<RemoteAvatarMap>(new Map());
  const selfIdRef = useRef<string | null>(null);
  const [state, setState] = useState<CoopState>(() => transport.getState());

  useEffect(() => {
    const offMessage = transport.onMessage((msg) => {
      applyPresenceMessage(remotesRef.current, msg, selfIdRef.current);
    });
    const offState = transport.onStateChange((next) => {
      selfIdRef.current = next.peerId;
      prunePresenceRemotes(remotesRef.current, next);
      setState(next);
    });
    selfIdRef.current = transport.getState().peerId;
    if (autoStart) transport.start();
    return () => {
      offMessage();
      offState();
      if (owned) transport.destroy();
    };
  }, [autoStart, owned, transport]);

  useEffect(() => {
    if (getLocal === undefined) return;
    let lastSent: PosPayload | null = null;
    let lastSentAt = 0;
    let rafId = 0;
    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      // Stale-peer fallback: despawn remotes that haven't sent pos in PRESENCE_STALE_MS.
      // Frame-driven, not timer-based.
      for (const [id, avatar] of remotesRef.current.entries()) {
        if (now - avatar.lastSeen > PRESENCE_STALE_MS) {
          remotesRef.current.delete(id);
        }
      }
      if (!getterRef.current) return;
      const next = getterRef.current();
      if (next === undefined || next === null) return;
      if (shouldSendPos(lastSent, lastSentAt, next, now)) {
        const msg: OutboundMessage = {
          kind: "pos",
          pos: {
            x: next.x,
            y: next.y,
            dir: next.dir,
            flip: next.flip,
            moving: next.moving,
            characterId: next.characterId,
            timestamp: now,
          },
        };
        transport.send(msg);
        lastSent = { ...next };
        lastSentAt = now;
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [getLocal, transport]);

  return { remotesRef, state };
}