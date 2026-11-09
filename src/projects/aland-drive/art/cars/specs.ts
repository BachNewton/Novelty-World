import { CAR_IDS, type CarId } from "../../sim/cars";
import type { CarSpec } from "./build";
import { altura } from "./models/altura";
import { ankar } from "./models/ankar";
import { aska } from "./models/aska";
import { blixt } from "./models/blixt";
import { berg } from "./models/berg";
import { bris } from "./models/bris";
import { brus } from "./models/brus";
import { dyning } from "./models/dyning";
import { fjard } from "./models/fjard";
import { frost } from "./models/frost";
import { flod } from "./models/flod";
import { grus } from "./models/grus";
import { gnista } from "./models/gnista";
import { hagel } from "./models/hagel";
import { holm } from "./models/holm";
import { kobb } from "./models/kobb";
import { lera } from "./models/lera";
import { orkan } from "./models/orkan";
import { rimfrost } from "./models/rimfrost";
import { ljus } from "./models/ljus";
import { salta } from "./models/salta";
import { skerryGt } from "./models/skerry-gt";
import { span } from "./models/span";
import { sten } from "./models/sten";
import { strimma } from "./models/strimma";
import { strom } from "./models/strom";
import { sund } from "./models/sund";
import { varg } from "./models/varg";
import { vik } from "./models/vik";
import { roundLamps, sketched, stripe, type Sketch } from "./recipe";

/*
 * The cars, each a set of numbers on the shared recipe (`recipe.ts`). A car a
 * player can drive has its art in a file of its own (`models/<id>.ts`) and a
 * line here, under its tier as the simulation has it (`sim/cars.ts`); the cars
 * of the world, which nobody drives, are all here.
 */

/** Every drivable car's art, under its tier: a new car's line goes under its tier's header. */
const MODELS: Readonly<Record<CarId, CarSpec>> = {
  // A1
  aska,
  blixt,
  // A2
  orkan,
  varg,
  // A3
  dyning,
  span,
  strimma,
  // A4
  brus,
  sund,
  flod,
  // A5
  "skerry-gt": skerryGt,
  strom,
  ankar,
  // A6
  bris,
  sten,
  // A7
  ljus,
  // B1
  grus,
  gnista,
  hagel,
  // B2
  fjard,
  lera,
  // B3
  holm,
  // B4
  berg,
  // C1
  frost,
  altura,
  // C2
  rimfrost,
  // C3
  vik,
  // C4
  salta,
  // Outside the tiers
  kobb,
};

/** Cars a player can drive, with a hero model and a world model each, in the simulation's order. */
export const CARS: readonly CarSpec[] = CAR_IDS.map((id) => MODELS[id]);

/** The sports fastback the game starts in. */
export const PLAYER_CAR: CarSpec = skerryGt;

