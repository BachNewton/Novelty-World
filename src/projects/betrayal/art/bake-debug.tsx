"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Pass } from "./bake";
import type { BakeScheduler, BakeTrace, ChunkRecord } from "./bake-schedule";

/*
 * The bake's debug view (`?bake-debug`): the worker pool live, one lane per
 * worker with the chunks it ran over the current or last batch, coloured by
 * pass (and the finishing of each pass's light), each naming its room when
 * there is room to and on hover always; under them the main thread's long
 * tasks on the same clock, then each room in the order its work began; the
 * queue, the rate and each pass's time. A chunk's time runs from its sending
 * to the page taking its result, so it takes in the page's thread being busy
 * as well as the worker's. Off, it is not mounted and the scheduler keeps no
 * trace.
 */

const PASS_COLOUR: Record<Pass, string> = { direct: "bg-(--bt-door)", bounce: "bg-(--bt-accent)" };
/** Long tasks the view keeps: enough to cover a first load's. */
const LONG_TASKS = 64;

interface LongTask {
  start: number;
  ms: number;
}

/** Whether the page asks for the bake's debug view. */
function asked(): boolean {
  return new URLSearchParams(window.location.search).has("bake-debug");
}

export function BakeDebug({ bakes }: { bakes: BakeScheduler }) {
  const [on] = useState(asked);
  return on ? <BakeDebugPanel bakes={bakes} /> : null;
}

function chunkTitle(chunk: ChunkRecord, now: number): string {
  const ms = (chunk.end ?? now) - chunk.start;
  const what = chunk.step === "finish" ? "finishing its light" : `${chunk.samples} samples`;
  return `${chunk.room} (${chunk.floor}) · ${chunk.pass} · ${what} · ${ms.toFixed(0)} ms sent to landed${chunk.end === null ? " · running" : ""}${chunk.stale ? " · stale, thrown away" : ""}`;
}

/** Where a span sits on the batch's timeline, as shares of it. */
function bar(start: number, end: number, batch: { start: number }, span: number) {
  const left = (Math.max(start, batch.start) - batch.start) / span;
  const width = Math.max(0.004, (end - Math.max(start, batch.start)) / span);
  return { width, style: { left: `${left * 100}%`, width: `${width * 100}%` } };
}

interface RoomWork {
  room: string;
  floor: string;
  /** Chunks gathered, per pass. */
  chunks: Partial<Record<Pass, number>>;
  stale: number;
  /** Its chunks' time, sent to landed, summed over lanes. */
  ms: number;
  first: number;
  last: number;
}

/** Each room's work in the batch, in the order it began. */
function roomsOf(chunks: ChunkRecord[], now: number): RoomWork[] {
  const rooms = new Map<string, RoomWork>();
  for (const chunk of chunks) {
    const key = `${chunk.floor}/${chunk.room}`;
    const end = chunk.end ?? now;
    const work = rooms.get(key) ?? { room: chunk.room, floor: chunk.floor, chunks: {}, stale: 0, ms: 0, first: chunk.start, last: end };
    rooms.set(key, work);
    if (chunk.step === "gather") work.chunks[chunk.pass] = (work.chunks[chunk.pass] ?? 0) + 1;
    if (chunk.stale) work.stale++;
    work.ms += end - chunk.start;
    work.first = Math.min(work.first, chunk.start);
    work.last = Math.max(work.last, end);
  }
  return [...rooms.values()].sort((a, b) => a.first - b.first);
}

