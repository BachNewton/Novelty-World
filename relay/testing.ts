import { createServer } from "node:http";
import { startRelay } from "./relay";

/** A relay on a free port for one test file, taking any origin. */
export async function startTestRelay(): Promise<{ url: string; port: number; close(): Promise<void> }> {
  const server = createServer();
  const wss = startRelay(server, { allowOrigin: () => true });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("test relay is not on a TCP port");
  return {
    url: `ws://localhost:${address.port}`,
    port: address.port,
    close: async () => {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
