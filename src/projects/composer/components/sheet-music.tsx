"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { EngraveReply, EngraveRequest, Engraved } from "../notation/engrave.worker";
import { buildTimeline, indexAt, scrollAt, soundingBeats, type Timeline } from "../notation/timeline";
import { toneVar } from "../analysis";
import { cursor, position } from "../player";
import { timingOf } from "../tempo";
import type { Score } from "../types";
import { trackLabel } from "./track-legend";

// Sheet music on one endless line that scrolls under a fixed playhead. The
// worker transcribes and engraves; the score is laid out once, and every frame
// only moves it, against the player's clock. That loop is the feature, and it
// ignores reduced motion: here the motion is the view.

const PLAYHEAD_SHARE = 0.25;
const MAX_PLAYHEAD_SHARE = 0.34;
const PLAYHEAD_CLEARANCE = 16;
const MAX_STAFF_PIXELS = 56;
// The least height a staff can read in, gaps included. Below it the least
// important parts are left out rather than shrunk further.
const MIN_ROW_PIXELS = 30;
const INK_MARGIN = 6;
// A phone is for watching: staves go unnamed there, as in `CLAUDE.md`.
const DESKTOP_WIDTH = 768;
const MAX_LABEL_PIXELS = 84;
// In the engraving's own units: past the last glyph's left edge, its width and a gap.
const PIN_MARGIN = 700;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

let worker: Worker | null = null;
let nextJob = 0;
const jobs = new Map<number, { resolve: (engraved: Engraved) => void; reject: (error: Error) => void }>();

