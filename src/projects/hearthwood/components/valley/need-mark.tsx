import { Mail } from "lucide-react";
import { generateCat } from "../../cats/cat";
import { generateDog } from "../../dogs/dog";
import { isAnyOfAWay } from "../../gameplay/help";
import type { Request } from "../../stories/story";
import { catPortrait, dogPortrait } from "../../art/portrait";
import { BrewFormIcon, BrewIcon, brewName } from "./brewing-icons";
import { CompanionPortrait } from "./companion-portrait";
import { CookwareIcon, DishIcon, dishName } from "./cooking-icons";
import { ForageIcon, FORAGE_NAMES } from "./forage-icons";

/*
 * What someone asked Elliott for, as a small drawing: the dish (or the pot,
 * for anything warm), the brew (or its empty vessel, for any of a way), the
 * forage with how many, the lost animal's face, or the note. Shown in the
 * journal and on the storybook panel while it is still to do.
 */

const BREW_WAYS = { tea: "Any tea", salve: "Any salve" } as const;

export function NeedMark({ request, lostSeed, size = "size-7" }: { request: Request; lostSeed: string | null; size?: string }) {
  switch (request.kind) {
    case "dish":
      return request.dish === "warm" ? (
        <span title="Something warm from the pot" className="inline-flex">
          <CookwareIcon cookware="pot" className={size} />
        </span>
      ) : (
        <span title={dishName(request.dish)} className="inline-flex">
          <DishIcon dish={request.dish} className={size} />
        </span>
      );
    case "brew": {
      const wanted = request.brew;
      return isAnyOfAWay(wanted) ? (
        <span title={BREW_WAYS[wanted]} className="inline-flex">
          <BrewFormIcon form={wanted} className={size} />
        </span>
      ) : (
        <span title={brewName(wanted)} className="inline-flex">
          <BrewIcon brew={wanted} className={size} />
        </span>
      );
    }
    case "forage":
      return (
        <span className="flex items-center" title={`${request.count} of ${request.foods.map((f) => FORAGE_NAMES[f].toLowerCase()).join(", ")}`}>
          <ForageIcon kind={request.foods[0]} className={size} />
          <span className="text-xs font-bold tabular-nums">{request.count}</span>
        </span>
      );
    case "pet": {
      if (lostSeed === null) throw new Error("A lost animal asked for has no seed to draw it from");
      const portrait = request.species === "cat" ? catPortrait(generateCat(lostSeed)) : dogPortrait(generateDog(lostSeed));
      return (
        <span title="Lost, to find" className="inline-flex">
          <CompanionPortrait portrait={portrait} className={size} />
        </span>
      );
    }
    case "carry":
      return <Mail aria-label="A note to carry" className={size} />;
  }
}
