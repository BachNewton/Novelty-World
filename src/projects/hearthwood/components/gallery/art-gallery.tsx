"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { type Camera, CircleGeometry, MeshLambertMaterial, NeutralToneMapping, type Scene, SkinnedMesh, Spherical, Vector3 } from "three";
import { ArrowLeft, RotateCw } from "lucide-react";
import { readPad, subscribeGamepads } from "@/shared/lib/gamepad";
import { themeColor } from "@/shared/lib/three/theme-color";
import { makeAtmosphere } from "../../art/atmosphere";
import { shadeLambert } from "../../art/shading";
import { Daylight, type Air, type Focus } from "../../art/daylight";
import { readPalette } from "../../art/palette";
import { makeSkyUniforms, Sky } from "../../art/sky";
import { FrameCosts } from "../../art/passes";
import { waterMaterial } from "../../art/water";
import { QUALITY } from "../../quality";
import { parseDate } from "../../engine/calendar";
import { advanceClock, holdHour, makeClock, type ValleyClock } from "../valley/clock";
import { DebugPanel } from "../valley/debug-panel";
import { FeatureRenderer } from "../valley/feature-renderer";
import { useFrameStats } from "../valley/frame-stats";
import { ART_PIECES, type ArtContext, type ArtPiece } from "./pieces";

/*
 * The art gallery (`?art`): every piece of the game's art on a plain floor,
 * in rows by kind, lit by the game's own day and air. Orbit and zoom with
 * the mouse, a finger or a pad; look along a row (its names show then), pick
 * a piece (or step through them with the pad's bumpers) to see it alone on a
 * turntable, and go back. Built from the
 * art layer alone, with no world generated and no rules, so it shows the art
 * stands on its own. `?hour=<0-24>` and the ~ panel set the time of day.
 */

const ROW_GAP = 9;
const PIECE_GAP = 1.6;
const CLOCK_PRIORITY = -6;

interface Placed {
  piece: ArtPiece;
  x: number;
  z: number;
}

interface Row {
  group: string;
  x: number;
  z: number;
}

/** Each group a row, its pieces side by side along +x, rows one behind another along +z. */
function layOut(pieces: readonly ArtPiece[]): { placed: Placed[]; rows: Row[]; width: number; depth: number } {
  const placed: Placed[] = [];
  const rows: Row[] = [];
  const groups = [...new Set(pieces.map((p) => p.group))];
  let z = 0;
  let width = 0;
  for (const group of groups) {
    const members = pieces.filter((p) => p.group === group);
    const deep = Math.max(...members.map((p) => p.radius));
    z += deep;
    let x = 0;
    for (const piece of members) {
      x += piece.radius;
      placed.push({ piece, x, z });
      x += piece.radius + PIECE_GAP;
    }
    rows.push({ group, x: 0, z });
    width = Math.max(width, x);
    z += deep + ROW_GAP;
  }
  const middle = width / 2;
  const depth = z;
  for (const p of placed) {
    p.x -= middle;
    p.z -= depth / 2;
  }
  for (const r of rows) {
    r.x = -middle - 2;
    r.z -= depth / 2;
  }
  return { placed, rows, width, depth };
}

interface ArtProbe {
  isReady: () => boolean;
  frameCount: () => number;
  pieces: () => string[];
  holdHour: (hours: number | null) => void;
  holdMotion: (seconds: number | null) => void;
  /** Turns to one piece on its turntable, or back to the whole gallery with null. */
  focus: (id: string | null) => void;
  /** Looks along one row, everything still shown, or back to the whole gallery with null. */
  showRow: (group: string | null) => void;
  rows: () => string[];
  setTurntable: (on: boolean) => void;
  /** Puts the camera at an angle round what it looks at (degrees), a height angle (degrees) and a distance (metres, or as it is with null). */
  setView: (azimuth: number, elevation: number, distance: number | null) => void;
}

declare global {
  interface Window {
    __hearthwoodArt?: ArtProbe;
  }
}

const LABEL_STYLE: CSSProperties = {
  background: "var(--color-hearthwood-valley-ui-shade)",
  color: "var(--color-hearthwood-valley-ui-ink)",
};

