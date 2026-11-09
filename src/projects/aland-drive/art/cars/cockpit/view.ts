import { Mesh, Vector3, type BufferGeometry, type Node } from "three/webgpu";
import { float } from "three/tsl";
import { CARS as TUNINGS } from "../../../sim/cars";
import { topSpeedMS, type EngineRead } from "../../../sim/gearbox";
import type { CarState } from "../../../sim/car-state";
import type { Units } from "../../../units";
import { geometryOf, insideGlassMaterial } from "../material";
import type { CarSpec } from "../build";
import { paintAt, paintsOf } from "../paints";
import type { Sun } from "../../sun";
import { BOOST_BAR, SOURCE } from "./atlas";
import { drawDialSheet, type DialFaces } from "./dials";
import { buildCockpit } from "./interior";
import { cockpitGeometry, cockpitMaterial, fitCockpit, readings, setCockpitPaint, wheelTurn } from "./material";

/*
 * A car's cockpit, ready to draw: the interior as one mesh to hang in the car's
 * body pivot beside its shell, the bare shell to draw in place of the one with the
 * simple cabin, and the eye. `read` moves the needles, figures and wheel from the
 * player's car each frame; only the player's own car ever has one.
 */

/** What a turbo's gauge reads, in bar: nothing off the throttle, and on it rising from a third of the revs to its full boost past half of them. */
function boostBar(full: number, load: number, revsShare: number): number {
  const spooled = Math.min(1, Math.max(0, (revsShare - 0.33) / 0.27));
  return full * load * spooled * spooled * (3 - 2 * spooled);
}

export interface CockpitOptions {
  sun: Sun;
  hazed?: (colour: Node<"vec3">) => Node<"vec3">;
  /** How far after dark it is for the instruments, 0 to 1. */
  glowing?: Node<"float">;
  units: Units;
  /** The car's see-through glass, drawn from inside while the cockpit is. */
  glass?: BufferGeometry | null;
}

/** What a cockpit reads besides the car: the engine, and the hour and air outside. */
export interface CockpitReading {
  engine: EngineRead & { reversing: boolean };
  hour: number;
  outsideC: number;
}

const KMH_A_MS = 3.6;
const MPH_A_KMH = 1 / 1.609344;

/** A dial's full scale: the next round figure past the top speed. */
const speedScale = (topKmh: number, units: Units) => {
  const top = units === "metric" ? topKmh : topKmh * MPH_A_KMH;
  return Math.ceil((top + 5) / 20) * 20;
};

export function createCockpit(spec: CarSpec, { sun, hazed, glowing = float(0), units, glass = null }: CockpitOptions) {
  if (spec.id === undefined) throw new Error(`${spec.name} isn't a car a player drives`);
  const tuning = TUNINGS[spec.id];
  const parts = buildCockpit(spec);
  const { frame } = parts;
  const electric = tuning.gearbox.idleRpm === 0;
  const topKmh = topSpeedMS(tuning) * KMH_A_MS;
  let shownUnits = units;
  const faces = (): DialFaces => ({
    gauges: frame.style.gauges,
    speedMax: speedScale(topKmh, shownUnits),
    speedUnit: shownUnits === "metric" ? "KM/H" : "MPH",
    revsMax: Math.floor(tuning.gearbox.redlineRpm / 1000) + 1,
    redline: tuning.gearbox.redlineRpm / 1000,
    panelAspect: (frame.cluster.width - 0.014) / (frame.cluster.height - 0.014),
    boost: frame.style.boost > 0,
    light: frame.style.lightDials,
  });
  let sheet = drawDialSheet(faces());
  const { material, setSheet } = cockpitMaterial({ sun, sheet, hazed, glowing });
  const geometry = cockpitGeometry(parts.soup, parts.openness);
  const shell: BufferGeometry = geometryOf(parts.shell);
  const interior = new Mesh(geometry, material);
  interior.name = "cockpit";
  interior.position.y = -spec.ride.massUpM;
  interior.updateMatrix();
  // The camera is inside it, so its bounds always hold the view.
  interior.frustumCulled = false;
  const insideGlass = glass && new Mesh(glass, insideGlassMaterial({ sun, hazed }));
  if (insideGlass) {
    insideGlass.frustumCulled = false;
    insideGlass.updateMatrix();
    interior.add(insideGlass);
  }

  const dialsOf = () => {
    const scale = faces();
    const fullScale = (source: number) => (source === SOURCE.speed ? scale.speedMax : source === SOURCE.revs ? scale.revsMax : source === SOURCE.boost ? BOOST_BAR.max : 1);
    return parts.dials.map((dial) => ({ ...dial, max: fullScale(dial.source) }));
  };
  const cluster = frame.cluster.centre;
  const paints = paintsOf(spec);
  // The painted parts wear the car's own paint, read from its state as the body's is.
  let paint = paints[0];
  const fit = () => {
    fitCockpit(parts.shade, dialsOf(), parts.wheel, { paint: paint.colour, glow: frame.style.colours.glow, clusterAt: [cluster.x, cluster.h + frame.ground, cluster.z] });
  };
  const radiansPerSteer = (frame.style.turnsToLock * Math.PI * 2) / tuning.steering.lock;

  return {
    interior,
    /** The shell to draw while the cockpit is shown: the hero's, with nothing inside. */
    shell,
    /** The driver's eye in the car's own frame. */
    eye: new Vector3(...parts.eye),
    parts,
    /** Hands this car's dials, wheel and cabin to the cockpit material, which one cockpit at a time uses. */
    fit,
    read(car: CarState, { engine, hour, outsideC }: CockpitReading) {
      const coat = paintAt(paints, car.paint);
      if (coat !== paint) {
        paint = coat;
        setCockpitPaint(coat.colour);
      }
      const kmh = Math.hypot(...car.velocity) * KMH_A_MS;
      readings.speed.value = shownUnits === "metric" ? kmh : kmh * MPH_A_KMH;
      readings.revs.value = electric ? 0 : engine.rpm / 1000;
      readings.power.value = electric ? engine.load : 0;
      readings.lamps.value = electric ? engine.load : engine.rpm / tuning.gearbox.redlineRpm;
      readings.oil.value = 0.3 + 0.55 * Math.min(engine.rpm / tuning.gearbox.redlineRpm, 1);
      readings.boost.value = boostBar(frame.style.boost, engine.load, engine.rpm / tuning.gearbox.redlineRpm);
      readings.gear.value = engine.reversing ? -1 : electric ? 13 : engine.gear + 1;
      const minutes = Math.floor(hour * 60) % (24 * 60);
      readings.clock.value = Math.floor(minutes / 60) * 100 + (minutes % 60);
      readings.outside.value = Math.round(shownUnits === "metric" ? outsideC : outsideC * 1.8 + 32);
      wheelTurn.angle.value = -car.steer * radiansPerSteer;
    },
    setUnits(next: Units) {
      if (next === shownUnits) return;
      shownUnits = next;
      const old = sheet;
      sheet = drawDialSheet(faces());
      setSheet(sheet);
      old.dispose();
      fit();
    },
    dispose() {
      geometry.dispose();
      shell.dispose();
      material.dispose();
      insideGlass?.material.dispose();
      sheet.dispose();
    },
  };
}

export type Cockpit = ReturnType<typeof createCockpit>;
