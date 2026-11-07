import type { Point } from "./compass";

export type Axis = keyof Point;

/** How much a mistake would cost in a statement's scene. */
export type Stakes = "low" | "mid" | "high";
export const STAKES: readonly Stakes[] = ["low", "mid", "high"];

/** The answers to a statement, from strongly disagree (0) to strongly agree (4). */
export const ANSWERS = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"] as const;
export type Answer = 0 | 1 | 2 | 3 | 4;

export interface Statement {
  id: string;
  axis: Axis;
  stakes: Stakes;
  /** Whether agreeing moves a person up the axis (+1) or down it (-1). */
  direction: 1 | -1;
  /** A situation to imagine, so the answer doesn't depend on the work the
   *  person happens to do: nobody needs to have written payment code to say
   *  what they'd be comfortable doing with it. */
  scene: string;
  text: string;
}

type Draft = Omit<Statement, "axis" | "stakes">;

/** Per axis and tier, three statements each way, so agreeing with
 *  everything lands in the middle. Ownership scenes are about what happens
 *  to what AI hands back, never about how much is handed over. */
const SCOPE: Record<Stakes, Draft[]> = {
  low: [
    { id: "s-low-component", direction: 1, scene: "Imagine adding a small feature to a personal project.", text: "I'd let AI write all of it." },
    { id: "s-low-scaffold", direction: 1, scene: "Imagine you're starting a weekend side project.", text: "I'd have AI set up the whole project before I write a line." },
    { id: "s-low-script", direction: 1, scene: "Imagine you need a one-off script that makes smaller copies of your holiday photos.", text: "I'd have AI write the whole script." },
    { id: "s-low-css", direction: -1, scene: "Imagine tweaking how a chart looks in your own data notebook.", text: "I'd rather make the changes myself than describe them to AI." },
    { id: "s-low-learn", direction: -1, scene: "Imagine you're learning a new library for fun.", text: "I'd ask AI to explain it, but write the code myself." },
    { id: "s-low-autocomplete", direction: -1, scene: "Imagine you're building a small game just for yourself.", text: "I'd use AI for autocomplete at most." },
  ],
  mid: [
    { id: "s-mid-ticket", direction: 1, scene: "Imagine a ticket to add a new export format to a command-line tool your team uses.", text: "I'd hand the whole ticket to an AI agent." },
    { id: "s-mid-tests", direction: 1, scene: "Imagine the nightly job at work that turns raw sales figures into reports. It has no tests.", text: "I'd let AI write the whole test suite for it." },
    { id: "s-mid-refactor", direction: 1, scene: "Imagine switching your team's app from one logging library to another, a change spread across dozens of files.", text: "I'd let AI make all the changes." },
    { id: "s-mid-design", direction: -1, scene: "Imagine designing how a new service at work talks to the existing ones.", text: "I'd work out the design myself rather than ask AI for one." },
    { id: "s-mid-bug", direction: -1, scene: "Imagine a bug your colleagues have reported in an internal tool.", text: "I'd find and fix it myself, using AI only to look things up." },
    { id: "s-mid-libraries", direction: -1, scene: "Imagine choosing the libraries for a new project at work.", text: "I'd pick them myself rather than let AI choose." },
  ],
  high: [
    { id: "s-high-checkout", direction: 1, scene: "Imagine a new checkout flow that charges customers' cards.", text: "I'd let AI write most of the code." },
    { id: "s-high-login", direction: 1, scene: "Imagine the update process for firmware on a fleet of devices out in the field.", text: "I'd hand the whole job to an AI agent." },
    { id: "s-high-migration", direction: 1, scene: "Imagine a migration on a production database full of customer records.", text: "I'd let AI write the migration." },
    { id: "s-high-privacy", direction: -1, scene: "Imagine code that decides which personal data is shared with partners.", text: "I'd write that code myself." },
    { id: "s-high-infra", direction: -1, scene: "Imagine changing the infrastructure every service at your company runs on.", text: "I'd keep AI to small suggestions." },
    { id: "s-high-doses", direction: -1, scene: "Imagine software that calculates medicine doses.", text: "I'd use AI to explain things, but not to write the code." },
  ],
};

