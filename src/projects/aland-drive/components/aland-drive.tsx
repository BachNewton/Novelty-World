"use client";

import { useEffect, useRef, useState } from "react";
import type { InputKind } from "@/shared/lib/input";
import { controlFor, Prompt } from "@/shared/components/prompts";
import { useFrameStats } from "@/shared/lib/three/frame-stats";
import { Crosshair, Flag, Gauge, Hourglass, Landmark, LogOut, Repeat, Timer, Trophy, MapPin, MapPinOff, Moon, Thermometer, Sun, Target, UserCheck, UserPlus, UserX, Users, X } from "lucide-react";
import { useProfile } from "@/shared/lib/profile";
import { onlineRelay, worldCodeFromSearch } from "../net/protocol";
import { DevMenu } from "./dev-menu";
import { MONTH_NAMES } from "../time/calendar";
import { GameMenu, raceColour } from "./game-menu";
import type { GameMenu as GameMenuState } from "../render/game-menu";
import { BINDINGS } from "../input/controls";
import type { Place } from "../map/places";
import type { CameraMode, ChallengeOffer, CoopNoticeReading, CoopReading, Game, GameProbe, HudReading, LoadingProgress, Progress } from "../render/game";
import { placeText, resultText, timeText } from "../challenge/format";
import { clockText as hourText, distanceText, speedNumber, speedUnit, temperatureText, useUnits } from "../units";
import type { ChallengeKind } from "../challenge/types";
import { DealershipHud } from "../dealership/hud";
import type { DealershipReading } from "../dealership/walk-in";

/*
 * The page round the world: the canvas the game draws into, and the UI over it.
 * The game itself runs outside React (`render/game.ts`), and the page only
 * starts it and stops it. The speed changes every frame, so it's written
 * straight to its elements rather than rendered.
 */

declare global {
  interface Window {
    __alandDrive?: GameProbe;
  }
}

// The game's own UI colours, declared with its other tokens outside Tailwind's theme.
const INK = "var(--color-aland-drive-ui-ink)";
const SHADE = "var(--color-aland-drive-ui-shade)";
const ACCENT = "var(--color-aland-drive-ui-accent)";
const REDLINE = "var(--color-aland-drive-ui-redline)";
const PLAYER = "var(--color-aland-drive-ui-player)";
const PLACE = "var(--color-aland-drive-ui-place)";
const CHALLENGE = "var(--color-aland-drive-ui-challenge)";
const PASS = "var(--color-aland-drive-ui-pass)";
const GOLD = "var(--color-aland-drive-ui-gold)";
const LIGHTS = 3;

/** How much of its circle the rev dial covers, leaving the gap at the bottom that holds the gear. */
const DIAL_SWEEP = 0.75;
/** Where the rev dial's red begins, as a share of the dial. */
const REDLINE_FROM = 0.9;

const MAP_HINTS = [
  { binding: BINDINGS.mapPick, icon: Crosshair, label: "Set destination" },
  { binding: BINDINGS.mapClear, icon: MapPinOff, label: "Clear route" },
  { binding: BINDINGS.mapClose, icon: X, label: "Close map" },
];

const ROAD_LABEL_FADE = "@keyframes aland-road-label { 0% { opacity: 0 } 12% { opacity: 1 } 75% { opacity: 1 } 100% { opacity: 0 } }";
/** Long enough to read a place's note at an easy pace while driving. */
const PLACE_CARD_S = 12;
const NOTICE_S = 5;
const NOTICE_LOOKS = {
  left: { icon: LogOut, label: "Left the challenge" },
  withdrawn: { icon: UserX, label: "Invite off" },
  expired: { icon: UserX, label: "Invite off" },
  taken: { icon: UserCheck, label: "Someone joined first" },
  destination: { icon: MapPin, label: "Set the destination" },
  cleared: { icon: MapPinOff, label: "Cleared the destination" },
} as const;

const TIME_COVER = "@keyframes aland-time-cover { from { opacity: 0 } to { opacity: 1 } }";
const TIME_COVER_S = 0.4;

