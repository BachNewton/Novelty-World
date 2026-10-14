"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { PadHints } from "@/shared/components/pad-hints";
import { subscribeGamepads, usePadNavigation, type ButtonEdge } from "@/shared/lib/gamepad";
import { cn, isTextEntryTarget } from "@/shared/lib/utils";
import { FROG_LOOKS, FROG_VARIANTS } from "../frog/look";
import { padDevice, type DeviceId } from "../input/devices";
import { COURSE_KEYS, JOIN_KEYS, START_KEY } from "../input/keyboard";
import { coopCourseById, stepCoopCourse } from "../coop-courses";
import { EMPTY_LINEUP, isFull, join, leave, seatOf, type Lineup } from "../input/lineup";
import { courseMusic } from "../audio/music/course-music";
import { usePreparedMusic } from "../audio/music/use-game-music";
import { CoursePicker } from "./course-picker";
import { StickyActions } from "./sticky-actions";

// Local co-op's join screen: each device on this computer (either half of
// the keyboard, each controller) presses its join button to take the next
// free player slot, Sprout then Splash, and Start begins once both are in,
// on the course picked here: by mouse or touch, either half's rotate keys,
// or a controller's bumpers.
//
// A controller also moves the screen's focus (`usePadNavigation`), but its A
// and B are the join keys first: A joins a controller that isn't in, while a
// slot is free, and B takes one that is in out, so a join never also presses
// a button. A controller already in (or turned away, both slots taken)
// presses the focused button with A, and B with no slot to leave goes back
// to the lobby. Menu always starts, and LB and RB always step the course.

function deviceName(device: DeviceId): string {
  if (device === "keys:left") return "Keyboard: WASD";
  if (device === "keys:right") return "Keyboard: arrows";
  if (device.startsWith("pad:")) return `Controller ${String(Number(device.slice("pad:".length)) + 1)}`;
  throw new Error(`Frogmino: ${device} can't join local co-op`);
}

const JOIN_HINTS = [
  ["A", "Join, then select"],
  ["B", "Leave, then back"],
  ["LB", "Previous course"],
  ["RB", "Next course"],
  ["Menu", "Start"],
] as const;

const SLOT_TONE = ["border-brand-green text-brand-green", "border-brand-blue text-brand-blue"] as const;

