"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Valley } from "../../world/valley";
import { holdHour, type ValleyClock } from "./clock";
import { FIRST_ORBIT, type Orbit } from "./follow-camera";
import type { CameraView, Walker } from "./walker";

/*
 * The valley's handle for screenshots and tests, on `window.__hearthwoodValley`:
 * whether it is ready (built, its shaders compiled, and a frame drawn), a
 * frame counter to wait on, what the last frame drew, and switches for the
 * hour, the motion clock, the camera and where the walker stands. Waiting on
 * these is waiting on events, never on time.
 */

export interface DrawnFrame {
  triangles: number;
  calls: number;
  points: number;
  geometries: number;
  programs: number;
  /** Milliseconds between the last frames drawn, newest last. */
  frameTimes: number[];
  pixelRatio: number;
  width: number;
  height: number;
}

export interface ValleyProbe {
  seed: string;
  isReady: () => boolean;
  frameCount: () => number;
  drawn: () => DrawnFrame;
  hour: () => number;
  /** Holds the day at an hour, or lets it turn again from there with null. */
  holdHour: (hours: number | null) => void;
  /** Holds every motion (flames, water, breeze) at a moment, or lets it run with null. */
  holdMotion: (seconds: number | null) => void;
  setView: (view: CameraView) => void;
  setOrbit: (orbit: Partial<Orbit>) => void;
  placeWalker: (x: number, z: number, heading?: number) => void;
  walker: () => { x: number; z: number; heading: number };
  /** Where the camera is and the orbit it is on. */
  camera: () => { x: number; y: number; z: number; orbit: Orbit };
  places: () => { kind: string; x: number; z: number; visitX: number; visitZ: number }[];
  camp: () => { x: number; z: number };
}

declare global {
  interface Window {
    __hearthwoodValley?: ValleyProbe;
  }
}

const KEPT_FRAME_TIMES = 120;

export function ValleyProbeHandle({ valley, clock, walker }: { valley: Valley; clock: ValleyClock; walker: Walker }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const frames = useRef(0);
  const compiled = useRef(false);
  const times = useRef<number[]>([]);
  const last = useRef<number | null>(null);
  const drawn = useRef({ triangles: 0, calls: 0, points: 0 });

  useEffect(() => {
    let live = true;
    void gl.compileAsync(scene, camera).then(() => {
      if (live) compiled.current = true;
    });
    window.__hearthwoodValley = {
      seed: valley.seed,
      isReady: () => compiled.current && frames.current > 1,
      frameCount: () => frames.current,
      drawn: () => ({
        ...drawn.current,
        geometries: gl.info.memory.geometries,
        programs: gl.info.programs?.length ?? 0,
        frameTimes: [...times.current],
        pixelRatio: gl.getPixelRatio(),
        width: gl.domElement.width,
        height: gl.domElement.height,
      }),
      hour: () => clock.hours,
      holdHour: (hours) => {
        holdHour(clock, hours);
      },
      holdMotion: (seconds) => {
        clock.heldMotion = seconds;
      },
      setView: (view) => {
        walker.view = view;
      },
      setOrbit: (orbit) => {
        walker.orbit = { ...FIRST_ORBIT, ...walker.orbit, ...orbit };
      },
      placeWalker: (x, z, heading) => {
        walker.x = x;
        walker.z = z;
        if (heading !== undefined) walker.heading = heading;
      },
      walker: () => ({ x: walker.x, z: walker.z, heading: walker.heading }),
      camera: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z, orbit: walker.orbit }),
      places: () => valley.places.map((p) => ({ kind: p.kind, x: p.x, z: p.z, visitX: p.visitX, visitZ: p.visitZ })),
      camp: () => ({ x: valley.camp.x, z: valley.camp.z }),
    };
    return () => {
      live = false;
      delete window.__hearthwoodValley;
    };
  }, [gl, scene, camera, valley, clock, walker]);

  // After the frame is drawn: what it drew, and that it was.
  useFrame(() => {
    drawn.current = { triangles: gl.info.render.triangles, calls: gl.info.render.calls, points: gl.info.render.points };
    const now = performance.now();
    if (last.current !== null) {
      times.current.push(now - last.current);
      if (times.current.length > KEPT_FRAME_TIMES) times.current.shift();
    }
    last.current = now;
    frames.current++;
  });
  return null;
}