function engraveWorker(): Worker {
  if (worker === null) {
    worker = new Worker(new URL("../notation/engrave.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<EngraveReply>) => {
      const job = jobs.get(data.id);
      if (job === undefined) throw new Error(`Composer: an engraving no one asked for (${String(data.id)})`);
      jobs.delete(data.id);
      if ("error" in data) job.reject(new Error(`Composer: engraving failed: ${data.error}`));
      else job.resolve(data);
    };
    worker.onerror = (event) => {
      const error = new Error(`Composer: the engraving worker failed: ${event.message}`);
      for (const job of jobs.values()) job.reject(error);
      jobs.clear();
    };
  }
  return worker;
}

function engrave(score: Score, tracks: number): Promise<Engraved> {
  return new Promise((resolve, reject) => {
    const id = nextJob++;
    jobs.set(id, { resolve, reject });
    const request: EngraveRequest = { id, score, tracks };
    engraveWorker().postMessage(request);
  });
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Composer: the engraving has no ${selector}`);
  return element;
}

function parseSvg(markup: string): SVGSVGElement {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  return requireElement<SVGSVGElement>(holder, "svg");
}

function staffLineYs(staff: Element): number[] {
  return [...staff.querySelectorAll(":scope > path")].slice(0, 5).map((line) => {
    const match = /^M\S+ (\S+)/.exec(line.getAttribute("d") ?? "");
    if (match === null) throw new Error("Composer: a staff line with no position");
    return Number(match[1]);
  });
}

function firstStaves(root: ParentNode): Element[] {
  return [...requireElement(root, "g.measure").querySelectorAll(":scope > g.staff")];
}

function lineStroke(staff: Element): string {
  return requireElement(staff, ":scope > path").getAttribute("stroke-width") ?? "13";
}

function svgElement(name: string, attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function staffLine(y: number, from: number, to: number, staff: Element): SVGElement {
  return svgElement("path", { d: `M${String(from)} ${String(y)} L${String(to)} ${String(y)}`, "stroke-width": lineStroke(staff) });
}

// A key's clefs and signature, lifted from its one-bar engraving and moved onto
// the main engraving's staves, whose gaps depend on the music.
function pinnedGroup(main: SVGSVGElement, header: SVGSVGElement, width: number): SVGElement {
  const group = svgElement("g", {});
  const staves = firstStaves(main);
  firstStaves(header).forEach((staff, index) => {
    const lines = staffLineYs(staves[index]);
    const shift = lines[0] - staffLineYs(staff)[0];
    const placed = svgElement("g", { transform: `translate(0, ${String(shift)})` });
    for (const part of staff.querySelectorAll(":scope > g.clef, :scope > g.keySig, :scope g.layer > g.clef, :scope g.layer > g.keySig")) placed.append(part.cloneNode(true));
    group.append(placed);
    for (const y of lines) group.append(staffLine(y, 0, width, staves[index]));
  });
  return group;
}

function headerWidth(header: SVGSVGElement): number {
  const edges = firstStaves(header).flatMap((staff) => [...staff.querySelectorAll("use")]).map((glyph) => {
    const match = /translate\((-?[\d.]+)/.exec(glyph.getAttribute("transform") ?? "");
    return match === null ? 0 : Number(match[1]);
  });
  return Math.max(...edges);
}

interface Laid {
  stripSvg: SVGSVGElement;
  timeline: Timeline;
  keyTimes: number[];
  meterLeft: number;
  width: number;
  height: number;
  inkTop: number;
  inkHeight: number;
  staffUnits: number;
  pinUnits: number;
  innerWidth: number;
  strip: SVGSVGElement;
  pins: SVGSVGElement[];
}

function byId(root: Element, id: string): Element | null {
  return root.querySelector(`[id="${id}"]`);
}

// Where everything is, measured off the drawn engraving as a share of its width.
function lay(engraved: Engraved, secondsAt: (beats: number) => number, host: HTMLElement, pinHost: HTMLElement): Laid {
  const strip = parseSvg(engraved.svg);
  host.replaceChildren(strip);
  pinHost.replaceChildren();
  const [, , width, height] = (strip.getAttribute("viewBox") ?? "").split(" ").map(Number);
  strip.removeAttribute("width");
  strip.removeAttribute("height");
  strip.style.width = `${String(width)}px`;
  strip.style.height = `${String(height)}px`;

  const inner = requireElement<SVGSVGElement>(strip, "svg.definition-scale");
  const [, , innerWidth, innerHeight] = (inner.getAttribute("viewBox") ?? "").split(" ").map(Number);
  const box = strip.getBoundingClientRect();
  // High notes overflow the page Verovio reports, so the drawn ink decides.
  const ink = requireElement(strip, "g.system").getBoundingClientRect();
  const inkTop = ((ink.top - box.top) / box.height) * height;
  const inkHeight = (ink.height / box.height) * height;
  const xOf = (id: string): number | null => {
    const element = byId(strip, id);
    if (element === null || element.classList.contains("mRest")) return null;
    const mark = element.classList.contains("measure") ? (element.querySelector(".barLine") ?? null) : (element.querySelector(".notehead") ?? element);
    if (mark === null) return null;
    const rect = mark.getBoundingClientRect();
    return (rect.left + (element.classList.contains("measure") ? 0 : rect.width / 2) - box.left) / box.width;
  };

  const meterLeft = (requireElement(strip, "g.meterSig").getBoundingClientRect().left - box.left) / box.width;

  const { timing, ties, timemap, keys, headers } = engraved;
  const timeOf = (quarters: number): number => secondsAt(soundingBeats(timing, quarters));
  const timeline = buildTimeline(timemap, xOf, timeOf, new Map(ties));
  const barQuarters = timemap.filter((entry) => entry.measureOn !== undefined).map((entry) => entry.qstamp ?? 0);
  const keyTimes = keys.map(({ bar }) => timeOf(barQuarters[bar]));

  const parsed = headers.map(({ svg }) => parseSvg(svg));
  const pinInner = Math.max(...parsed.map(headerWidth)) + PIN_MARGIN;
  const defs = requireElement(strip, "defs");
  const known = new Set([...defs.children].map((glyph) => glyph.id.split("-")[0]));
  for (const header of parsed) {
    for (const glyph of requireElement(header, "defs").children) {
      const name = glyph.id.split("-")[0];
      if (!known.has(name)) {
        known.add(name);
        defs.append(glyph.cloneNode(true));
      }
    }
  }
  const stripId = strip.id;
  const margin = requireElement(strip, "g.page-margin").getAttribute("transform") ?? "";
  const pins = keys.map((_, index) => {
    const fifths = keys[index].fifths;
    const header = parsed[headers.findIndex((entry) => entry.fifths === fifths)];
    const pin = svgElement("svg", { viewBox: `0 0 ${String(pinInner)} ${String(innerHeight)}`, overflow: "visible" }) as SVGSVGElement;
    pin.classList.add("definition-scale");
    const page = svgElement("g", { transform: margin });
    page.append(pinnedGroup(strip, header, pinInner));
    for (const grouping of strip.querySelectorAll("g.grpSym, g.system > path")) page.append(grouping.cloneNode(true));
    pin.append(page);
    for (const glyph of pin.querySelectorAll("use")) {
      const href = glyph.getAttribute("xlink:href") ?? "";
      glyph.setAttribute("xlink:href", `${href.split("-")[0]}-${stripId}`);
    }
    return pin;
  });
  pinHost.append(...pins);
  // At the start of a piece the engraving begins short of the pin, so its staff
  // lines are drawn on leftwards, under it.
  inner.setAttribute("overflow", "visible");
  for (const staff of firstStaves(strip)) {
    for (const y of staffLineYs(staff)) staff.append(staffLine(y, -innerWidth, 0, staff));
  }
  // The pin stands in for these, or the piece would open with them twice.
  for (const shown of strip.querySelectorAll("g.grpSym, g.system > path")) shown.setAttribute("visibility", "hidden");
  for (const staff of firstStaves(strip)) {
    for (const shown of staff.querySelectorAll("g.clef, g.keySig")) shown.setAttribute("visibility", "hidden");
  }
  const lines = staffLineYs(firstStaves(strip)[0]);
  return {
    stripSvg: strip,
    timeline,
    keyTimes,
    meterLeft,
    width,
    height,
    inkTop,
    inkHeight,
    staffUnits: ((lines[4] - lines[0]) / innerHeight) * height,
    pinUnits: pinInner,
    innerWidth,
    strip,
    pins,
  };
}

export interface SheetLight {
  notes: ReadonlySet<string> | null;
  tone: number;
}

export function SheetMusic({ score, light, instruments }: { score: Score; light: SheetLight; instruments: Record<string, string> }) {
  const frame = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const [tracks, setTracks] = useState(0);
  const [engraved, setEngraved] = useState<{ score: Score; result: Engraved } | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  if (failure !== null) throw failure;

  // Only how many parts fit decides what is engraved; the rest of a resize is
  // a matter of scale.
  useEffect(() => {
    const target = frame.current;
    if (target === null) return;
    const measure = (): void => setTracks(Math.floor(target.clientHeight / MIN_ROW_PIXELS));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const parts = Math.min(tracks, score.tracks.length);
  useEffect(() => {
    if (parts === 0) return;
    let live = true;
    engrave(score, parts)
      .then((result) => {
        if (live) setEngraved({ score, result });
      })
      .catch((error: unknown) => {
        if (live) setFailure(error instanceof Error ? error : new Error(String(error)));
      });
    return () => {
      live = false;
    };
  }, [score, parts]);

  const ready = engraved !== null && engraved.score === score;
  const result = ready ? engraved.result : null;

  useEffect(() => {
    const [container, host, pinHost, playhead, names] = [frame.current, strip.current, pin.current, line.current, labels.current];
    if (result === null || container === null || host === null || pinHost === null || playhead === null || names === null) return;
    const laid = lay(result, timingOf(score).seconds, host, pinHost);
    let scale = 1;
    let top = 0;
    let lead = 0;
    let shownOffset = NaN;

    const fit = (): void => {
      const { clientWidth, clientHeight } = container;
      scale = Math.min((clientHeight - INK_MARGIN * 2) / laid.inkHeight, MAX_STAFF_PIXELS / laid.staffUnits);
      top = (clientHeight - laid.inkHeight * scale) / 2 - laid.inkTop * scale;
      const labelWidth = clientWidth < DESKTOP_WIDTH ? 0 : MAX_LABEL_PIXELS;
      const pinWidth = laid.pinUnits * scale * (laid.width / laid.innerWidth) + labelWidth;
      // Room for the time signature between the pin and the first note, when
      // a narrow screen doesn't have it at a quarter of the way in.
      const opening = pinWidth + (laid.timeline.x[0] - laid.meterLeft) * laid.width * scale + PLAYHEAD_CLEARANCE / 2;
      lead = Math.max(clientWidth * PLAYHEAD_SHARE, Math.min(opening, clientWidth * MAX_PLAYHEAD_SHARE), pinWidth + PLAYHEAD_CLEARANCE);
      laid.strip.style.width = `${String(laid.width * scale)}px`;
      laid.strip.style.height = `${String(laid.height * scale)}px`;
      pinHost.style.width = `${String(pinWidth)}px`;
      names.style.width = `${String(labelWidth)}px`;
      for (const key of laid.pins) {
        key.style.left = `${String(labelWidth)}px`;
        key.style.width = `${String(pinWidth - labelWidth)}px`;
        key.style.height = `${String(laid.height * scale)}px`;
        key.style.top = `${String(top)}px`;
      }
      host.style.top = `${String(top)}px`;
      shownOffset = NaN;
      playhead.style.left = `${String(lead)}px`;
      // Where the staves landed, read off the drawing.
      const origin = container.getBoundingClientRect().top;
      const staves = firstStaves(laid.stripSvg);
      [...names.children].forEach((name, index) => {
        const staff = staves.at(index);
        if (staff === undefined || !(name instanceof HTMLElement)) return;
        name.style.top = `${String(requireElement(staff, ":scope > path").getBoundingClientRect().top - origin)}px`;
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);

    const { timeline, keyTimes } = laid;
    let lit: Element[] = [];
    let shownMoment = -1;
    let shownKey = -1;
    let request = 0;

    const light = (moment: number): void => {
      if (moment === shownMoment) return;
      shownMoment = moment;
      for (const element of lit) element.classList.remove("sounding");
      lit = moment < 0 ? [] : timeline.sounding[moment].flatMap((id) => byId(laid.strip, id) ?? []);
      for (const element of lit) element.classList.add("sounding");
    };

    const draw = (): void => {
      request = requestAnimationFrame(draw);
      const time = cursor();
      const offset = lead - scrollAt(timeline, time) * laid.width * scale;
      if (offset !== shownOffset) {
        shownOffset = offset;
        host.style.transform = `translate3d(${String(offset)}px, 0, 0)`;
      }
      const key = Math.max(0, indexAt(keyTimes, time));
      if (key !== shownKey) {
        shownKey = key;
        laid.pins.forEach((entry, index) => {
          entry.style.visibility = index === key ? "visible" : "hidden";
        });
      }
      const playing = position();
      light(playing === null ? -1 : indexAt(timeline.moments, playing));
    };
    draw();

    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
    };
  }, [result, score]);

  // Lighting a theme: its notes by place, through the ids they were engraved under.
  useEffect(() => {
    const [container, host] = [frame.current, strip.current];
    if (result === null || container === null || host === null) return;
    const ties = new Map(result.ties);
    const elements: Element[] = [];
    container.classList.toggle("themed", light.notes !== null);
    if (light.notes !== null) {
      const tone = `var(${toneVar(light.tone)})`;
      for (const [key, id] of result.written) {
        if (!light.notes.has(key)) continue;
        for (const each of [id, ...(ties.get(id) ?? [])]) {
          const element = host.querySelector(`[id="${each}"]`);
          if (element !== null) {
            element.classList.add("lit");
            element.setAttribute("style", `--lit: ${tone}`);
            elements.push(element);
          }
        }
      }
    }
    return () => {
      for (const element of elements) element.classList.remove("lit");
    };
  }, [result, light]);

  const staffNames = (result?.staffTracks ?? []).map((name, index, all) => (all[index - 1] === name ? null : name));

  return (
    <div
      ref={frame}
      data-testid="sheet-music"
      role="img"
      aria-label={`Sheet music: ${score.title}`}
      className="relative min-h-0 flex-1 overflow-hidden bg-surface-secondary [&_.definition-scale]:fill-current [&_.definition-scale]:text-text-primary [&.themed_.note]:opacity-30 [&_.lit]:opacity-100! [&_.lit]:fill-(--lit) [&_.lit]:text-(--lit) [&_.sounding]:fill-brand-orange! [&_.sounding]:text-brand-orange! [&_svg_path]:stroke-current"
    >
      <div ref={strip} className="absolute left-0 will-change-transform" />
      <div ref={pin} className="absolute inset-y-0 left-0 bg-surface-secondary [&>svg]:absolute [&>svg]:left-0" />
      <div ref={labels} className="absolute inset-y-0 left-0 overflow-hidden max-md:hidden">
        {staffNames.map((name, index) => (
          <span key={index} className="absolute right-0 left-0.5 flex flex-col text-[10px] leading-[11px] text-text-secondary">
            {name !== null && (
              <>
                <span className="truncate">{trackLabel(name)}</span>
                {instruments[name] !== trackLabel(name) && <span className="truncate text-[9px] leading-[10px] text-text-muted">{instruments[name]}</span>}
              </>
            )}
          </span>
        ))}
      </div>
      <div ref={line} className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-brand-orange opacity-70" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-secondary text-text-secondary">
          <LoaderCircle size={24} className="animate-spin" />
        </div>
      )}
    </div>
  );
}
