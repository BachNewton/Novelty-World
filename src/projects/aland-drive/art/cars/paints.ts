/*
 * A drivable car's paints: the colours it can be had in, each with its finish, the first its default. The player picks
 * one per car (`garage/paint.ts`), and it travels to every other player as its index in the car's list
 * (`CarState.paint`), so the list is the car's own and only ever grows at its end. Pure data: the menu reads it as
 * readily as the shader does.
 */

/**
 * How the coat takes the light. Solid: a plain glossy lacquer, the sky along its doors. Metallic: a tighter, brighter
 * highlight and flakes that lift at a glancing angle. Matte: soft and wide, with no reflection of the horizon. Pearl: a
 * glossy coat whose colour turns towards its flip colour at a glancing angle.
 */
export type PaintFinish = "solid" | "metallic" | "matte" | "pearl";

export const PAINT_FINISHES: readonly PaintFinish[] = ["solid", "metallic", "matte", "pearl"];

export interface CarPaint {
  /** A paint token, without the `--color-aland-drive-` prefix. */
  colour: string;
  finish: PaintFinish;
  /** The colour of the car's stripes, for a car whose body has any: its own default stripe colour when left out. */
  stripe?: string;
  /** A pearl's colour at a glancing angle. */
  flip?: string;
}

/** A car's stripes when its paint names none. */
export const DEFAULT_STRIPE = "car-stripe-blue";

/** One line of a car's paint list. */
export const paint = (colour: string, finish: PaintFinish = "solid", extra: Pick<CarPaint, "stripe" | "flip"> = {}): CarPaint => ({ colour, finish, ...extra });

/** A car's paint by its index, or its default for an index that isn't one of its own: another version's, or none. */
export function paintAt(paints: readonly CarPaint[], index: number | undefined): CarPaint {
  if (paints.length === 0) throw new Error("a car with no paints");
  return index !== undefined && Number.isInteger(index) && index >= 0 && index < paints.length ? paints[index] : paints[0];
}

/** The index a car is drawn in: its default's for anything that isn't one of its own. */
export const paintIndex = (paints: readonly CarPaint[], index: number | undefined): number => paints.indexOf(paintAt(paints, index));

const FINISH_NAMES: Record<PaintFinish, string> = { solid: "gloss", metallic: "metallic", matte: "matte", pearl: "pearl" };

const words = (token: string) => {
  const name = token.replace(/^car-(paint|stripe)-/, "").replace(/-/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** A paint as it's spoken, from its tokens: "Teal metallic", "White gloss with red stripes". */
export function paintName({ colour, finish, stripe }: CarPaint): string {
  const named = `${words(colour)} ${FINISH_NAMES[finish]}`;
  return stripe === undefined ? named : `${named} with ${words(stripe).toLowerCase()} stripes`;
}

/** The paint a link asks for (`?paint=2`, or a paint's colour, `?paint=teal`), or null when it asks for none. */
export function paintAsked(search: string, paints: readonly CarPaint[]): number | null {
  const asked = new URLSearchParams(search).get("paint");
  if (asked === null) return null;
  const index = /^\d+$/.test(asked) ? Number(asked) : paints.findIndex(({ colour }) => colour === asked || colour === `car-paint-${asked}`);
  if (index < 0 || index >= paints.length) throw new Error(`?paint= takes 0 to ${paints.length - 1} or one of ${paints.map(({ colour }) => colour.replace(/^car-paint-/, "")).join(", ")}, not ${asked}`);
  return index;
}

/** A car's paints: a drivable car's own list, or its one paint, solid, for a car of the world. */
export const paintsOf = (spec: { paint: string; paints?: readonly CarPaint[] }): readonly CarPaint[] => spec.paints ?? [paint(spec.paint)];
