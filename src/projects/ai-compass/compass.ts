/** A third of one axis: 0 is the low end, 2 the high end. */
export type Level = 0 | 1 | 2;

export const LEVELS: readonly Level[] = [0, 1, 2];

/** A place on the compass. Both axes run from 0 (low) to 1 (high), so a
 *  person lands anywhere on the plane, not just in one of its nine regions. */
export interface Point {
  scope: number;
  ownership: number;
}

export interface ScopeColumn {
  name: string;
  /** The column's word as it reads in a region's name ("Steered pairing"). */
  regionWord: string;
  /** The kinds of work handed over, lowest first. */
  rungs: string[];
}

export interface OwnershipRow {
  name: string;
  meaning: string;
}

/** Scope: the kinds of work you're comfortable handing to an AI. */
export const SCOPE: Record<Level, ScopeColumn> = {
  0: { name: "Ask", regionWord: "asking", rungs: ["Look things up", "Fill in small gaps"] },
  1: { name: "Pair", regionWord: "pairing", rungs: ["Write pieces: a function, a test, a refactor"] },
  2: { name: "Delegate", regionWord: "delegation", rungs: ["Build whole features", "Shape the system"] },
};

/** Ownership: what you do with what comes back. */
export const OWNERSHIP: Record<Level, OwnershipRow> = {
  2: { name: "Steered", meaning: "You direct it, and could explain and defend why the result is the way it is" },
  1: { name: "Checked", meaning: "You review what comes back before you take it" },
  0: { name: "Accepted", meaning: "You take what comes back as it is" },
};

export interface Region {
  scope: Level;
  ownership: Level;
  nickname: string;
  /** How someone here uses AI and the mindset behind it, said to them. */
  description: string;
  /** Things someone in this region would do, to recognise themselves by. */
  wouldDo: string[];
  /** Things they wouldn't, which would put them in another region. */
  wouldntDo: string[];
}

export type RegionPlace = Pick<Region, "scope" | "ownership">;

export function sameRegion(a: RegionPlace, b: RegionPlace): boolean {
  return a.scope === b.scope && a.ownership === b.ownership;
}

export function regionName(region: RegionPlace): string {
  return `${OWNERSHIP[region.ownership].name} ${SCOPE[region.scope].regionWord}`;
}

/** The middle of a third of an axis, from 0 to 1. */
export function levelCentre(level: Level): number {
  return (level + 0.5) / 3;
}

/** The middle of a region, as a point on the plane. */
export function regionCentre(region: RegionPlace): Point {
  return { scope: levelCentre(region.scope), ownership: levelCentre(region.ownership) };
}

export function regionAt(scope: Level, ownership: Level): Region {
  const region = REGIONS.find((r) => r.scope === scope && r.ownership === ownership);
  if (!region) throw new Error(`No compass region at scope ${scope}, ownership ${ownership}`);
  return region;
}

export const REGIONS: Region[] = [
  {
    scope: 0,
    ownership: 2,
    nickname: "Rubber duck",
    description:
      "You think with AI, not through it. It's a sounding board and a faster way to find answers, but the code stays yours: you take its ideas, never its output.",
    wouldDo: [
      "Ask what an error means, then write the fix yourself",
      "Ask for three approaches, pick one, and write it from scratch",
      "Have it point you to the right part of the docs, then read the docs",
    ],
    wouldntDo: ["Paste its code in as it is", "Let it write a whole function"],
  },
  {
    scope: 1,
    ownership: 2,
    nickname: "Navigator's seat",
    description:
      "You let AI write the pieces, but the design stays in your head. Every suggestion is a proposal to weigh, reshape or reject, and nothing lands that you couldn't explain.",
    wouldDo: [
      "Write the tests, have it fill in the function, and know why every line is there",
      "Reject and rework its suggestions until they match your design",
      "Ask it to justify a choice before you keep it",
    ],
    wouldntDo: ["Hand it a whole feature", "Commit a function you couldn't explain"],
  },
  {
    scope: 2,
    ownership: 2,
    nickname: "Director's chair",
    description:
      "You hand over whole features and keep the decisions. Your work is the plan, the constraints and the judgement: you may not read every line, but you know why each piece is there.",
    wouldDo: [
      "Write the plan and its constraints, let an agent build the feature, then challenge its design choices",
      "Own the architecture and the specs, and defend every decision without reading every line",
      "Have the agent explain its tradeoffs before you accept them",
    ],
    wouldntDo: ["Write the code yourself", "Accept a design you couldn't defend"],
  },
  {
    scope: 0,
    ownership: 1,
    nickname: "Smart autocomplete",
    description:
      "You use AI for small, quick help and keep an eye on it. Its suggestions are handy shortcuts, taken once they look right.",
    wouldDo: [
      "Accept an autocomplete suggestion after reading it",
      "Paste in a generated regex after trying it on a few cases",
      "Use an answer once it matches what the docs say",
    ],
    wouldntDo: ["Hand it a whole function to write", "Accept a suggestion without reading it"],
  },
  {
    scope: 1,
    ownership: 1,
    nickname: "Trust, but verify",
    description:
      "You let AI write real pieces of the work and treat it like a capable colleague whose work still gets reviewed. You check before you commit, without redesigning what it did.",
    wouldDo: [
      "Have it write a function, and read the diff before committing it",
      "Have it refactor a file, run the tests and skim the change",
    ],
    wouldntDo: ["Commit a diff you haven't read", "Hand it a whole feature"],
  },
  {
    scope: 2,
    ownership: 1,
    nickname: "Agent, then review",
    description:
      "You hand over whole features and judge the result rather than the process. The agent decides how; you decide whether it's good enough to merge.",
    wouldDo: [
      "Hand an agent a ticket, and check the result against its acceptance criteria",
      "Review the agent's pull request and try it out before merging",
    ],
    wouldntDo: ["Write the code yourself", "Merge without looking"],
  },
  {
    scope: 0,
    ownership: 0,
    nickname: "Tab, tab, tab",
    description:
      "You use AI for small things and don't think twice about them. The stakes feel low, so its answers go in as they come.",
    wouldDo: ["Tab through autocomplete without reading it", "Paste a one-liner from a chat answer straight in"],
    wouldntDo: ["Ask it to write anything bigger than a line or two", "Test or look into what it gave you"],
  },
  {
    scope: 1,
    ownership: 0,
    nickname: "Copy-paste coding",
    description:
      "You let AI write pieces of the work and measure them by whether they run. If it works, it's done.",
    wouldDo: [
      "Paste in a generated function and move on once it runs",
      "Let it write the tests for its own code, unread",
    ],
    wouldntDo: ["Read the diff", "Hand it a whole feature"],
  },
  {
    scope: 2,
    ownership: 0,
    nickname: "Vibe coding",
    description:
      "You hand over the whole build and focus on the idea. The code is the AI's business; what matters is that the result does what you wanted.",
    wouldDo: [
      "Describe an app in one prompt and ship what comes back",
      "Keep telling it “fix it” until the errors stop",
    ],
    wouldntDo: ["Read the code", "Plan the architecture first"],
  },
];
