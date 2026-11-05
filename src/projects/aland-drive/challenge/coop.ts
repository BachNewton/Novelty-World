import type { ChallengeMessage, ChallengeType } from "../net/protocol";
import type { ChallengeSession } from "./session";
import type { Challenge } from "./types";

/*
 * A co-op challenge between this client and one other player, over the online
 * world's messages (`net/protocol.ts`): pairing, then everything that keeps the
 * two sessions on one attempt. Exactly two players: the inviter takes seat 0,
 * the one who joins seat 1, and each drives `starts[seat]`.
 *
 * Pairing is invite, then accept or decline, then start: the inviter has the
 * last word, so an invite taken back while its accept was on the wire ends
 * nothing that had begun. Start goes to everyone, and leave too, so every
 * client knows who is paired and offers neither to a third player.
 *
 * Once paired, either player's retry is applied here and sent with the
 * attempt's number; the partner follows it unless that attempt is already
 * under way there, so two retries at once are one. Each car's ready, result
 * and a loss called on its own clock go to the partner, and the attempt
 * numbers drop anything about an attempt already over. Messages between two
 * players arrive in the order they were sent, so a start always comes before
 * the ready that follows it. Nothing here waits on time: every change is a
 * message, or this player's own press.
 */

export interface CoopHost {
  send: (to: string | null, message: ChallengeMessage) => void;
  /** This client's own peer id in the world. */
  selfId: () => string | null;
  /** Whether this player could start a challenge now: not in one already, and not on the map or a jump. */
  free: () => boolean;
  /** The challenge an id names, or null if this client doesn't know it. */
  challengeById: (id: string) => Challenge | null;
  /** Starts the challenge as a co-op session in this seat, swapping the car, and returns it. */
  begin: (challenge: Challenge, seat: 0 | 1) => ChallengeSession;
  /** The partner left the co-op challenge or the world: the game leaves its session. */
  end: (notice: CoopNotice) => void;
  /** Something the player should hear about that changed nothing else. */
  notice: (notice: CoopNotice) => void;
}

export type CoopNotice = { kind: "left" | "declined" | "withdrawn"; peer: string };

/** Where this client stands in co-op, as the HUD and the menus show it. */
export type CoopStanding = { kind: "free" } | { kind: "inviting" | "invited" | "joining" | "paired"; peer: string; challenge: Challenge };

const FIRST = 1;

export class CoopLink {
  private standing: CoopStanding = { kind: "free" };
  private playing: ChallengeSession | null = null;
  /** Other players in a co-op challenge, each with their partner, as everyone's start and leave said. */
  private readonly pairs = new Map<string, string>();
  /** How many of each message this client has heard, for tests. */
  readonly heard: Partial<Record<ChallengeType, number>> = {};

  constructor(private readonly host: CoopHost) {}

  get now(): CoopStanding {
    return this.standing;
  }

  /** The co-op session being played, or null. */
  get session(): ChallengeSession | null {
    return this.playing;
  }

  get partner(): string | null {
    return this.standing.kind === "paired" ? this.standing.peer : null;
  }

  /** Whether another player is in a co-op challenge, so isn't offered one. */
  busy(peer: string): boolean {
    return this.pairs.has(peer);
  }

  invite(peer: string, challenge: Challenge): void {
    if (this.standing.kind !== "free") throw new Error(`an invite while ${this.standing.kind}`);
    if (this.busy(peer)) throw new Error(`${peer} is in a co-op challenge already`);
    this.standing = { kind: "inviting", peer, challenge };
    this.host.send(peer, { type: "invite", challenge: challenge.id, attempt: FIRST });
  }

  /** Takes back an invite out or an accept on its way, or turns down an invite in: whichever this client has. */
  withdraw(): void {
    const { standing } = this;
    if (standing.kind === "free" || standing.kind === "paired") return;
    this.host.send(standing.peer, { type: standing.kind === "invited" ? "decline" : "leave", challenge: standing.challenge.id, attempt: FIRST });
    this.standing = { kind: "free" };
  }

  accept(): void {
    const { standing } = this;
    if (standing.kind !== "invited") throw new Error(`accept while ${standing.kind}`);
    this.standing = { ...standing, kind: "joining" };
    this.host.send(standing.peer, { type: "accept", challenge: standing.challenge.id, attempt: FIRST });
  }

  /** The session's own news, for the partner: this player's retry, applied here already. */
  retried(attempt: number): void {
    this.toPartner((challenge) => ({ type: "retry", challenge, attempt }));
  }

  ready(attempt: number): void {
    this.toPartner((challenge) => ({ type: "ready", challenge, attempt }));
  }

  result(attempt: number, result: number): void {
    this.toPartner((challenge) => ({ type: "result", challenge, attempt, result }));
  }

