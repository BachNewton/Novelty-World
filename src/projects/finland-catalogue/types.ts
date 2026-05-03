/**
 * Finland Catalogue — schema for hand-picked travel ideas.
 *
 * Each Idea answers a planner's questions: when can I do this, how do I get
 * there, what will it cost, can I bring kids, what's it actually like? The
 * comments on each field describe the spirit so the add-finland-idea skill
 * knows what to research and how to populate it for very different idea
 * types — restaurants, day trips, multi-day adventures, festivals, etc.
 */

/** A date-locked event that recurs annually. Use ONLY for true date locks
 *  — festivals, holiday markets, eclipses — not soft "best in late summer"
 *  ranges (use `suitableMonths` for those). The from/to are "MM-DD" format
 *  without a year; assume the date pattern recurs each year. */
export interface IdeaEvent {
  /** Start of the event window, "MM-DD". e.g. "06-21". */
  from: string;
  /** End of the event window inclusive, "MM-DD". For a single-day event,
   *  set to the same value as from. */
  to: string;
  /** Optional event name. e.g. "Helsinki Festival", "Lux Helsinki". */
  name?: string;
}

/** Calendar/season constraints. The mindset: "if I'm planning a visit, what
 *  do I need to know about timing to fit this into my trip?" */
export interface IdeaAvailability {
  /** Months (1 = Jan, 12 = Dec) when this idea is well-suited. This is the
   *  soft planning window — a husky safari with `[12, 1, 2, 3]` is sayng
   *  "Dec through Mar are the months snow is reliable enough"; a museum
   *  open all year uses all 12. The UI derives a friendly summary
   *  ("Dec–Mar", "Jun–Aug", "Year-round") from this array.
   *
   *  Be precise: research the actual months (snow reliability, daylight,
   *  aurora visibility, festival timing) rather than defaulting to broad
   *  season buckets. */
  suitableMonths: number[];
  /** Date-locked events that recur annually. Empty/omitted for everything
   *  that isn't a true date lock. See IdeaEvent comment for guidance. */
  events?: IdeaEvent[];
  /** Day-of-week or hours-of-day constraints. e.g. "Wed-Sun, 10am-6pm",
   *  "Closed Mondays". Omit if open daily without restriction. */
  weeklySchedule?: string;
  /** Anything else a planner needs to know about timing that doesn't fit
   *  the structured fields above. e.g. "February has the most reliable
   *  snow", "Avoid Mondays — many places close". */
  notes?: string;
}

/** Where the idea takes place. */
export interface IdeaLocation {
  /** Broad regions this idea belongs to. The filter UI derives its
   *  region chips from whatever values appear here across IDEAS, so a
   *  new region added to an idea surfaces as a filter chip automatically.
   *  An idea can authentically belong to more than one region — a venue
   *  inside a named district that itself functions as a destination, an
   *  activity that crosses cities, or a specific place that also sits
   *  inside a broader region whose own chip is meaningful for planners.
   *  Reuse existing region strings when an idea genuinely fits one; only
   *  introduce a new region when an idea genuinely doesn't belong in any
   *  existing one. Use `["Anywhere in Finland"]` for ideas with no place
   *  at all (e.g. "go foraging"). */
  region: string[];
  /** Street address if it's a specific venue. Skip for region-wide
   *  activities or events that move year to year. */
  address?: string;
}

/** How you get there from Lauttasaari, the residential island in western
 *  Helsinki where the trip is based (one metro stop / ~6 min from Helsinki
 *  Central). The mindset: "is this trivial to reach, or does it need real
 *  planning?" — not the specific transit modes. Lauttasaari sits on the M1/M2
 *  metro line, so most central-Helsinki destinations are a short metro ride
 *  away; long-distance trips typically begin with a metro hop to Helsinki
 *  Central for the VR train or to a ferry terminal. Disregard flying as a
 *  mode of transit — even when an airport route exists, describe the
 *  ground-transport alternative instead. */
export interface IdeaAccess {
  /** Planning effort and journey complexity. This is *not* about how long
   *  the trip takes (`duration` already covers that) — it's about how
   *  many transfers are needed, how sparse the transit options are, and
   *  how much advance planning the route demands.
   *  - 'simple'   = direct walk, single tram, single bus, or a metro hop
   *                 with at most one short connecting walk — no transfers
   *  - 'moderate' = one transfer (e.g. metro + tram, or metro + train to
   *                 a nearby city)
   *  - 'complex'  = multiple transfers, sparse/limited transit windows,
   *                 requires car rental, or needs material advance
   *                 planning (booked-out tours, ticketed connections that
   *                 don't run frequently). A 12h overnight train with no
   *                 transfers is NOT complex — it's just long. */
  complexity: "simple" | "moderate" | "complex";
  /** Total realistic one-way travel time from Lauttasaari, including
   *  transfers. e.g. "15 min", "~1 hour", "Overnight train (12h) + 30min
   *  taxi". Anything 3h+ each way effectively means a multi-day trip —
   *  flag that in notes. */
  duration: string;
  /** Concrete how-to from Lauttasaari: specific lines, transfer points,
   *  rental needs, ferry schedules, etc. e.g. "Bus 21V to Ruoholahti, then
   *  tram 7 to West Terminal", "Metro to Helsinki Central, then VR train
   *  to Rovaniemi (~8h)". Don't include flight options. */
  notes: string;
}

