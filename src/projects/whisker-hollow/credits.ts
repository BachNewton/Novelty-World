import { LICENSES, type Credit } from "@/shared/lib/credits";
import { POLY_AUTHOR, POLY_MODELS } from "./models/poly-models";

/** The players' caretaker: the one model that isn't Poly by Google's. */
const CARETAKER_CREDIT: Credit = {
  work: "Character Animated 3D model",
  author: "Quaternius",
  license: LICENSES["cc0-1.0"],
  source: "https://poly.pizza/m/DgOCW9ZCRJ",
  attribution: "",
};

const POLY_CREDITS: readonly Credit[] = POLY_MODELS.map((model) => ({
  work: `${model.title} 3D model`,
  author: POLY_AUTHOR,
  license: LICENSES["cc-by-3.0"],
  source: model.page,
  attribution: `${model.title} by ${POLY_AUTHOR}, ${LICENSES["cc-by-3.0"].name}`,
}));

export const WHISKER_HOLLOW_CREDITS: readonly Credit[] = [CARETAKER_CREDIT, ...POLY_CREDITS];