export function LocalJoin({
  initialCourse,
  onStart,
  onBack,
}: {
  initialCourse: string;
  onStart: (lineup: Lineup, course: string) => void;
  onBack: () => void;
}) {
  const [lineup, setLineup] = useState<Lineup>(EMPTY_LINEUP);
  const [course, setCourse] = useState(() => coopCourseById(initialCourse).id);
  // The picked course's theme, rendered while the players are here.
  usePreparedMusic(courseMusic({ kind: "coop", id: course }));
  const latest = useRef({ lineup, course });
  const root = useRef<HTMLDivElement>(null);
  const onStartRef = useRef(onStart);
  useEffect(() => {
    latest.current = { lineup, course };
    onStartRef.current = onStart;
  }, [lineup, course, onStart]);

  useEffect(() => {
    const start = (): void => {
      if (isFull(latest.current.lineup)) onStartRef.current(latest.current.lineup, latest.current.course);
    };
    const pick = (step: number): void => {
      setCourse((now) => stepCoopCourse(now, step));
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTextEntryTarget(e.target)) return;
      if (e.code === START_KEY) {
        // Enter on another course in the list picks it, rather than starting.
        const focused = e.target instanceof Element ? e.target.closest("[data-course]")?.getAttribute("data-course") : undefined;
        if (focused !== undefined && focused !== null && focused !== latest.current.course) return;
        start();
        return;
      }
      const step = COURSE_KEYS[e.code];
      if (step !== undefined) {
        e.preventDefault();
        pick(step);
        return;
      }
      for (const [half, keys] of Object.entries(JOIN_KEYS) as [keyof typeof JOIN_KEYS, (typeof JOIN_KEYS)[keyof typeof JOIN_KEYS]][]) {
        if (e.code === keys.join) {
          e.preventDefault();
          setLineup((now) => join(now, half));
        }
        if (e.code === keys.leave) {
          e.preventDefault();
          setLineup((now) => leave(now, half));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const unsubscribe = subscribeGamepads({
      // A controller that disconnects leaves its slot.
      onConnectionChange: (pads) => {
        const connected = new Set(pads.map((pad) => padDevice(pad.index)));
        setLineup((now) => now.reduce((next, device) => (device?.startsWith("pad:") && !connected.has(device) ? leave(next, device) : next), now));
      },
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubscribe();
    };
  }, []);

  // The lineup changes here as well as in state, so a second press in the
  // same frame sees the first.
  const padButton = useCallback((edge: ButtonEdge): boolean => {
    const device = padDevice(edge.pad);
    const seated = seatOf(latest.current.lineup, device) !== null;
    const seat = (next: Lineup): void => {
      latest.current = { ...latest.current, lineup: next };
      setLineup(next);
    };
    switch (edge.name) {
      case "A":
        if (seated || isFull(latest.current.lineup)) return false;
        seat(join(latest.current.lineup, device));
        return true;
      case "B":
        if (!seated) return false;
        seat(leave(latest.current.lineup, device));
        return true;
      case "Menu":
        if (isFull(latest.current.lineup)) onStartRef.current(latest.current.lineup, latest.current.course);
        return true;
      case "LB":
      case "RB":
        setCourse((now) => stepCoopCourse(now, edge.name === "LB" ? -1 : 1));
        return true;
      default:
        return false;
    }
  }, []);
  usePadNavigation(root, { intercept: padButton });

  return (
    <div ref={root} className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <h1 className="text-3xl font-bold text-brand-green">Frogmino local co-op</h1>
      <p className="max-w-md text-text-secondary">
        Two players on this computer. Each presses their join button to take the next frog.
      </p>
      <ul aria-label="Players" className="grid w-full max-w-md gap-3 sm:grid-cols-2">
        {lineup.map((device, slot) => {
          const look = FROG_LOOKS[FROG_VARIANTS[slot]];
          return (
            <li key={look.name}>
              <Card className={cn("space-y-1 border-2 p-4", device === null ? "border-dashed border-border-hover" : SLOT_TONE[slot])}>
                <p className="text-lg font-bold">
                  P{slot + 1} {look.name}
                </p>
                <p data-testid={`slot-${String(slot + 1)}`} className="text-sm text-text-primary">
                  {device === null ? "Press to join" : deviceName(device)}
                </p>
              </Card>
            </li>
          );
        })}
      </ul>
      <Card className="w-full max-w-md space-y-1 p-4 text-left text-sm text-text-secondary">
        <p>
          <b className="text-text-primary">Join:</b> Space (WASD), / (arrows), or A on a controller
        </p>
        <p>
          <b className="text-text-primary">Leave:</b> S, ↓, or B (B again for the lobby)
        </p>
        <p>
          <b className="text-text-primary">Move round:</b> the D-pad or stick, then A to press
        </p>
        <p>
          <b className="text-text-primary">Course:</b> Q E or , . to switch, or LB RB on a controller
        </p>
        <p>
          <b className="text-text-primary">Start:</b> Enter, or Menu on a controller
        </p>
      </Card>
      <section aria-label="Course" className="w-full max-w-md">
        <CoursePicker selected={course} onSelect={setCourse} />
      </section>
      <StickyActions>
        <Button onClick={onBack} variant="ghost" data-pad-back>
          Back to lobby
        </Button>
        <Button
          onClick={() => {
            onStart(lineup, course);
          }}
          disabled={!isFull(lineup)}
          className="bg-brand-green hover:bg-brand-green/90"
        >
          Start
        </Button>
        <PadHints hints={JOIN_HINTS} className="w-full" />
      </StickyActions>
    </div>
  );
}
