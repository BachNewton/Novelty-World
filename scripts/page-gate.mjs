/**
 * The page gate: holds an e2e run to the GPU pages its slot claimed. A worker runs
 * one test at a time, but tests open different numbers of pages, so the run's peak
 * is whichever tests happen to run together: a four-player test beside a two-player
 * one is six pages, past what the Radeon holds. So every test that draws on a GPU
 * takes its pages here first, all at once, and gives them back when it ends.
 *
 * One server per run, started by playwright.config.ts beside the relay and sized to
 * the run's claim on the Radeon, where every GPU page is counted (machine-budget.mjs).
 * A test asks over a socket and holds its pages while the socket is open, so a worker
 * that dies gives them back with it. Requests are served in order: a test waiting for
 * four pages isn't passed by one-page tests that would keep it waiting for ever.
 *
 *   node scripts/page-gate.mjs <pages>   prints "page gate on port N"
 */
import { createServer, connect } from "node:net";
import { pathToFileURL } from "node:url";

/**
 * The gate's rule: `ask` queues a request for `pages` and calls `grant` once they are
 * all free and every request before it has been granted; `leave` gives a request's
 * pages back, or takes it out of the queue. Pure, and unit-tested.
 */
export function createGate(size) {
  const queue = [];
  let used = 0;
  const pump = () => {
    while (queue.length > 0 && used + queue[0].pages <= size) {
      const head = queue.shift();
      used += head.pages;
      head.granted = true;
      head.grant();
    }
  };
  return {
    ask(pages, grant) {
      if (!Number.isInteger(pages) || pages < 1 || pages > size) throw new Error(`a test can hold 1 to ${size} pages here, not ${pages}`);
      const request = { pages, grant, granted: false };
      queue.push(request);
      pump();
      return request;
    },
    leave(request) {
      if (request.granted) used -= request.pages;
      else if (queue.includes(request)) queue.splice(queue.indexOf(request), 1);
      request.granted = false;
      pump();
    },
  };
}

/** Starts a gate of `size` pages on a port the OS picks; resolves to the server once it listens. */
export function startPageGate(size) {
  const gate = createGate(size);
  const server = createServer((socket) => {
    let asked = "";
    let request;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      if (request !== undefined) return;
      asked += chunk;
      if (!asked.includes("\n")) return;
      try {
        request = gate.ask(Number(asked.trim()), () => socket.write("go\n"));
      } catch (error) {
        socket.end(`refused: ${error.message}\n`);
      }
    });
    socket.on("close", () => {
      if (request !== undefined) gate.leave(request);
    });
    // A worker killed mid-test resets its socket; its pages come back on the close that follows.
    socket.on("error", () => {});
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/**
 * Takes `pages` from the gate on `port`, waiting its turn. Resolves to the function
 * that gives them back; rejects when the gate refuses or is gone.
 */
export function holdPages(port, pages) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    let answer = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${pages}\n`));
    socket.on("data", (chunk) => {
      answer += chunk;
      if (!answer.includes("\n")) return;
      if (answer.trim() === "go") resolve(() => socket.end());
      else reject(new Error(`The page gate ${answer.trim()}`));
    });
    socket.on("error", reject);
    socket.on("close", () => reject(new Error(`The page gate closed before granting ${pages} pages`)));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const size = Number(process.argv[2]);
  if (!Number.isInteger(size) || size < 0) throw new Error(`usage: node scripts/page-gate.mjs <pages>, not "${process.argv[2]}"`);
  const server = await startPageGate(size);
  console.log(`page gate on port ${server.address().port} for ${size} pages`);
}