/** Covers the view while the page takes the online world's time, so the sky doesn't jump in sight: a fade out, the jump, a fade back in. */
function TimeCover({ jump, onDone }: { jump: () => void; onDone: () => void }) {
  const [covered, setCovered] = useState(false);
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: SHADE, animation: `aland-time-cover ${TIME_COVER_S}s ease-in-out ${covered ? "reverse" : "normal"} forwards` }}
      key={covered ? "uncover" : "cover"}
      onAnimationEnd={() => {
        if (covered) {
          onDone();
          return;
        }
        jump();
        setCovered(true);
      }}
    />
  );
}

/** A co-op partner left, an invite was taken back, someone else joined it first, or another player set or cleared the destination: who, and an icon for what. */
function CoopNotice({ notice, onDone }: { notice: CoopNoticeReading; onDone: () => void }) {
  const { icon: Icon, label } = NOTICE_LOOKS[notice.kind];
  return (
    <div className="pointer-events-none absolute top-40 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg px-3 py-2 text-lg font-semibold" style={{ color: INK, background: SHADE, border: `2px solid ${PLAYER}`, animation: `aland-road-label ${NOTICE_S}s ease-out forwards` }} role="status" aria-label="Co-op notice" title={label} onAnimationEnd={onDone}>
      <Users className="size-5 shrink-0" style={{ color: PLAYER }} aria-hidden />
      <span>{notice.name}</span>
      <Icon className="size-5 shrink-0" aria-label={label} />
      {notice.partner !== undefined && <span aria-label="Joined by">{notice.partner}</span>}
    </div>
  );
}

const GPU_LOST = "Åland Drive Unlimited lost the graphics card, so the drive has stopped. Reloading the page starts it again.";
const mapLost = (reason: string) => `Åland Drive Unlimited lost part of the map: ${reason}`;

