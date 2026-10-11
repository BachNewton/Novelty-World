import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** The game's rules as source text, for tests that read what the code
 *  names: every source file of engine/, kit/ and data/, tests left out. */
export function ruleSources(): { file: string; source: string }[] {
  const root = path.join(__dirname, "..");
  return ["engine", "kit", "data"].flatMap((dir) =>
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only scan of this project's own engine/, kit/ and data/ folders
    readdirSync(path.join(root, dir), { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => {
        const file = path.join(dir, f);
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file the scan above found in this project's own source
        return { file, source: readFileSync(path.join(root, file), "utf8") };
      }),
  );
}
