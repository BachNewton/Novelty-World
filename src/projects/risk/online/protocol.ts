import type { PlayerProfile } from "@/shared/lib/profile";
import type { Answer, Seat } from "../contract";
import { TERRITORIES } from "../map";
import type { GameRow } from "./table";

/*
 * What a phone sends `/api/risk` and what it hears back. A request names its
 * player by profile; a move names the decision it answers. The answer is only
 * ever "accepted, here is the row" or "rejected, here is the row".
 */

export type Request =
  | { op: "create"; profile: PlayerProfile }
  | { op: "join"; game: string; profile: PlayerProfile }
  | { op: "add-bot"; game: string; profile: PlayerProfile }
  | { op: "remove-seat"; game: string; profile: PlayerProfile; seat: Seat }
  | { op: "start"; game: string; profile: PlayerProfile }
  | { op: "move"; game: string; profile: PlayerProfile; answer: Answer }
  /** Restarts a stalled bot drive. Idempotent: anyone may send it, any number of times. */
  | { op: "nudge"; game: string };

export type Response = { ok: true; row: GameRow } | { ok: false; reason: string; row: GameRow | null };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const TERRITORY_IDS: ReadonlySet<unknown> = new Set(TERRITORIES.map((t) => t.id));
const CARD_IDS: ReadonlySet<unknown> = new Set([...TERRITORY_IDS, "wild-1", "wild-2"]);
const isTerritory = (v: unknown) => TERRITORY_IDS.has(v);

function parseProfile(v: unknown): PlayerProfile | null {
  if (!isRecord(v) || !isString(v.id) || !isString(v.name)) return null;
  return { id: v.id, name: v.name };
}

/** A move's shape: whether it is legal is the engine's to say. */
function isMove(v: unknown): v is Answer["move"] {
  if (!isRecord(v)) return false;
  switch (v.kind) {
    case "place":
      return isTerritory(v.territory) && isCount(v.armies);
    case "trade":
      return (
        Array.isArray(v.cards) &&
        v.cards.length === 3 &&
        v.cards.every((card) => CARD_IDS.has(card)) &&
        (v.bonusTerritory === undefined || isTerritory(v.bonusTerritory))
      );
    case "attack":
      return isTerritory(v.from) && isTerritory(v.to) && (v.dice === 1 || v.dice === 2 || v.dice === 3);
    case "blitz":
      return isTerritory(v.from) && isTerritory(v.to) && isCount(v.keepAtLeast);
    case "occupy":
      return isCount(v.armies);
    case "fortify":
      return isTerritory(v.from) && isTerritory(v.to) && isCount(v.armies);
    case "end-attack":
    case "end-turn":
      return Object.keys(v).length === 1;
    default:
      return false;
  }
}

function parseAnswer(v: unknown): Answer | null {
  if (!isRecord(v) || !isCount(v.decision) || !isCount(v.seat) || !isMove(v.move)) return null;
  return { decision: v.decision, seat: v.seat, move: v.move };
}

/** A request from the wire, or null when it isn't one. */
export function parseRequest(v: unknown): Request | null {
  if (!isRecord(v)) return null;
  if (v.op === "create") {
    const profile = parseProfile(v.profile);
    return profile && { op: "create", profile };
  }
  if (!isString(v.game)) return null;
  const game = v.game;
  if (v.op === "nudge") return { op: "nudge", game };
  const profile = parseProfile(v.profile);
  if (!profile) return null;
  switch (v.op) {
    case "join":
    case "add-bot":
    case "start":
      return { op: v.op, game, profile };
    case "remove-seat":
      return isCount(v.seat) ? { op: "remove-seat", game, profile, seat: v.seat } : null;
    case "move": {
      const answer = parseAnswer(v.answer);
      return answer && { op: "move", game, profile, answer };
    }
    default:
      return null;
  }
}
