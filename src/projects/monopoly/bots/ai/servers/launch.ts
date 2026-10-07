// `npm run ai:llm -- <config>`: start local-llm (Kyle's launcher from his
// dotfiles, ~/bin/local-llm.bat) with one of the Monopoly server configs in this
// folder, in a window of its own. The launcher validates the config, checks it
// fits in graphics memory, and refuses if a server is already running on 8090.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const configs = readdirSync(here).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const name = process.argv.at(2);
if (name === undefined || !configs.includes(name)) {
  console.error(`usage: npm run ai:llm -- <config>\nconfigs: ${configs.join(", ")}`);
  process.exit(1);
}
const launcher = join(homedir(), "bin", "local-llm.bat");
// eslint-disable-next-line security/detect-non-literal-fs-filename -- the launcher's fixed install path in the user's home folder
if (!existsSync(launcher)) {
  console.error(`local-llm isn't installed at ${launcher}`);
  process.exit(1);
}
const config = join(here, `${name}.json`);
// `start` opens the launcher in a new console window, so the server outlives
// this script and Ctrl+C in that window stops it. Its first QUOTED argument is
// the window title, which Node's own argument quoting would drop, so the command
// line is passed verbatim. The new window's `cmd /k` strips the outermost pair
// of quotes from its command when it holds more than two, hence the extra pair
// around the quoted launcher and config.
spawn("cmd.exe", ["/c", `start "local-llm" cmd /k ""${launcher}" "${config}""`], {
  detached: true,
  stdio: "ignore",
  windowsVerbatimArguments: true,
}).unref();
console.log(`local-llm starting in its own window with ${config}`);
