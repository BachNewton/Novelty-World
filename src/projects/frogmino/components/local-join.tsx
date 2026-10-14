"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { subscribeGamepads } from "@/shared/lib/gamepad";
import { cn, isTextEntryTarget } from "@/shared/lib/utils";
import { FROG_LOOKS, FROG_VARIANTS } from "../frog/look";
import { padDevice, type DeviceId } from "../input/devices";
import { COURSE_KEYS, JOIN_KEYS, START_KEY } from "../input/keyboard";
import { coopCourseById, stepCoopCourse } from "../coop-courses";
import { EMPTY_LINEUP, isFull, join, leave, type Lineup } from "../input/lineup";
import { courseMusic } from "../audio/music/course-music";
import { usePreparedMusic } from "../audio/music/use-game-music";
import { CoursePicker } from "./course-picker";

// Local co-op's join screen: each device on this computer (either half of
// the keyboard, each controller) presses its join button to take the next
// free player slot, Sprout then Splash, and Start begins once both are in,
// on the course picked here: by mouse or touch, either half's rotate keys,
// or a controller's bumpers.

function deviceName(device: DeviceId): string {
  if (device === "keys:left") return "Keyboard: WASD";
  if (device === "keys:right") return "Keyboard: arrows";
  if (device.startsWith("pad:")) return `Controller ${String(Number(device.slice("pad:".length)) + 1)}`;
  throw new Error(`Frogmino: ${device} can't join local co-op`);
}

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
      onButton: (edge) => {
        if (!edge.pressed) return;
        const device = padDevice(edge.pad);
        if (edge.name === "A") setLineup((now) => join(now, device));
        if (edge.name === "B") setLineup((now) => leave(now, device));
        if (edge.name === "Menu") start();
        if (edge.name === "LB") pick(-1);
        if (edge.name === "RB") pick(1);
      },
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12 text-center">
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
          <b className="text-text-primary">Leave:</b> S, ↓, or B
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
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={onBack} variant="ghost">
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
      </div>
    </div>
  );
}
