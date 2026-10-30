"use client";

/**
 * What the audio and the page did, kept in this browser, to find why playback stops on a locked Android phone
 * (ideas/lock-screen-stop.md). It goes once that's found.
 */

const KEY = "nw:audiobook:playback-log";
const KEEP = 400;

interface Entry {
  at: string;
  event: string;
  detail?: string;
  position?: number;
  buffered?: number;
  readyState?: number;
  networkState?: number;
  error?: string;
  source?: "download" | "stream";
  visibility: DocumentVisibilityState;
  online: boolean;
}

function read(): Entry[] {
  return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Entry[];
}

function describe(audio: HTMLAudioElement) {
  const { buffered } = audio;
  return {
    position: Math.round(audio.currentTime * 10) / 10,
    buffered: buffered.length === 0 ? 0 : Math.round(buffered.end(buffered.length - 1) * 10) / 10,
    readyState: audio.readyState,
    networkState: audio.networkState,
    ...(audio.error ? { error: `${String(audio.error.code)} ${audio.error.message}` } : {}),
    source: audio.currentSrc.startsWith("blob:") ? ("download" as const) : ("stream" as const),
  };
}

export function logPlayback(event: string, audio: HTMLAudioElement | null, detail?: string) {
  const entry: Entry = {
    at: new Date().toISOString(),
    event,
    ...(detail === undefined ? {} : { detail }),
    ...(audio ? describe(audio) : {}),
    visibility: document.visibilityState,
    online: navigator.onLine,
  };
  localStorage.setItem(KEY, JSON.stringify([...read(), entry].slice(-KEEP)));
}

export function playbackLogText(): string {
  return JSON.stringify(read(), null, 1);
}
