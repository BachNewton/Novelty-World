import process from "node:process";
import { probeLeakage, SCENARIO_NAMES } from "./adversary";

/** `npm run sim:probe-gate` — the HUMAN-FACING LEAKAGE scoreboard. For each bot
 *  VERSION named, print a per-scenario leak score (higher = more exploitable by a
 *  human at the table) and the total. Pure and deterministic: same args reproduce
 *  the same table, so it is a GATE — a candidate must not raise its total leakage
 *  above its base's (see `adversary.ts`).
 *
 *  Usage:
 *    npm run sim:probe-gate -- fable-v8 fable-v12 fable-v14
 *
 *  Reading the board: fable-v11/v12 zero the wallet-xray column (the `humanAskOff`
 *  fix — no wallet-pegged asks against a human), and fable-v14 zeroes the
 *  auction-illiquidity column (the `auctionTailFrac` reserve). The distress
 *  fire-sale column is a residual every listed version still leaks — the next
 *  target. Known versions live in `versions/index.ts`; a typo fails loud. */

const SHORT: Readonly<Record<string, string>> = {
  "wallet-xray": "wallet",
  "auction-illiquidity": "auction",
  "distress-firesale": "firesale",
};

function col(name: string): string {
  return SHORT[name] ?? name;
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function padStart(s: string, w: number): string {
  return s.length >= w ? s : " ".repeat(w - s.length) + s;
}

function main(): void {
  const labels = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (labels.length === 0) {
    throw new Error(
      "name at least one version. Example: npm run sim:probe-gate -- fable-v8 fable-v12 fable-v14",
    );
  }

  const reports = labels.map((label) => ({ label, report: probeLeakage(label) }));

  const labelW = Math.max(7, ...labels.map((l) => l.length));
  const colW = 9;
  const header =
    pad("version", labelW) +
    "  " +
    SCENARIO_NAMES.map((n) => padStart(col(n), colW)).join("  ") +
    "  " +
    padStart("TOTAL", colW);
  console.log("\nMonopoly — human-facing leakage scoreboard (higher = more exploitable)\n");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const { label, report } of reports) {
    const byName = new Map(report.scenarios.map((s) => [s.name, s.leak]));
    const cells = SCENARIO_NAMES.map((n) => padStart(`$${(byName.get(n) ?? 0).toString()}`, colW));
    console.log(
      pad(label, labelW) +
        "  " +
        cells.join("  ") +
        "  " +
        padStart(`$${report.total.toString()}`, colW),
    );
  }

  // Detail rows — the "why" behind each cell, in the order scenarios ran.
  console.log("\nDetail:");
  for (const { label, report } of reports) {
    console.log(`  ${label}`);
    for (const s of report.scenarios) {
      console.log(`    ${pad(col(s.name), 9)} $${padStart(s.leak.toString(), 4)}  ${s.detail}`);
    }
  }
  console.log("");
}

main();