const OWNERSHIP: Record<Stakes, Draft[]> = {
  low: [
    { id: "o-low-read", direction: 1, scene: "Imagine AI made a quick visualisation for a personal data project.", text: "I'd read through its code before keeping it." },
    { id: "o-low-why", direction: 1, scene: "Imagine AI fixed a bug in a game you're making for fun.", text: "I'd want to know why its fix works." },
    { id: "o-low-reshape", direction: 1, scene: "Imagine AI wrote a small helper for your side project.", text: "I'd rework it until it reads the way I'd have written it." },
    { id: "o-low-runs", direction: -1, scene: "Imagine AI wrote you a one-off script that counts the words in your notes.", text: "If it runs, I'd use it without reading it." },
    { id: "o-low-first", direction: -1, scene: "Imagine asking AI how to structure a small personal project.", text: "I'd go with its first suggestion." },
    { id: "o-low-fix-it", direction: -1, scene: "Imagine a prototype AI built for you throws an error.", text: "I'd tell it to fix it rather than look into why." },
  ],
  mid: [
    { id: "o-mid-review", direction: 1, scene: "Imagine an AI agent opens a pull request on your team's internal tool.", text: "I'd review it as carefully as a colleague's." },
    { id: "o-mid-rules", direction: 1, scene: "Imagine handing a feature at work to an AI agent.", text: "I'd set out the rules it must follow before it starts." },
    { id: "o-mid-explain", direction: 1, scene: "Imagine AI split one overgrown file in your team's scheduling tool into several smaller ones.", text: "I could explain every change it made to a colleague." },
    { id: "o-mid-tests-pass", direction: -1, scene: "Imagine AI changed a screen in your company's mobile app, and the tests pass.", text: "I'd merge it without reading the change." },
    { id: "o-mid-naming", direction: -1, scene: "Imagine AI added a holiday-booking feature to your company's staff app.", text: "I'd keep the way it organised the code without questioning it." },
    { id: "o-mid-done", direction: -1, scene: "Imagine AI working through a ticket for you at work.", text: "I'd let it decide when the work is finished." },
  ],
  high: [
    { id: "o-high-understand", direction: 1, scene: "Imagine AI wrote the software that moves a factory robot working next to people.", text: "I'd understand how all of it works before it ships." },
    { id: "o-high-justify", direction: 1, scene: "Imagine AI proposes how to store users' passwords.", text: "I'd make it justify its choices before accepting them." },
    { id: "o-high-sources", direction: 1, scene: "Imagine AI explains how a privacy law applies to your code.", text: "I'd check what it says against the law itself or other sources." },
    { id: "o-high-copy", direction: -1, scene: "Imagine AI wrote a script that updates records in a hospital's patient system, and it ran cleanly on a test copy.", text: "I'd run it on the real system without reading it." },
    { id: "o-high-security", direction: -1, scene: "Imagine AI wrote a security fix you don't fully understand.", text: "I'd ship it if it seems to work." },
    { id: "o-high-finished", direction: -1, scene: "Imagine an AI agent says its change to the software that routes emergency calls is finished.", text: "I'd take its word for it." },
  ],
};

/** Neighbouring statements alternate between the axes, cycle through the
 *  stakes and mix their directions, so none gives the next away. */
const ORDER = [0, 3, 1, 4, 2, 5];

export const STATEMENTS: Statement[] = ORDER.flatMap((i) =>
  STAKES.flatMap((stakes) => [
    { ...SCOPE[stakes][i], axis: "scope" as const, stakes },
    { ...OWNERSHIP[stakes][i], axis: "ownership" as const, stakes },
  ]),
);

export type Answers = Partial<Record<string, Answer>>;

/** Each axis is the mean of its statements' answers, 0 to 1, with a disagreed
 *  reversed statement counting like an agreed one, and "Neutral" in the
 *  middle. */
function score(answers: Answers, statements: Statement[]): Point {
  const sums: Record<Axis, { total: number; count: number }> = {
    scope: { total: 0, count: 0 },
    ownership: { total: 0, count: 0 },
  };
  for (const statement of statements) {
    const answer = answers[statement.id];
    if (answer === undefined) continue;
    const agreement = answer / 4;
    sums[statement.axis].total += statement.direction === 1 ? agreement : 1 - agreement;
    sums[statement.axis].count += 1;
  }
  const mean = ({ total, count }: { total: number; count: number }) => (count === 0 ? 0.5 : total / count);
  return { scope: mean(sums.scope), ownership: mean(sums.ownership) };
}

export function scoreAnswers(answers: Answers): Point {
  return score(answers, STATEMENTS);
}

/** Where the person sits on the scenes of each tier alone: how the way they
 *  work changes, or doesn't, with what is at stake. */
export function scoreByStakes(answers: Answers): Record<Stakes, Point> {
  return {
    low: score(answers, STATEMENTS.filter((s) => s.stakes === "low")),
    mid: score(answers, STATEMENTS.filter((s) => s.stakes === "mid")),
    high: score(answers, STATEMENTS.filter((s) => s.stakes === "high")),
  };
}