/** Money. Currency is always EUR — Finland. */
export interface IdeaCost {
  /** Best-guess EUR per adult. Use 0 for free. If the cost is highly
   *  variable (e.g. "anywhere from €20 to €200 depending on package"),
   *  pick a typical number and explain the spread in notes. The goal is
   *  to set the right budget mindset, not to be precise. */
  perPersonEur: number;
  /** Anything that affects what people will actually pay: package tiers,
   *  rental costs on top of entry, "free entry but plan to spend €20 on
   *  food", child discounts, etc. */
  notes?: string;
}

/** How far ahead this needs to be reserved. */
export interface IdeaBooking {
  /** Realistic booking horizon.
   *  - 'same-day' = walk-in or book that morning
   *  - 'few-days' = a few days ahead is enough
   *  - 'weeks'    = book 1-3 weeks ahead, especially in peak season
   *  - 'months'   = highly limited or popular, book months out
   *                 (e.g. glass igloos, Christmas-season Lapland tours) */
  leadTime: "same-day" | "few-days" | "weeks" | "months";
  /** Caveats. e.g. "Walk-in fine off-season, weeks ahead in summer",
   *  "Required to reserve sauna time slot online". */
  notes?: string;
}

/** A catalogued thing-to-do in Finland. */
export interface Idea {
  /** URL-safe identifier, kebab-case. Used in the detail page route. */
  slug: string;

  /** Display name. Concrete is better — "Allas Sea Pool" beats
   *  "A nice sauna spot near the harbour". */
  title: string;

  /** One sentence that fits on a card. The hook — what makes this worth
   *  doing, in plain language. */
  shortDescription: string;

  /** Detail-page paragraphs. Cover what it actually is, what to expect,
   *  why it's worth your time, and any practical tips. Each array entry
   *  is one paragraph. Aim for 2-4 paragraphs. */
  longDescription: string[];

  /** Hotlinked URL of the headline image. Shown on the card and again as
   *  the first image on the detail page. Pick the most evocative shot you
   *  can find — this sells the idea at a glance. */
  thumbnailUrl: string;

  /** 1-10 additional hotlinked images shown in a carousel on the detail
   *  page. Aim for 3-5 unless the place really warrants more. Vary the
   *  angles — exterior, interior, food, scenery, people enjoying it. */
  galleryUrls: string[];

  availability: IdeaAvailability;
  location: IdeaLocation;
  accessFromLauttasaari: IdeaAccess;
  cost: IdeaCost;
  booking: IdeaBooking;

  /** Ideal / suitable age range of children for this idea. Omit entirely
   *  if the idea is not well-suited to children at all (fancy late-night
   *  restaurants, serious multi-day hiking, adult-only saunas, bars).
   *  When present, `min` is the youngest age that can comfortably enjoy
   *  it; `max` is the oldest age that still finds it engaging — omit
   *  `max` when there is no upper bound (libraries, museums, parks).
   *  The presence of this object is itself the "children-friendly"
   *  signal. When unsure, err toward omitting it and explain in
   *  `childrenNotes`. */
  suitableAgeRange?: { min: number; max?: number };
  /** Caveats about visiting with kids — applies whether or not
   *  `suitableAgeRange` is set. e.g. "Stroller-unfriendly trail — bring
   *  a carrier", "No high chairs but kid-friendly menu", "Loud crowds
   *  may overwhelm under-3s even though they're allowed". */
  childrenNotes?: string;

  /** Where you'll spend most of your time. "mixed" if it genuinely splits
   *  (e.g. a sauna with outdoor pools, a museum with a courtyard). */
  indoorOutdoor: "indoor" | "outdoor" | "mixed";

  /** How physically demanding it is.
   *  - 'low'      = sitting, walking on flat paths, eating
   *  - 'moderate' = sustained walking, light hiking, swimming, skating
   *  - 'high'     = serious hiking, cross-country skiing, multi-hour
   *                 active sport */
  physicalIntensity: "low" | "moderate" | "high";

  /** Realistic time on-site, excluding travel from Lauttasaari. */
  duration: "<1h" | "1-3h" | "half-day" | "full-day" | "multi-day";

  /** Official website or booking page. Omit if there isn't a real one —
   *  do not link random blog posts or aggregator listings. */
  website?: string;

  /** Short freeform labels for grouping. Currently the only canonical tag
   *  is 'food' (cafes, restaurants, food markets, food experiences). New
   *  tags should only be added when a clear grouping has emerged across
   *  multiple ideas; the skill suggests new tags rather than inventing
   *  them ad-hoc. */
  tags: string[];
}