function Floor({ size, context }: { size: number; context: ArtContext }) {
  const assets = useMemo(() => {
    const material = shadeLambert(new MeshLambertMaterial({ color: themeColor("--color-hearthwood-gallery-ground") }), "ground", context.atmosphere);
    const edge = shadeLambert(new MeshLambertMaterial({ color: themeColor("--color-hearthwood-gallery-ground-edge") }), "ground", context.atmosphere);
    return { material, edge, inner: new CircleGeometry(size, 96).rotateX(-Math.PI / 2), outer: new CircleGeometry(size * 6, 96).rotateX(-Math.PI / 2) };
  }, [size, context]);
  useEffect(
    () => () => {
      for (const a of Object.values(assets)) a.dispose();
    },
    [assets],
  );
  return (
    <>
      <mesh geometry={assets.inner} material={assets.material} receiveShadow position={[0, 0.01, 0]} />
      <mesh geometry={assets.outer} material={assets.edge} receiveShadow />
    </>
  );
}

function Ticker({ clock }: { clock: ValleyClock }) {
  useFrame((_, delta) => advanceClock(clock, Math.min(delta, 0.1)), CLOCK_PRIORITY);
  return null;
}

/** Points the camera at the whole gallery or at one piece, and drives it from a pad: the right stick orbits, the left pans, the triggers zoom. */
function CameraRig({ target, distance, controls, onFrame }: { target: Vector3; distance: number; controls: React.RefObject<OrbitControlsImpl | null>; onFrame: (scene: Scene) => void }) {
  const camera = useThree((s) => s.camera);
  const pad = useRef({ orbit: { x: 0, y: 0 }, pan: { x: 0, y: 0 }, zoom: 0 });
  useEffect(() => {
    const from = new Vector3(0.55, 0.45, 0.7).normalize().multiplyScalar(distance).add(target);
    camera.position.copy(from);
    controls.current?.target.copy(target);
    controls.current?.update();
  }, [camera, controls, target, distance]);
  useEffect(
    () =>
      subscribeGamepads({
        onFrame(pads) {
          const reading = pads.find((p) => p.standard);
          const c = reading ? readPad(reading).controls : null;
          pad.current = c ? { orbit: c.rightStick, pan: c.leftStick, zoom: c.rightTrigger - c.leftTrigger } : { orbit: { x: 0, y: 0 }, pan: { x: 0, y: 0 }, zoom: 0 };
        },
      }),
    [],
  );
  const scratch = useMemo(() => ({ spherical: new Spherical(), offset: new Vector3() }), []);
  useFrame(({ camera: eye, scene }, delta) => {
    onFrame(scene);
    if (controls.current) steerByPad(controls.current, eye, pad.current, delta, scratch);
  });
  return null;
}

interface PadSteer {
  orbit: { x: number; y: number };
  pan: { x: number; y: number };
  zoom: number;
}

/** One frame of a pad steering the orbit: the right stick turns round what is looked at, the left moves it, the triggers come in and go out. */
function steerByPad(orbit: OrbitControlsImpl, camera: Camera, { orbit: turn, pan, zoom }: PadSteer, delta: number, { spherical, offset }: { spherical: Spherical; offset: Vector3 }): void {
  if (turn.x === 0 && turn.y === 0 && pan.x === 0 && pan.y === 0 && zoom === 0) return;
  offset.copy(camera.position).sub(orbit.target);
  spherical.setFromVector3(offset);
  spherical.theta -= turn.x * delta * 1.8;
  spherical.phi = Math.min(Math.PI * 0.49, Math.max(0.1, spherical.phi + turn.y * delta * 1.4));
  spherical.radius = Math.min(400, Math.max(1.5, spherical.radius * (1 - zoom * delta * 1.2)));
  const reach = spherical.radius * delta * 0.8;
  const sin = Math.sin(spherical.theta);
  const cos = Math.cos(spherical.theta);
  orbit.target.x += (pan.x * cos + pan.y * sin) * reach;
  orbit.target.z += (-pan.x * sin + pan.y * cos) * reach;
  offset.setFromSpherical(spherical);
  camera.position.copy(orbit.target).add(offset);
  orbit.update();
}

/** How many animals' bodies the scene holds: each is meshed in a worker, and shows once its mesh is ready. */
function bodiesIn(scene: Scene): number {
  let count = 0;
  scene.traverse((object) => {
    if (object instanceof SkinnedMesh) count += 1;
  });
  return count;
}

/** Points the light's shadows at what the camera looks at. */
function aimLight(focus: Focus, target: Vector3): void {
  focus.x = target.x;
  focus.z = target.z;
}