  lost(attempt: number, results: readonly (number | null)[]): void {
    this.toPartner((challenge) => ({ type: "lost", challenge, attempt, results: [...results] }));
  }

  /** This player leaves the co-op challenge: everyone hears, and the game leaves its session. */
  leave(): void {
    const { standing, playing } = this;
    if (standing.kind !== "paired" || !playing) throw new Error(`leave while ${standing.kind}`);
    this.host.send(null, { type: "leave", challenge: standing.challenge.id, attempt: playing.run.attempt });
    this.unpair();
  }

  private toPartner(message: (challenge: string) => ChallengeMessage): void {
    const { standing } = this;
    if (standing.kind === "paired") this.host.send(standing.peer, message(standing.challenge.id));
  }

  private unpair(): void {
    this.standing = { kind: "free" };
    this.playing = null;
  }

  /** Everyone else in the world now: a partner, or a player half way through pairing with this one, who has gone ends it. */
  players(present: ReadonlySet<string>): void {
    for (const peer of [...this.pairs.keys()]) if (!present.has(peer)) this.dropPair(peer);
    const { standing } = this;
    if (standing.kind === "free" || present.has(standing.peer)) return;
    if (standing.kind === "paired") {
      this.unpair();
      this.host.end({ kind: "left", peer: standing.peer });
      return;
    }
    this.standing = { kind: "free" };
    this.host.notice({ kind: "withdrawn", peer: standing.peer });
  }

  hear(from: string, message: ChallengeMessage): void {
    this.heard[message.type] = (this.heard[message.type] ?? 0) + 1;
    const { standing } = this;
    const about = (kind: CoopStanding["kind"]) => standing.kind === kind && standing.kind !== "free" && standing.peer === from && standing.challenge.id === message.challenge;
    switch (message.type) {
      case "invite": {
        const challenge = this.host.challengeById(message.challenge);
        // Busy, or a version of the game without that challenge: no.
        if (standing.kind !== "free" || !challenge || !this.host.free()) this.host.send(from, { type: "decline", challenge: message.challenge, attempt: FIRST });
        else this.standing = { kind: "invited", peer: from, challenge };
        return;
      }
      case "accept":
        if (standing.kind === "inviting" && about("inviting") && this.host.free()) {
          // Everyone hears of the pair before the partner hears this car is ready.
          this.host.send(null, { type: "start", challenge: standing.challenge.id, attempt: FIRST, partner: from });
          this.pair(from, standing.challenge, 0);
        } else {
          // Taken back while the accept was on its way, or this player can't start one now.
          if (about("inviting")) {
            this.standing = { kind: "free" };
            this.host.notice({ kind: "withdrawn", peer: from });
          }
          this.host.send(from, { type: "leave", challenge: message.challenge, attempt: FIRST });
        }
        return;
      case "decline":
        if (about("inviting")) {
          this.standing = { kind: "free" };
          this.host.notice({ kind: "declined", peer: from });
        }
        return;
      case "start":
        if (message.partner !== this.host.selfId()) {
          this.pairs.set(from, message.partner);
          this.pairs.set(message.partner, from);
        } else if (standing.kind === "joining" && about("joining") && this.host.free()) this.pair(from, standing.challenge, 1);
        // A start for a join this client took back, or can't make now: the inviter hears it's off.
        else {
          if (standing.kind === "joining" && about("joining")) {
            this.standing = { kind: "free" };
            this.host.notice({ kind: "withdrawn", peer: from });
          }
          this.host.send(from, { type: "leave", challenge: message.challenge, attempt: FIRST });
        }
        return;
      case "leave":
        this.dropPair(from);
        if (about("paired")) {
          this.unpair();
          this.host.end({ kind: "left", peer: from });
        } else if (about("invited") || about("joining") || about("inviting")) {
          this.standing = { kind: "free" };
          this.host.notice({ kind: "withdrawn", peer: from });
        }
        return;
      default:
        if (this.playing && about("paired")) play(this.playing, message);
    }
  }

  private dropPair(peer: string): void {
    const partner = this.pairs.get(peer);
    this.pairs.delete(peer);
    if (partner !== undefined) this.pairs.delete(partner);
  }

  private pair(peer: string, challenge: Challenge, seat: 0 | 1): void {
    // Paired before the session begins, so a first ready sent as it begins has its partner to go to.
    this.standing = { kind: "paired", peer, challenge };
    this.playing = this.host.begin(challenge, seat);
  }
}

function play(session: ChallengeSession, message: ChallengeMessage): void {
  const partnerSeat = session.seat === 0 ? 1 : 0;
  switch (message.type) {
    case "retry":
      session.follow(message.attempt);
      return;
    case "ready":
      session.partnerPlaced(message.attempt);
      return;
    case "result":
      session.report(message.attempt, partnerSeat, message.result);
      return;
    case "lost":
      session.adoptLoss(message.attempt, message.results);
      return;
  }
}