/** The drive, in the online world unless `solo` or the page is a tool's (`onlineRelay`). A lab hears of the game once it's started. */
export function AlandDrive({ solo = false, onStarted }: { solo?: boolean; onStarted?: (probe: GameProbe) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const speedText = useRef<HTMLSpanElement>(null);
  const gearText = useRef<HTMLSpanElement>(null);
  const revArc = useRef<SVGCircleElement>(null);
  const revNeedle = useRef<SVGLineElement>(null);
  const miniMap = useRef<HTMLCanvasElement>(null);
  const monthShown = useRef<HTMLSpanElement>(null);
  const hourShown = useRef<HTMLSpanElement>(null);
  const sunIcon = useRef<SVGSVGElement>(null);
  const moonIcon = useRef<SVGSVGElement>(null);
  const temperatureRow = useRef<HTMLSpanElement>(null);
  const temperatureShown = useRef<HTMLSpanElement>(null);
  const worldMap = useRef<HTMLCanvasElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const cueText = useRef<HTMLSpanElement>(null);
  const [noWebGpu, setNoWebGpu] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState<InputKind>("keyboard-mouse");
  const units = useUnits((state) => state.units);
  const [camera, setCamera] = useState<CameraMode>("chase");
  const [loading, setLoading] = useState<LoadingProgress | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [road, setRoad] = useState<{ name: string; seen: number } | null>(null);
  const [dev, setDev] = useState<Pick<Game, "trafficOn" | "setTraffic" | "condition" | "setCondition" | "day" | "setDay" | "weather" | "setWeather" | "setDevMenuOpen" | "pickMenuItem" | "spots" | "jumpTo" | "hasDestination" | "jumpToDestination" | "whereabouts" | "resetSave"> | null>(null);
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const [gameMenu, setGameMenu] = useState<GameMenuState | null>(null);
  const [others, setOthers] = useState<string[]>([]);
  // Places found and not yet shown, the one on screen first.
  const [finds, setFinds] = useState<Place[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  // What the challenge panel shows that holds still through a run; the clock, lights and gates change every frame, so they're written straight to their elements.
  const [playing, setPlaying] = useState<{ title: string; kind: ChallengeKind; target: number | null; partner: string | null; colour: string } | null>(null);
  // A find during a run still counts, but shows no card: read by the game's callback, which outlives any one render.
  const inRun = useRef(false);
  const [offer, setOffer] = useState<ChallengeOffer | null>(null);
  const [dealership, setDealership] = useState<DealershipReading | null>(null);
  // Going into a dealership: the game builds the room once the cover has faded in.
  const [dealerCovered, setDealerCovered] = useState<{ covered: () => void } | null>(null);
  const [coop, setCoop] = useState<CoopReading | null>(null);
  const [notice, setNotice] = useState<(CoopNoticeReading & { seen: number }) | null>(null);
  // The time cover's round, while one shows, and the jumps waiting for it: one asked for while the cover is lifting gets a round of its own.
  const [timeCover, setTimeCover] = useState<number | null>(null);
  const timeJumps = useRef<(() => void)[]>([]);
  const needsRow = useRef<HTMLDivElement>(null);
  const needsText = useRef<HTMLSpanElement>(null);
  const clockText = useRef<HTMLSpanElement>(null);
  const gatesText = useRef<HTMLSpanElement>(null);
  const lapText = useRef<HTMLSpanElement>(null);
  const placeShown = useRef<HTMLSpanElement>(null);
  const lights = useRef<(HTMLSpanElement | null)[]>([]);
  const lightsRow = useRef<HTMLDivElement>(null);
  useFrameStats();

  useEffect(() => {
    const element = container.current;
    const mini = miniMap.current;
    const world = worldMap.current;
    if (!element || !mini || !world) return;
    const cleanup = new AbortController();
    // Asked again after each wait: the page may have closed while it waited.
    const closed = () => cleanup.signal.aborted;
    let stop: (() => void) | null = null;
    let shownPlay = "";
    let shownOffer = "";
    let shownCoop = "";
    let shownMonth = 0;
    const showChallenge = ({ challenge, offer: offered, coop: pairing }: HudReading) => {
      const offerKey = offered ? `${offered.title}|${offered.players}` : "";
      if (offerKey !== shownOffer) {
        shownOffer = offerKey;
        setOffer(offered);
      }
      const coopKey = pairing ? `${pairing.kind}|${pairing.name ?? ""}|${pairing.title}` : "";
      if (coopKey !== shownCoop) {
        shownCoop = coopKey;
        setCoop(pairing);
      }
      const play = challenge ? `${challenge.title}|${challenge.kind}|${challenge.target}|${challenge.partner ?? ""}|${challenge.ground ?? ""}` : "";
      if (play !== shownPlay) {
        shownPlay = play;
        inRun.current = challenge !== null;
        if (challenge) setFinds([]);
        setPlaying(challenge ? { title: challenge.title, kind: challenge.kind, target: challenge.target, partner: challenge.partner, colour: challenge.ground ? raceColour(challenge.ground) : CHALLENGE } : null);
      }
      if (!challenge) return;
      if (needsRow.current) needsRow.current.style.display = challenge.needs === null ? "none" : "flex";
      if (needsText.current && challenge.needs !== null) needsText.current.textContent = challenge.kind === "route" ? `Make it by ${timeText(challenge.needs)}` : `Reach ${resultText("speed-trap", challenge.needs, useUnits.getState().units)}`;
      if (clockText.current) clockText.current.textContent = timeText(challenge.clockS);
      if (gatesText.current) gatesText.current.textContent = `${challenge.gates.passed} / ${challenge.gates.of}`;
      if (lapText.current && challenge.race) lapText.current.textContent = `${challenge.race.lap} / ${challenge.race.laps}`;
      if (placeShown.current && challenge.race) placeShown.current.textContent = `${placeText(challenge.race.place)} of ${challenge.race.cars}`;
      // One red light a second through the countdown, then all green for a second.
      const red = challenge.phase === "countdown" ? Math.min(LIGHTS, LIGHTS + 1 - Math.ceil(challenge.countdownS)) : 0;
      const green = challenge.phase === "running" && challenge.clockS < 1;
      if (lightsRow.current) lightsRow.current.style.display = challenge.phase === "countdown" || challenge.phase === "placing" || green ? "flex" : "none";
      lights.current.forEach((light, index) => {
        if (light) light.style.background = green ? PASS : index < red ? REDLINE : SHADE;
      });
    };
    const showSpeed = (reading: HudReading) => {
      const { speedKmh, gear, revs, toGoM, clock } = reading;
      showChallenge(reading);
      if (clock.month !== shownMonth && monthShown.current) {
        shownMonth = clock.month;
        monthShown.current.textContent = MONTH_NAMES[clock.month - 1];
      }
      if (hourShown.current) hourShown.current.textContent = hourText(clock.hour, useUnits.getState().units);
      if (sunIcon.current) sunIcon.current.style.display = clock.sunUp ? "block" : "none";
      if (moonIcon.current) moonIcon.current.style.display = clock.sunUp ? "none" : "block";
      if (temperatureRow.current) temperatureRow.current.style.display = clock.temperatureC === null ? "none" : "flex";
      if (temperatureShown.current && clock.temperatureC !== null) temperatureShown.current.textContent = temperatureText(clock.temperatureC, useUnits.getState().units);
      if (speedText.current) speedText.current.textContent = String(speedNumber(speedKmh, useUnits.getState().units));
      if (gearText.current) gearText.current.textContent = gear;
      if (revArc.current) revArc.current.style.strokeDasharray = `${revs * DIAL_SWEEP} 1`;
      revNeedle.current?.setAttribute("transform", `rotate(${revs * DIAL_SWEEP * 360} 50 50)`);
      if (cue.current) cue.current.style.display = toGoM === null ? "none" : "flex";
      if (toGoM !== null && cueText.current) cueText.current.textContent = distanceText(toGoM, useUnits.getState().units);
    };
    void (async () => {
      const adapter = "gpu" in navigator ? await navigator.gpu.requestAdapter() : null;
      if (closed()) return;
      if (!adapter) {
        setNoWebGpu(true);
        return;
      }
      const { GpuLostError, NoWebGpuError, startGame } = await import("../render/game");
      const search = window.location.search;
      const relayUrl = solo ? null : onlineRelay(search, navigator.webdriver);
      const { id, name } = useProfile.getState();
      try {
        const game = await startGame(element, {
          onHud: showSpeed,
          onInputKind: setInput,
          onCamera: setCamera,
          onFailure: (error) => { setFailure(error instanceof GpuLostError ? GPU_LOST : mapLost(error.message)); },
          onLoading: setLoading,
          onMapReady: () => { setMapReady(true); },
          onMapOpen: setMapOpen,
          onDevMenuOpen: setDevMenuOpen,
          onGameMenu: setGameMenu,
          onRoad: (named) => { setRoad((last) => ({ name: named, seen: (last?.seen ?? 0) + 1 })); },
          onPlayers: setOthers,
          onCoopNotice: (heard) => { setNotice((last) => ({ ...heard, seen: (last?.seen ?? 0) + 1 })); },
          onPlaceFound: (place) => { if (!inRun.current) setFinds((waiting) => [...waiting, place]); },
          onProgress: setProgress,
          onTimeJump: (jump) => { timeJumps.current.push(jump); setTimeCover((round) => round ?? 0); },
          onDealership: setDealership,
          onDealershipCover: (covered) => { setDealerCovered({ covered }); },
        }, { mini, world }, relayUrl === null ? undefined : { relayUrl, code: worldCodeFromSearch(search), profile: { id, name } });
        if (closed()) {
          game.dispose();
          return;
        }
        window.__alandDrive = game.probe;
        onStarted?.(game.probe);
        setDev(game);
        setStarted(true);
        stop = () => {
          game.dispose();
          delete window.__alandDrive;
        };
      } catch (error) {
        if (!(error instanceof NoWebGpuError)) {
          setFailure(mapLost(error instanceof Error ? error.message : String(error)));
          throw error;
        }
        setNoWebGpu(true);
      }
    })();
    return () => {
      cleanup.abort();
      stop?.();
    };
  }, [solo, onStarted]);

  const stillLoading = !started && !noWebGpu && failure === null;
  // Inside a dealership, and on the way in, the drive's own HUD is put away.
  const walking = dealership !== null && dealership.kind !== "door";

  return (
    <div className="fixed inset-0" style={{ background: SHADE, ["--prompt-body" as string]: SHADE, ["--prompt-ink" as string]: INK }}>
      <div ref={container} className="absolute inset-0" />
      <style>{ROAD_LABEL_FADE}{TIME_COVER}</style>
      {(stillLoading || (loading !== null && loading.done < loading.total)) && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: SHADE }}>
          <div className="h-2 w-72 overflow-hidden rounded-full" role="progressbar" aria-label="Loading the island" aria-valuemin={0} aria-valuemax={loading?.total ?? 1} aria-valuenow={loading?.done ?? 0} style={{ background: INK, opacity: 0.9 }}>
            <div className="h-full origin-left transition-transform" style={{ background: ACCENT, transform: `scaleX(${loading ? loading.done / loading.total : 0})` }} />
          </div>
        </div>
      )}
      <canvas ref={worldMap} className="absolute inset-0 size-full cursor-crosshair transition-opacity" style={{ display: mapOpen ? "block" : "none", opacity: 0 }} aria-label="Island map" />
      {/* The time over the mini map, at least as wide as it: the month, the hour with the sun or the moon, and the air's temperature. */}
      <div className="pointer-events-none absolute bottom-[16.75rem] left-4 flex w-max min-w-60 items-center justify-center gap-3 text-lg font-semibold tabular-nums" style={{ color: INK, textShadow: `0 0 6px ${SHADE}`, display: mapReady && !mapOpen && camera !== "free" && !walking ? "flex" : "none" }} aria-label="Month, time and temperature">
        <span ref={monthShown} title="Month" aria-label="Month" />
        <span className="flex items-center gap-1" title="Time">
          <Sun ref={sunIcon} className="size-5 shrink-0" style={{ color: ACCENT }} aria-hidden />
          <Moon ref={moonIcon} className="size-5 shrink-0" style={{ display: "none" }} aria-hidden />
          <span ref={hourShown} aria-label="Time" />
        </span>
        <span ref={temperatureRow} className="items-center gap-1" style={{ display: "none" }} title="Temperature">
          <Thermometer className="size-5 shrink-0" aria-hidden />
          <span ref={temperatureShown} aria-label="Temperature" />
        </span>
      </div>
      <canvas ref={miniMap} width={240} height={240} className="pointer-events-none absolute bottom-4 left-4 rounded-full" style={{ display: mapReady && !mapOpen && camera !== "free" && !walking ? "block" : "none", border: `2px solid ${INK}` }} aria-label="Mini map" />
      {started && !noWebGpu && (
        <>
          {!mapOpen && camera !== "free" && !walking && (
            // One column at the top middle: the GPS and, in a run, the challenge with it, then the road and a find under them, clear of the frame meter at the top right.
            <div className="pointer-events-none absolute top-3 left-1/2 flex w-max max-w-[90vw] -translate-x-1/2 flex-col items-center gap-3">
              <div className={playing === null ? "flex flex-col items-center" : "flex min-w-64 flex-col gap-1 rounded-lg px-4 py-3"} style={playing === null ? undefined : { color: INK, background: SHADE, border: `2px solid ${playing.colour}` }} aria-label={playing === null ? undefined : playing.kind === "race" ? "Race" : "Challenge"}>
                <div ref={cue} className="items-center justify-center gap-2 text-xl font-semibold" style={{ color: INK, textShadow: playing === null ? `0 0 6px ${SHADE}` : undefined, display: "none" }} aria-label="Distance to go" title="Distance to go">
                <MapPin className="size-6 shrink-0" style={{ color: ACCENT }} aria-hidden />
                <span ref={cueText} className="tabular-nums" />
                </div>
                {playing !== null && (
                  <>
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: playing.colour }}>
                    {playing.kind === "race" ? <Trophy className="size-4 shrink-0" aria-hidden /> : <Flag className="size-4 shrink-0" aria-hidden />}
                    <span>{playing.title}</span>
                  </div>
                  <div ref={lightsRow} className="flex justify-center gap-2 py-1" aria-label="Start lights">
                    {Array.from({ length: LIGHTS }, (_, index) => (
                      <span key={index} ref={(light) => { lights.current[index] = light; }} className="size-6 rounded-full" style={{ background: SHADE, border: `2px solid ${INK}` }} />
                    ))}
                  </div>
                  {playing.partner !== null && (
                    <div className="flex items-center gap-2 text-sm font-semibold" aria-label="Partner" title="Co-op">
                      <Users className="size-4 shrink-0" style={{ color: PLAYER }} aria-hidden />
                      <span>{playing.partner}</span>
                    </div>
                  )}
                  <div ref={needsRow} className="items-center gap-2 text-lg font-semibold tabular-nums" style={{ display: "none", color: ACCENT }}>
                    <Target className="size-5 shrink-0" aria-hidden />
                    <span ref={needsText} aria-label="Partner needs" />
                  </div>
                  {playing.kind === "race" && (
                    <div className="flex items-center gap-5 tabular-nums">
                      <span className="text-3xl font-bold" title="Place" aria-label="Place" ref={placeShown}>
                        1st of 1
                      </span>
                      <span className="flex items-center gap-2 text-3xl font-bold" title="Lap">
                        <Repeat className="size-6 shrink-0" aria-hidden />
                        <span ref={lapText} aria-label="Lap">1 / 1</span>
                      </span>
                      <span className="flex items-center gap-2 text-lg" title="Lines this lap">
                        <Flag className="size-5 shrink-0" aria-hidden />
                        <span ref={gatesText} aria-label="Lines passed">0 / 0</span>
                      </span>
                    </div>
                  )}
                  {playing.kind === "route" && (
                    <>
                      <div className="flex items-baseline gap-2 tabular-nums">
                        <Timer className="size-5 shrink-0 self-center" aria-hidden />
                        <span ref={clockText} className="text-3xl font-bold" aria-label="Time">0:00.0</span>
                        {playing.target !== null && <span className="text-lg opacity-75" aria-label="Target">/ {resultText("route", playing.target, units)}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-lg tabular-nums" title="Gates">
                        <Flag className="size-5 shrink-0" aria-hidden />
                        <span ref={gatesText} aria-label="Gates passed">0 / 0</span>
                      </div>
                    </>
                  )}
                  {playing.kind === "speed-trap" && (
                    <div className="flex items-center gap-2 text-2xl font-bold tabular-nums" title="Speed to reach at the camera">
                      <Gauge className="size-6 shrink-0" aria-hidden />
                      {playing.target !== null && <span aria-label="Target">{resultText("speed-trap", playing.target, units)}</span>}
                    </div>
                  )}
                  </>
                )}
              </div>
            {road !== null && (
              <div key={road.seen} className="pointer-events-none text-2xl font-semibold" style={{ color: INK, textShadow: `0 0 6px ${SHADE}`, animation: "aland-road-label 3.5s ease-out forwards" }} aria-live="polite" aria-label="Road" onAnimationEnd={() => { setRoad(null); }}>
                {road.name}
              </div>
            )}
            {finds.length > 0 && (
              <div key={finds[0].id} className="pointer-events-none w-[min(32rem,90vw)] rounded-lg p-4" style={{ color: INK, background: SHADE, border: `2px solid ${PLACE}`, animation: `aland-road-label ${PLACE_CARD_S}s ease-out forwards` }} aria-live="polite" aria-label="Place found" onAnimationEnd={() => { setFinds((waiting) => waiting.slice(1)); }}>
                <div className="flex items-center gap-2 text-xl font-semibold" style={{ color: PLACE }}>
                  <Landmark className="size-5 shrink-0" aria-hidden />
                  <span>{finds[0].name}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed">{finds[0].note}</p>
              </div>
            )}
            </div>
          )}
          {mapOpen && progress !== null && (
            <div className="pointer-events-none absolute top-16 right-6 flex flex-col items-end gap-1 text-lg font-semibold tabular-nums" style={{ color: INK, textShadow: `0 0 6px ${SHADE}` }}>
              <div className="flex items-center gap-1" aria-label="Places found" title="Places found">
                <Landmark className="size-5" style={{ color: PLACE }} aria-hidden />
                <span>{progress.places.done} / {progress.places.total}</span>
              </div>
              <div className="flex items-center gap-1" aria-label="Bucket list challenges passed" title="Bucket list challenges passed">
                <Flag className="size-5" style={{ color: CHALLENGE }} aria-hidden />
                <span>{progress.challenges.done} / {progress.challenges.total}</span>
              </div>
              <div className="flex items-center gap-1" aria-label="Races with a medal" title="Races with a medal">
                <Trophy className="size-5" style={{ color: GOLD }} aria-hidden />
                <span>{progress.races.done} / {progress.races.total}</span>
              </div>
            </div>
          )}
          {/* In the driver's seat the car's own instruments show the speed and revs. */}
          {camera === "chase" && !walking && (
            <div className="pointer-events-none absolute right-5 bottom-3 size-48" style={{ color: INK, textShadow: `0 0 6px ${SHADE}` }}>
              <svg viewBox="0 0 100 100" className="absolute inset-0 rotate-[135deg]" aria-hidden fill="none" strokeWidth={5}>
                <circle cx={50} cy={50} r={44} pathLength={1} stroke={SHADE} strokeDasharray={`${DIAL_SWEEP} 1`} />
                <circle ref={revArc} cx={50} cy={50} r={44} pathLength={1} stroke={ACCENT} strokeDasharray={`0 1`} />
                <circle cx={50} cy={50} r={44} pathLength={1} stroke={REDLINE} strokeDasharray={`${DIAL_SWEEP * (1 - REDLINE_FROM)} 1`} strokeDashoffset={-DIAL_SWEEP * REDLINE_FROM} />
                <line ref={revNeedle} x1={78} y1={50} x2={98} y2={50} stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
              </svg>
              <span ref={speedText} className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-6xl font-bold tabular-nums" role="status" aria-label={units === "metric" ? "Speed in kilometres an hour" : "Speed in miles an hour"}>
                0
              </span>
              <span className="absolute inset-x-0 top-[68%] text-center text-sm font-semibold opacity-80" aria-hidden>
                {speedUnit(units)}
              </span>
              <span ref={gearText} className="absolute inset-x-0 bottom-1 text-center text-3xl font-bold tabular-nums" aria-label="Gear">
                1
              </span>
            </div>
          )}
          <DealershipHud
            reading={dealership}
            input={input}
            onCovered={() => {
              dealerCovered?.covered();
              setDealerCovered(null);
            }}
          />
          {offer !== null && !walking && coop === null && playing === null && gameMenu === null && !mapOpen && camera !== "free" && (
            <div className="pointer-events-none absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg px-3 py-2 text-lg font-semibold" style={{ color: INK, background: SHADE, border: `2px solid ${offer.ground ? raceColour(offer.ground) : CHALLENGE}` }} aria-label={offer.ground ? "Race here" : "Challenge here"} title={offer.ground ? "Race card" : offer.players === 0 ? "Start" : "Solo or co-op"}>
              <Prompt binding={BINDINGS.challenge} input={input} />
              {offer.ground ? <Trophy className="size-5 shrink-0" style={{ color: raceColour(offer.ground) }} aria-hidden /> : <Flag className="size-5 shrink-0" style={{ color: CHALLENGE }} aria-hidden />}
              <span>{offer.title}</span>
              {offer.players > 0 && (
                <span className="flex items-center gap-1 tabular-nums" aria-label="Co-op with" title={`Co-op: ask everyone online (${offer.players})`}>
                  <Users className="size-5 shrink-0" style={{ color: PLAYER }} aria-hidden />
                  <span>{offer.players}</span>
                </span>
              )}
            </div>
          )}
          {coop !== null && gameMenu === null && !mapOpen && camera !== "free" && (
            <div className="pointer-events-none absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg px-3 py-2 text-lg font-semibold" style={{ color: INK, background: SHADE, border: `2px solid ${PLAYER}` }} aria-label={coop.kind === "invited" ? "Co-op invite" : "Co-op waiting"} title={coop.kind === "invited" ? "Join or decline" : coop.kind === "inviting" ? "Take the invite back" : "Joining"}>
              {coop.kind !== "joining" && <Prompt binding={BINDINGS.challenge} input={input} />}
              {coop.kind === "invited" ? <UserPlus className="size-5 shrink-0" style={{ color: PLAYER }} aria-hidden /> : <Hourglass className="size-5 shrink-0" style={{ color: PLAYER }} aria-hidden />}
              {coop.name === null ? <Users className="size-5 shrink-0" style={{ color: PLAYER }} aria-label="Everyone" /> : <span>{coop.name}</span>}
              {coop.ground ? <Trophy className="size-5 shrink-0" style={{ color: raceColour(coop.ground) }} aria-label="Race" /> : <Flag className="size-5 shrink-0" style={{ color: CHALLENGE }} aria-label="Challenge" />}
              <span>{coop.title}</span>
            </div>
          )}
          {notice !== null && !mapOpen && (
            <CoopNotice key={notice.seen} notice={notice} onDone={() => { setNotice(null); }} />
          )}
          {others.length > 0 && playing === null && !mapOpen && camera !== "free" && (
            <div className="pointer-events-none absolute top-16 right-6 flex items-center gap-1 text-lg font-semibold tabular-nums" style={{ color: INK, textShadow: `0 0 6px ${SHADE}` }} aria-label="Players online, you included" title={["You", ...others].join(", ")}>
              <Users className="size-5" style={{ color: PLAYER }} aria-hidden />
              <span>{others.length + 1}</span>
            </div>
          )}
          {/* The driving controls are in Settings' Controls tab; the map shows its own while it's open. */}
          {mapOpen && (
          <ul className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-3 text-sm" style={{ color: INK, filter: `drop-shadow(0 0 3px ${SHADE})` }}>
            {MAP_HINTS.filter(({ binding }) => controlFor(binding, input) !== null).map(({ binding, icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1" title={label}>
                <Prompt binding={binding} input={input} />
                <Icon aria-label={label} className="size-4" />
              </li>
            ))}
          </ul>
          )}
        </>
      )}
      {timeCover !== null && (
        <TimeCover
          key={timeCover}
          jump={() => { for (const jump of timeJumps.current.splice(0)) jump(); }}
          onDone={() => { setTimeCover((round) => (timeJumps.current.length > 0 ? (round ?? 0) + 1 : null)); }}
        />
      )}
      {gameMenu !== null && dev !== null && <GameMenu key={`${gameMenu.items.join()}${gameMenu.result ? "-result" : ""}`} menu={gameMenu} input={input} onPick={dev.pickMenuItem} />}
      {devMenuOpen && dev !== null && <DevMenu traffic={dev.trafficOn()} onTraffic={dev.setTraffic} condition={dev.condition()} onCondition={dev.setCondition} day={dev.day} onDay={dev.setDay} weather={dev.weather} onWeather={dev.setWeather} spots={dev.spots} onJump={dev.jumpTo} onJumpToDestination={dev.hasDestination() ? dev.jumpToDestination : null} whereabouts={dev.whereabouts} onResetSave={dev.resetSave} onClose={() => { dev.setDevMenuOpen(false); }} />}
      {failure !== null && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center" style={{ color: INK, background: SHADE }} role="alert">
          <p className="max-w-md text-lg">{failure}</p>
        </div>
      )}
      {noWebGpu && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center" style={{ color: INK }}>
          <p className="max-w-sm text-lg">Åland Drive Unlimited needs a browser with WebGPU, such as a recent Chrome, Edge or Safari.</p>
        </div>
      )}
    </div>
  );
}