function Lanes({ trace, chunks, longTasks, now }: { trace: BakeTrace; chunks: ChunkRecord[]; longTasks: LongTask[]; now: number }) {
  const batch = trace.batch;
  if (!batch) return <p>No bake yet.</p>;
  const end = batch.end ?? now;
  const span = Math.max(1, end - batch.start);
  return (
    // Takes the pointer, unlike the rest of the panel, so each bar names its room on hover.
    <div className="pointer-events-auto flex flex-col gap-px">
      {Array.from({ length: trace.lanes }, (_, lane) => (
        <div key={lane} className="flex items-center gap-1">
          <span className="w-4 shrink-0 text-right">{lane}</span>
          <div className="relative h-3 flex-1 overflow-hidden bg-(--bt-room)">
            {chunks
              .filter((chunk) => chunk.lane === lane)
              .map((chunk) => {
                const { width, style } = bar(chunk.start, chunk.end ?? now, batch, span);
                return (
                  <span
                    key={`${chunk.start}:${chunk.room}`}
                    title={chunkTitle(chunk, now)}
                    className={`absolute inset-y-0 overflow-hidden border-r border-(--bt-bg) px-px text-[8px] leading-3 whitespace-nowrap text-(--bt-bg) ${chunk.stale ? "bg-(--bt-danger)" : chunk.step === "finish" ? "bg-(--bt-ink)" : PASS_COLOUR[chunk.pass]} ${chunk.end === null ? "animate-pulse" : ""}`}
                    style={style}
                  >
                    {width > 0.08 ? chunk.room : ""}
                  </span>
                );
              })}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-1" title="The page's own thread: no chunk lands while it is busy">
        <span className="w-4 shrink-0 text-right">p</span>
        <div className="relative h-2 flex-1 overflow-hidden bg-(--bt-room)">
          {longTasks
            .filter((task) => task.start + task.ms >= batch.start)
            .map((task) => (
              <span key={task.start} title={`page busy ${task.ms.toFixed(0)} ms`} className="absolute inset-y-0 bg-(--bt-muted)" style={bar(task.start, task.start + task.ms, batch, span).style} />
            ))}
        </div>
      </div>
      <div className="flex justify-between pl-5 text-(--bt-muted)">
        <span>0</span>
        <span>
          {(span / 1000).toFixed(2)} s{batch.end === null ? " (running)" : ""}
        </span>
      </div>
    </div>
  );
}

function BakeDebugPanel({ bakes }: { bakes: BakeScheduler }) {
  // Asked for once, so the scheduler keeps a trace only while this view is open.
  const [trace] = useState(() => bakes.trace());
  const status = useSyncExternalStore(bakes.subscribe, bakes.status, bakes.status);
  /** When the scheduler last changed: the timeline is drawn up to then, and every chunk landing moves it on. */
  const [now, setNow] = useState(() => trace.batch?.end ?? trace.batch?.start ?? 0);
  useEffect(
    () =>
      bakes.subscribe(() => {
        setNow(performance.now());
      }),
    [bakes],
  );
  const [longTasks, setLongTasks] = useState<LongTask[]>([]);
  useEffect(() => {
    if (!PerformanceObserver.supportedEntryTypes.includes("longtask")) return;
    const observer = new PerformanceObserver((list) => {
      const fresh = list.getEntries().map((entry) => ({ start: entry.startTime, ms: entry.duration }));
      setLongTasks((old) => [...old, ...fresh].slice(-LONG_TASKS));
    });
    observer.observe({ type: "longtask", buffered: true });
    return () => {
      observer.disconnect();
    };
  }, []);
  const batch = trace.batch;
  const seconds = batch ? Math.max(0.001, ((batch.end ?? now) - batch.start) / 1000) : 0;
  const rate = batch ? batch.samples / seconds / 1000 : 0;
  const inBatch = longTasks.filter((task) => batch !== null && task.start + task.ms >= batch.start);
  const chunks = batch ? trace.chunks.filter((chunk) => (chunk.end ?? now) >= batch.start) : [];
  const since = (at: number) => ((at - (batch?.start ?? 0)) / 1000).toFixed(2);
  const applies = trace.applies.filter((apply) => batch !== null && apply.at >= batch.start);
  const slowest = applies.reduce<(typeof applies)[number] | null>((most, apply) => (most === null || apply.ms > most.ms ? apply : most), null);
  return (
    <section
      aria-label="Bake debug"
      className="pointer-events-none absolute top-1/2 left-2 z-10 flex w-[min(28rem,calc(100%-1rem))] -translate-y-1/2 flex-col gap-1 rounded border border-(--bt-line) bg-(--bt-panel) p-2 font-mono text-[10px] leading-tight text-(--bt-ink)"
    >
      <p>
        bake · {bakes.lanes() || trace.lanes} workers · queue {bakes.queued()} · {rate.toFixed(0)}k samples/s · {status.pending ? `${status.done}/${status.total} samples` : "idle"}
      </p>
      <p className="flex gap-2 text-(--bt-muted)">
        {(Object.keys(PASS_COLOUR) as Pass[]).map((pass) => (
          <span key={pass} className="flex items-center gap-1">
            <span className={`inline-block size-2 ${PASS_COLOUR[pass]}`} />
            {pass}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 bg-(--bt-ink)" />
          finish
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 bg-(--bt-danger)" />
          stale
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 bg-(--bt-muted)" />
          page busy (p)
        </span>
      </p>
      <Lanes trace={trace} chunks={chunks} longTasks={longTasks} now={now} />
      <p className="text-(--bt-muted)">rooms in the order begun · chunks · their time sent to landed · from–to</p>
      <ol>
        {roomsOf(chunks, now).map((work) => (
          <li key={`${work.floor}/${work.room}`} className={work.stale > 0 ? "text-(--bt-danger)" : ""}>
            {work.room} ({work.floor}) · {(Object.entries(work.chunks) as [Pass, number][]).map(([pass, count]) => `${count} ${pass}`).join(" + ")} · {(work.ms / 1000).toFixed(1)} s · {since(work.first)}–{since(work.last)} s
            {work.stale > 0 && ` · ${work.stale} stale`}
          </li>
        ))}
      </ol>
      {(Object.entries(trace.passes) as [Pass, NonNullable<BakeTrace["passes"][Pass]>][]).map(([pass, info]) => (
        <p key={pass}>
          {pass}: {(info.samples / 1000).toFixed(0)}k samples · {(info.busyMs / 1000).toFixed(2)} s on lanes · {((info.last - info.first) / 1000).toFixed(2)} s from first to last
        </p>
      ))}
      <p>
        shown on the main thread: {applies.length} passes, {applies.reduce((sum, apply) => sum + apply.ms, 0).toFixed(0)} ms in all
        {slowest && `, longest ${slowest.ms.toFixed(0)} ms (${slowest.room} ${slowest.pass})`}
      </p>
      <p className={inBatch.length > 0 ? "text-(--bt-danger)" : "text-(--bt-muted)"}>
        main-thread long tasks this batch: {inBatch.length}
        {inBatch.length > 0 && ` (${inBatch.reduce((sum, task) => sum + task.ms, 0).toFixed(0)} ms in all, longest ${Math.max(...inBatch.map((task) => task.ms)).toFixed(0)} ms)`}
      </p>
    </section>
  );
}
