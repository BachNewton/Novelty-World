// `npm run ai:game-night -- [--model sonnet|opus|haiku|<id>]`
//
// Everything a game night needs from this laptop, in one command: the Claude
// model server (server-cli.ts) with the shared key from `.env.local`, then a
// Tailscale Funnel that lets the deployed site reach it, then one keyed request
// through the public address to prove the whole path works. Ctrl+C stops both.
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

const PORT = 8091;
const SERVER_READY = "claude server on";
const FUNNEL_READY = /https:\/\/\S+\.ts\.net\/?/;

function fail(message: string): never {
  console.error(`game night: ${message}`);
  stopAll();
  process.exit(1);
}

process.loadEnvFile(".env.local");
const key = process.env.MONOPOLY_AI_CLAUDE_KEY;
if (!key)
  fail(
    "MONOPOLY_AI_CLAUDE_KEY is missing from .env.local; the server is public through the Funnel, so it must require the key",
  );

const model = process.argv.at(2) === "--model" ? process.argv.at(3) : "sonnet";
if (model === undefined) fail("--model needs a value");

const children: ChildProcess[] = [];

function stopAll(): void {
  for (const child of children) child.kill();
}
process.on("SIGINT", () => {
  console.log("\ngame night: stopping the server and the Funnel");
  stopAll();
  process.exit(0);
});

/** Start a process, echo its output with a prefix, and call `onLine` for each
 *  line until it returns true. The process ending is fatal: game night needs
 *  both running. */
function start(
  label: string,
  command: string,
  args: string[],
  onLine: (line: string) => boolean,
): void {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let waiting = true;
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on("line", (line) => {
      console.log(`[${label}] ${line}`);
      if (waiting && onLine(line)) waiting = false;
    });
  }
  child.on("error", (err) => fail(`${label} couldn't start: ${err.message}`));
  child.on("exit", (code) => fail(`${label} stopped (exit ${String(code)})`));
}

async function verify(publicUrl: string): Promise<void> {
  const res = await fetch(new URL("props", publicUrl), {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok)
    fail(
      `the public address answered ${String(res.status)}: ${await res.text()}`,
    );
  const props = (await res.json()) as { model_path?: string };
  console.log(`\ngame night: ready. ${props.model_path ?? "?"}`);
  console.log(
    `game night: Vercel's MONOPOLY_AI_CLAUDE_URL must be ${new URL("v1", publicUrl).href}`,
  );
  console.log(
    "game night: leave this running for the whole game. Ctrl+C stops it.\n",
  );
}

start(
  "server",
  process.execPath,
  [
    "--import",
    "tsx",
    "src/projects/monopoly/bots/ai/claude/server-cli.ts",
    "--model",
    model,
    "--port",
    String(PORT),
  ],
  (line) => {
    if (!line.includes(SERVER_READY)) return false;
    start("funnel", "tailscale", ["funnel", String(PORT)], (funnelLine) => {
      const url = FUNNEL_READY.exec(funnelLine)?.[0];
      if (url === undefined) return false;
      void verify(url.endsWith("/") ? url : `${url}/`);
      return true;
    });
    return true;
  },
);