/** Cars of the world, which nobody drives. */
const WORLD: readonly Sketch[] = [
  { name: "Raggare", paint: "car-paint-cream", livery: true, size: [5.5, 1.98, 1.42], base: 3.05, radius: 0.36, tyre: 0.215, sill: 0.2, hood: 0.92, screen: [-0.8, -0.2, 0.9], tail: "notch", nose: "round", rake: 0.3, rim: 0.56, spokes: 9, belt: 0.06, decals: [...roundLamps(0.68, 0.74, 0.17), { on: "front", at: [0, 0.34], size: [1.9, 0.09], surface: "rim", cells: [6, 1] }, { on: "rear", at: [0, 0.36], size: [1.9, 0.09], surface: "rim", cells: [6, 1] }, stripe(0.03, 0, 0.72, 4.8)], blocks: [{ at: [0.86, 1.02, 2.2], size: [0.1, 0.34, 1.1], surface: "paint", mirror: true, taper: [0.5, 0.2] }] },
  { name: "Myra", paint: "car-paint-sky", size: [2.75, 1.46, 1.52], base: 1.75, radius: 0.24, tyre: 0.145, sill: 0.17, hood: 0.8, screen: [-0.72, -0.26, 1.05], tail: "upright", nose: "paint", rake: 0.5, rim: 0.56 },
  { name: "Brev", paint: "car-paint-post", livery: true, size: [4.6, 1.84, 2.0], base: 2.8, radius: 0.33, tyre: 0.205, sill: 0.24, hood: 1.16, screen: [-1.42, -0.66, 2.1], tail: "box", nose: "paint", rake: 0.7, rim: 0.56, decals: [stripe(0.22, 0.5, 1.2, 2.8)] },
  { name: "Åker", paint: "car-paint-grey", size: [5.0, 1.84, 1.72], base: 3.0, radius: 0.36, tyre: 0.215, sill: 0.34, hood: 1.08, screen: [-0.86, -0.3, 0.68], tail: "bed", nose: "grille", rake: 0.3, rim: 0.55 },
  { name: "Droska", paint: "car-paint-black", livery: true, size: [4.8, 1.84, 1.47], base: 2.82, radius: 0.33, tyre: 0.215, sill: 0.2, hood: 0.92, screen: [-0.95, -0.22, 1.0], tail: "notch", nose: "grille", rake: 0.5, blocks: [{ at: [0, 1.53, 0.35], size: [0.56, 0.12, 0.16], surface: "plate" }] },
  { name: "Vakt", paint: "car-paint-white", livery: true, size: [4.8, 1.86, 1.52], base: 2.8, radius: 0.33, tyre: 0.225, sill: 0.2, hood: 0.93, screen: [-1.0, -0.25, 1.95], tail: "upright", nose: "paint", rake: 0.9, decals: [stripe(0.26, 0, 0.66, 4.2)], blocks: [{ at: [0, 1.57, 0.3], size: [1.05, 0.09, 0.26], surface: "stripe" }] },
  { name: "Pärla", paint: "car-paint-silver", size: [3.55, 1.64, 1.5], base: 2.34, radius: 0.29, tyre: 0.175, sill: 0.2, hood: 0.86, screen: [-0.98, -0.3, 1.32], tail: "upright", nose: "paint", rake: 1 },
  { name: "Nio", paint: "car-paint-silver", size: [4.0, 1.68, 1.42], base: 2.48, radius: 0.3, tyre: 0.185, sill: 0.2, hood: 0.86, screen: [-0.92, -0.24, 1.3], tail: "upright", nose: "grille", rake: 0.4 },
  { name: "Tusen", paint: "car-paint-silver", size: [4.2, 1.76, 1.48], base: 2.58, radius: 0.31, tyre: 0.195, sill: 0.2, hood: 0.92, screen: [-1.05, -0.28, 1.4], tail: "upright", nose: "slit", rake: 1 },
  { name: "Nu", paint: "car-paint-silver", size: [4.3, 1.8, 1.46], base: 2.66, radius: 0.325, tyre: 0.215, sill: 0.19, hood: 0.94, screen: [-1.0, -0.2, 1.3], tail: "upright", nose: "grille", rake: 1.2 },
  { name: "Rad", paint: "car-paint-silver", size: [4.7, 1.82, 1.46], base: 2.76, radius: 0.325, tyre: 0.215, sill: 0.2, hood: 0.92, screen: [-0.96, -0.22, 0.98], tail: "notch", nose: "slit", rake: 1 },
  { name: "Stig", paint: "car-paint-silver", size: [4.4, 1.84, 1.62], base: 2.66, radius: 0.345, tyre: 0.225, sill: 0.28, hood: 1.02, screen: [-1.02, -0.28, 1.5], tail: "upright", nose: "grille", rake: 0.8, roofBars: true },
  { name: "Långa", paint: "car-paint-silver", size: [4.75, 1.84, 1.5], base: 2.78, radius: 0.325, tyre: 0.215, sill: 0.2, hood: 0.92, screen: [-1.0, -0.24, 1.95], tail: "upright", nose: "slit", rake: 0.9, roofBars: true },
  { name: "Flock", paint: "car-paint-silver", size: [4.65, 1.84, 1.72], base: 2.82, radius: 0.33, tyre: 0.215, sill: 0.2, hood: 1.0, screen: [-1.42, -0.62, 1.92], tail: "upright", nose: "paint", rake: 1 },
  { name: "Gammal", paint: "car-paint-silver", size: [4.5, 1.7, 1.42], base: 2.62, radius: 0.3, tyre: 0.185, sill: 0.2, hood: 0.86, screen: [-0.9, -0.26, 0.92], tail: "notch", nose: "grille", rake: 0.2 },
  { name: "Bud", paint: "car-paint-white", size: [4.3, 1.76, 1.8], base: 2.72, radius: 0.31, tyre: 0.195, sill: 0.22, hood: 1.0, screen: [-1.2, -0.46, 1.95], tail: "box", nose: "paint", rake: 0.8 },
  { name: "Verk", paint: "car-paint-white", size: [5.0, 1.84, 1.7], base: 3.0, radius: 0.35, tyre: 0.225, sill: 0.3, hood: 1.04, screen: [-0.9, -0.28, 0.66], tail: "bed", nose: "paint", rake: 0.5 },
  { name: "Puls", paint: "car-paint-silver", size: [3.9, 1.76, 1.54], base: 2.56, radius: 0.32, tyre: 0.195, sill: 0.2, hood: 0.92, screen: [-1.06, -0.3, 1.2], tail: "upright", nose: "smooth", rake: 1.2, rim: 0.72 },
];

/** Cars only ever seen in the world: a world model and a stand-in. */
export const WORLD_CARS: readonly CarSpec[] = WORLD.map(sketched);
