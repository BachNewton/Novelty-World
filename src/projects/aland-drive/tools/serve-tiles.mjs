// A plain file server for tiles, on localhost, for everything that must not touch the real host: e2e runs and headless
// drives, through the page's `?tiles=local:<port>`. It sends the long cache header the real host sends, so a browser
// keeps what it fetched, and it counts the bytes it really served, which is what a drive costs in download.
//
// As a command, for tools: node src/projects/aland-drive/tools/serve-tiles.mjs [--port=8123] [--folder=<tiles>] [--kbps=<limit>]
// Without --kbps it serves as fast as it can. With it, each response is held to that rate, to stand in for a slow connection.

// The paths below come from a request, checked to stay inside the folder served, on a localhost-only tool.
/* eslint-disable security/detect-non-literal-fs-filename -- see above */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = { ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".gz": "application/octet-stream" };
const SLICE_BYTES = 16 * 1024;

export function serveTiles(folder, kbps = null, listenPort = 0) {
  let served = 0;
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("Access-Control-Allow-Origin", "*");
    if (url.pathname === "/__counts") {
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Cache-Control", "no-store");
      response.end(JSON.stringify({ served, requests: requests.length }));
      return;
    }
    const path = join(folder, normalize(decodeURIComponent(url.pathname)));
    if (!resolve(path).startsWith(resolve(folder))) {
      response.writeHead(403).end();
      return;
    }
    const stat = statSync(path, { throwIfNoEntry: false });
    if (!stat?.isFile()) {
      response.writeHead(404).end();
      return;
    }
    const type = TYPES[extname(path)] ?? "application/octet-stream";
    response.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Cache-Control": "public, max-age=31536000, immutable" });
    served += stat.size;
    requests.push(url.pathname);
    if (kbps === null) {
      createReadStream(path).pipe(response);
      return;
    }
    const file = createReadStream(path, { highWaterMark: SLICE_BYTES });
    const started = process.hrtime.bigint();
    let sent = 0;
    file.on("data", (chunk) => {
      file.pause();
      response.write(chunk);
      sent += chunk.length;
      const dueMs = (sent * 8) / kbps - Number(process.hrtime.bigint() - started) / 1e6;
      // This delay is the feature: it is the slow connection.
      setTimeout(() => file.resume(), Math.max(0, dueMs));
    });
    file.on("end", () => response.end());
  });
  return new Promise((ready) => {
    server.listen(listenPort, "127.0.0.1", () => {
      ready({ server, port: server.address().port, counts: () => ({ served, requests: requests.length }) });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
  const folder = option("folder", "src/projects/aland-drive/.data/tiles");
  const kbps = option("kbps", null);
  const { port } = await serveTiles(folder, kbps === null ? null : Number(kbps), Number(option("port", "0")));
  console.log(`http://localhost:${port}`);
}
