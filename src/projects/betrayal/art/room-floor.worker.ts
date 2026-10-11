import { stubCanvas } from "./headless";
import { definition } from "./house";
import { checkFloor } from "./overlap";

/*
 * Reads a room's floor plan off the built room, off the main thread: reading
 * every mesh of a room takes hundreds of milliseconds for a busy one. Only
 * geometry is read, so textures draw on the stand-in canvas.
 */

/** What `room-floor.ts` hears back: one room's floor plan, or why it couldn't be read. */
export type FloorReply = { room: string; blocked: Uint8Array; clearance: Float64Array; reached: Uint8Array } | { room: string; error: string };

stubCanvas();

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  postMessage: (message: FloorReply, transfer?: Transferable[]) => void;
};

scope.onmessage = ({ data: room }) => {
  try {
    const { blocked, clearance, reached } = checkFloor(definition(room)).plan;
    scope.postMessage({ room, blocked, clearance, reached }, [blocked.buffer, clearance.buffer, reached.buffer]);
  } catch (error) {
    scope.postMessage({ room, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  }
};