export function ArtGallery() {
  const hour = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get("hour");
    return value === null ? 15.5 : Number(value);
  }, []);
  const shared = useMemo(() => {
    const palette = readPalette();
    const atmosphere = makeAtmosphere();
    const sky = makeSkyUniforms(palette);
    // On the autumn equinox, so the gallery's day has every moment at its usual hour: sunrise at six, sunset at six, a dark night.
    const clock = makeClock(hour, parseDate("mabon"));
    const context: ArtContext = {
      palette,
      atmosphere,
      sky,
      fire: clock,
      clock: () => clock.motion,
      materials: {
        foliage: shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "foliage", atmosphere),
        stone: shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "solid", atmosphere),
        place: shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "solid", atmosphere),
        water: waterMaterial(palette, atmosphere, sky),
      },
    };
    const focusPoint: Focus = { x: 0, y: 0, z: 0 };
    const air: Air = { thickness: 0.25 };
    return { context, clock, focusPoint, air, layout: layOut(ART_PIECES), debug: { clock, costs: new FrameCosts() } };
  }, [hour]);
  const { context, clock, focusPoint, air, layout, debug } = shared;
  const [focus, setFocus] = useState<string | null>(null);
  const [row, setRow] = useState<string | null>(null);
  const [turntable, setTurntable] = useState(true);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const frames = useRef(0);
  const bodies = useRef(0);
  // The labels' own layer: drei's Html otherwise re-parents (and remounts) every label when the controls take over the canvas's events.
  const [labelLayer, setLabelLayer] = useState<HTMLDivElement | null>(null);
  const labels = labelLayer ? { current: labelLayer } : undefined;
  useFrameStats();

  useEffect(
    () => () => {
      for (const m of Object.values(context.materials)) m.dispose();
    },
    [context],
  );

  const chosen = focus === null ? null : (layout.placed.find((p) => p.piece.id === focus) ?? null);
  const view = useMemo(() => {
    if (chosen) return { target: new Vector3(chosen.x, chosen.piece.height * 0.45, chosen.z), distance: Math.max(3, chosen.piece.radius * 2.6 + chosen.piece.height) };
    const members = layout.placed.filter((p) => p.piece.group === row);
    if (members.length > 0) {
      const from = members[0].x - members[0].piece.radius;
      const to = members[members.length - 1].x + members[members.length - 1].piece.radius;
      const tallest = Math.max(...members.map((p) => p.piece.height));
      return { target: new Vector3((from + to) / 2, tallest * 0.3, members[0].z), distance: Math.max(8, (to - from) * 0.62 + tallest) };
    }
    return { target: new Vector3(0, 0, 0), distance: Math.max(layout.width, layout.depth) * 0.75 };
  }, [chosen, layout, row]);
  useEffect(() => aimLight(focusPoint, view.target), [focusPoint, view]);

  // A pad steps through the pieces with its bumpers and the rows with the d-pad, and goes back to the whole gallery with B; Escape does too.
  useEffect(() => {
    const ids = layout.placed.map((p) => p.piece.id);
    const groups = layout.rows.map((g) => g.group);
    const step = (by: number) => setFocus((was) => ids[((was === null ? -1 : ids.indexOf(was)) + by + ids.length) % ids.length]);
    const stepRow = (by: number) => {
      setFocus(null);
      setRow((was) => groups[((was === null ? -1 : groups.indexOf(was)) + by + groups.length) % groups.length]);
    };
    const stopPad = subscribeGamepads({
      onButton(edge) {
        if (!edge.pressed) return;
        if (edge.name === "RB") step(1);
        if (edge.name === "LB") step(-1);
        if (edge.name === "DpadDown") stepRow(1);
        if (edge.name === "DpadUp") stepRow(-1);
        if (edge.name === "B") {
          setFocus(null);
          setRow(null);
        }
      },
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setFocus(null);
      setRow(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      stopPad();
      window.removeEventListener("keydown", onKey);
    };
  }, [layout]);

  useEffect(() => {
    window.__hearthwoodArt = {
      isReady: () => frames.current > 3 && bodies.current === ART_PIECES.filter((p) => p.id.startsWith("folk/cat/")).length,
      frameCount: () => frames.current,
      pieces: () => layout.placed.map((p) => p.piece.id),
      holdHour: (hours) => holdHour(clock, hours),
      holdMotion: (seconds) => {
        clock.heldMotion = seconds;
      },
      focus: setFocus,
      showRow: setRow,
      rows: () => layout.rows.map((r) => r.group),
      setTurntable,
      setView: (azimuth, elevation, distance) => {
        const orbit = controls.current;
        if (!orbit) return;
        const d = distance ?? orbit.object.position.distanceTo(orbit.target);
        const a = (azimuth * Math.PI) / 180;
        const e = (elevation * Math.PI) / 180;
        orbit.object.position.set(orbit.target.x + Math.sin(a) * Math.cos(e) * d, orbit.target.y + Math.sin(e) * d, orbit.target.z + Math.cos(a) * Math.cos(e) * d);
        orbit.update();
      },
    };
    return () => {
      delete window.__hearthwoodArt;
    };
  }, [clock, layout]);

  return (
    <div className="relative h-dvh w-full touch-none overflow-hidden select-none" data-testid="hearthwood-art">
      <Canvas
        dpr={[1, QUALITY.maxPixelRatio]}
        shadows="percentage"
        gl={{ antialias: true, powerPreference: "high-performance", reversedDepthBuffer: true }}
        camera={{ fov: 45, near: 0.1, far: 4000 }}
        onCreated={({ gl }) => {
          gl.toneMapping = NeutralToneMapping;
        }}
      >
        <Ticker clock={clock} />
        <Daylight day={clock} palette={context.palette} atmosphere={context.atmosphere} sky={context.sky} focus={focusPoint} air={air} shadows={{ map: QUALITY.shadowMap, reach: chosen ? 20 : Math.max(layout.width, layout.depth) * 0.6 }} />
        <Sky atmosphere={context.atmosphere} sky={context.sky} />
        <FeatureRenderer day={clock} atmosphere={context.atmosphere} sky={context.sky} costs={debug.costs} />
        <Floor size={Math.max(layout.width, layout.depth) * 0.75} context={context} />
        {layout.placed.map(({ piece, x, z }) => (
          <group
            key={piece.id}
            position={[x, 0, z]}
            visible={chosen === null || chosen.piece.id === piece.id}
            onClick={(e) => {
              e.stopPropagation();
              setFocus(piece.id);
            }}
          >
            {piece.render(context)}
            <Html portal={labels} position={[0, -0.05, piece.radius + 0.6]} center zIndexRange={[10, 0]}>
              <div className="pointer-events-none rounded px-1.5 py-0.5 text-xs whitespace-nowrap opacity-90" style={{ ...LABEL_STYLE, display: row === piece.group && !chosen ? undefined : "none" }}>
                {piece.label}
              </div>
            </Html>
          </group>
        ))}
        {layout.rows.map((line) => (
          <Html key={line.group} portal={labels} position={[line.x, 0.2, line.z]} center={false} zIndexRange={[20, 10]}>
            <div className="pointer-events-none -translate-x-full rounded-md px-2 py-1 text-sm font-semibold whitespace-nowrap" style={{ ...LABEL_STYLE, display: chosen || (row !== null && row !== line.group) ? "none" : undefined }}>
              {line.group}
            </div>
          </Html>
        ))}
        <OrbitControls ref={controls} makeDefault enableDamping={false} autoRotate={chosen !== null && turntable} autoRotateSpeed={1.2} maxPolarAngle={Math.PI * 0.49} minDistance={1.2} maxDistance={600} />
        <CameraRig target={view.target} distance={view.distance} controls={controls} onFrame={(scene) => {
            frames.current += 1;
            bodies.current = bodiesIn(scene);
          }}
        />
      </Canvas>

      <div ref={setLabelLayer} className="pointer-events-none absolute inset-0 overflow-hidden" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 p-3">
        {chosen && (
          <>
            <button
              type="button"
              aria-label="Back to the gallery"
              title="Back to the gallery"
              onClick={() => setFocus(null)}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-md"
              style={LABEL_STYLE}
            >
              <ArrowLeft size={20} />
            </button>
            <div className="rounded-md px-3 py-2 text-sm" style={LABEL_STYLE}>
              {chosen.piece.group} · {chosen.piece.label}
            </div>
            <button
              type="button"
              aria-label="Turntable"
              title="Turntable"
              aria-pressed={turntable}
              onClick={() => setTurntable(!turntable)}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-md"
              style={{ ...LABEL_STYLE, opacity: turntable ? 1 : 0.6 }}
            >
              <RotateCw size={20} />
            </button>
          </>
        )}
        {!chosen && (
          <div className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto">
            {layout.rows.map((line) => (
              <button
                key={line.group}
                type="button"
                aria-pressed={row === line.group}
                onClick={() => setRow(row === line.group ? null : line.group)}
                className="shrink-0 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap"
                style={{ ...LABEL_STYLE, opacity: row === null || row === line.group ? 1 : 0.65 }}
              >
                {line.group}
              </button>
            ))}
          </div>
        )}
      </div>
      <DebugPanel context={debug} />
    </div>
  );
}
