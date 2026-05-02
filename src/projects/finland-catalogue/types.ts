/**
 * Finland Catalogue — schema for hand-picked travel ideas.
 *
 * Each Idea answers a planner's questions: when can I do this, how do I get
 * there, what will it cost, can I bring kids, what's it actually like? The
 * comments on each field describe the spirit so the add-finland-idea skill
 * knows what to research and how to populate it for very different idea
 * types — restaurants, day trips, multi-day adventures, festivals, etc.
 */

/** Calendar/season constraints. The mindset: "if I'm planning a visit, what
 *  do I need to know about timing to fit this into my trip?" */
export interface IdeaAvailability {
  /** When this is available. "year-round" if open all year. Otherwise a list
   *  of seasons. Finnish "winter" is roughly Nov-Mar; "summer" is Jun-Aug. */
  seasons: "year-round" | ("winter" | "spring" | "summer" | "fall")[];
  /** Day-of-week or hours-of-day constraints. e.g. "Wed-Sun, 10am-6pm",
   *  "Closed Mondays". Omit if open daily without restriction. */
  weeklySchedule?: string;
  /** For events that only happen on specific dates. e.g.
   *  "Mid-July annually (Helsinki Festival)", "Dec 24-26".
   *  Omit unless the activity is actually date-locked. */
  specificDates?: string;
  /** Anything else a planner needs to know about timing that doesn't fit
   *  the structured fields above. */
  notes?: string;
}

/** Where the idea takes place. */
export interface IdeaLocation {
  /** Broad region. Use "Helsinki" for the metro area, otherwise the Finnish
   *  region or city ("Lapland", "Turku", "Finnish Lakeland"). Use
   *  "Anywhere in Finland" for non-place-specific ideas (e.g. "go foraging"). */
  region: string;
  /** Street address if it's a specific venue. Skip for region-wide
   *  activities or events that move year to year. */
  address?: string;
}

/** How you get there from Helsinki. The mindset: "is this trivial to reach,
 *  or does it need real planning?" — not the specific transit modes. */
export interface IdeaAccess {
  /** Planning effort and journey complexity.
   *  - 'simple'   = direct walk, single tram, single bus — no transfers
   *  - 'moderate' = one transfer, or a longer single ride (e.g. train to
   *                 a nearby city)
   *  - 'complex'  = multiple transfers, long travel time, requires car
   *                 rental, advance ticket booking, or a full-day journey */
  complexity: "simple" | "moderate" | "complex";
  /** Total realistic one-way travel time, including transfers. e.g.
   *  "15 min", "~1 hour", "Overnight train (12h) + 30min taxi". Anything
   *  3h+ each way effectively means a multi-day trip — flag that in notes. */
  duration: string;
  /** Concrete how-to: specific lines, transfer points, rental needs,
   *  ferry schedules, etc. e.g. "Tram 4 from Central Station",
   *  "Train to Rovaniemi (~8h), then 30min taxi to lodge". */
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
  accessFromHelsinki: IdeaAccess;
  cost: IdeaCost;
  booking: IdeaBooking;

  /** True if a 2-5 year old can comfortably do this without the family
   *  having to work around major obstacles. Fancy restaurants, intense
   *  hikes, late-night events = false. A flat forest trail with a
   *  playground = true. When unsure, err toward false and explain. */
  toddlerFriendly: boolean;
  /** Caveats either way. e.g. "Yes, but stroller-unfriendly trail —
   *  bring a carrier", "No high chairs but kid-friendly menu". */
  toddlerNotes?: string;

  /** Where you'll spend most of your time. "mixed" if it genuinely splits
   *  (e.g. a sauna with outdoor pools, a museum with a courtyard). */
  indoorOutdoor: "indoor" | "outdoor" | "mixed";

  /** How physically demanding it is.
   *  - 'low'      = sitting, walking on flat paths, eating
   *  - 'moderate' = sustained walking, light hiking, swimming, skating
   *  - 'high'     = serious hiking, cross-country skiing, multi-hour
   *                 active sport */
  physicalIntensity: "low" | "moderate" | "high";

  /** Realistic time on-site, excluding travel from Helsinki. */
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
