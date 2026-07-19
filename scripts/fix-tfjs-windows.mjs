// tfjs-node on Windows ships `tensorflow.dll` under deps/lib/, but the native
// addon (lib/napi-v8/tfjs_binding.node) resolves its dependent DLL from its OWN
// directory — so without a copy next to the binding, loading the addon fails with
// "The specified module could not be found". This idempotent copy fixes that.
// Runs as a `postinstall` hook (so a fresh `npm ci` leaves the RL/tfjs tests
// runnable) AND is re-invoked before `train:rl` as belt-and-suspenders. Off
// Windows (Vercel/CI Linux) OR without tfjs-node installed (production installs
// omit the devDependency) the guard below makes it a pure no-op, so it never
// affects a plain install, a Vercel build, or CI.
import { existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const base = join(process.cwd(), "node_modules", "@tensorflow", "tfjs-node");
const src = join(base, "deps", "lib", "tensorflow.dll");
const dst = join(base, "lib", "napi-v8", "tensorflow.dll");

if (process.platform === "win32" && existsSync(src) && !existsSync(dst)) {
  copyFileSync(src, dst);
  console.log("fix-tfjs-windows: copied tensorflow.dll next to the native binding");
}
