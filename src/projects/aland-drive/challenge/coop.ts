import type { ChallengeMessage, ChallengeType } from "../net/protocol";
import type { ChallengeSession } from "./session";
import type { Challenge } from "./types";

/*
 * A co-op challenge between this client and one other player, over the online
 * world's messages (`net/protocol.ts`): pairing, then everything that keeps the
 * two sessions on one attempt. Exactly two players: the inviter takes seat 0,
 * the one who joins seat 1, and each drives `starts[seat]`.
 *
 * Pairing is a world-wide invite, then accepts, then start. The invite goes to
 * everyone, and to everyone who arrives while it's open; each client keeps the
 * invites it holds, by who sent them, until that player takes theirs back,
 * starts with someone, or leaves the world, so ignoring one is the default and
 * costs nothing. The inviter has the last word: the first accept it hears gets
 * seat 1 and a start sent to everyone, which withdraws the invite everywhere
 * else at once; an accept after that, or one for an invite taken back while it
 * was on the wire, hears leave and begins nothing. Start goes to everyone, and
 * leave too, so every client knows who is paired and offers neither to a third
 * player.
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

/**
 * Left: the partner left. Withdrawn: an invite this player had joined was taken
 * back, or the inviter couldn't start. Taken: the invite this player joined went
 * to `partner`, who was first. Expired: an invite this player hadn't answered
 * is gone, which the game shows only if the player was answering it.
 */
export type CoopNotice = { kind: "left" | "withdrawn" | "expired"; peer: string } | { kind: "taken"; peer: string; partner: string };

/** Where this client stands in co-op: free, asking everyone, joining someone's invite, or paired. */
export type CoopStanding = { kind: "free" } | { kind: "inviting"; challenge: Challenge } | { kind: "joining" | "paired"; peer: string; challenge: Challenge };

/** An invite this client holds: who sent it, and to what. */
export interface CoopInvite {
  peer: string;
  challenge: Challenge;
}

const FIRST = 1;

export class CoopLink {
  private standing: CoopStanding = { kind: "free" };
  private playing: ChallengeSession | null = null;
  /** Other players in a co-op challenge, each with their partner, as everyone's start and leave said. */
  private readonly pairs = new Map<string, string>();
  /** The invites this client holds, by who sent them, oldest first. */
  private readonly invites = new Map<string, Challenge>();
  /** Everyone else in the world, as last heard, so an open invite reaches whoever arrives. */
  private present = new Set<string>();
  /** How many of each message this client has heard, for tests. */
  readonly heard: Partial<Record<ChallengeType, number>> = {};

  constructor(private readonly host: CoopHost) {}

  get now(): CoopStanding {
    return this.standing;
  }

  /** The newest invite this client holds, which its button answers while it's free. */
  get invite(): CoopInvite | null {
    let newest: CoopInvite | null = null;
    for (const [peer, challenge] of this.invites) newest = { peer, challenge };
    return newest;
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

  /** Asks everyone in the world to join this challenge. */
  inviteAll(challenge: Challenge): void {
    if (this.standing.kind !== "free") throw new Error(`an invite while ${this.standing.kind}`);
    this.standing = { kind: "inviting", challenge };
    this.host.send(null, { type: "invite", challenge: challenge.id, attempt: FIRST });
  }

  /** Takes back this client's invite, from everyone, or its accept on its way: whichever it has. */
  withdraw(): void {
    const { standing } = this;
    if (standing.kind === "inviting") this.host.send(null, { type: "leave", challenge: standing.challenge.id, attempt: FIRST });
    else if (standing.kind === "joining") this.host.send(standing.peer, { type: "leave", challenge: standing.challenge.id, attempt: FIRST });
    else return;
    this.standing = { kind: "free" };
  }

  /** Joins the invite this player holds from `peer`. */
  accept(peer: string): void {
    const challenge = this.invites.get(peer);
    if (this.standing.kind !== "free") throw new Error(`accept while ${this.standing.kind}`);
    if (!challenge) throw new Error(`no invite from ${peer} to accept`);
    this.standing = { kind: "joining", peer, challenge };
    this.host.send(peer, { type: "accept", challenge: challenge.id, attempt: FIRST });
  }

  /** Lets an invite pass: it's dropped here, and the inviter, still asking everyone else, needn't hear. */
  decline(peer: string): void {
    this.invites.delete(peer);
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

  /**
   * Everyone else in the world now: an open invite reaches whoever has arrived,
   * and a partner, an inviter or a player half way through pairing with this
   * one who has gone ends what they were part of.
   */
  players(present: ReadonlySet<string>): void {
    const { standing } = this;
    if (standing.kind === "inviting") {
      for (const peer of present) if (!this.present.has(peer)) this.host.send(peer, { type: "invite", challenge: standing.challenge.id, attempt: FIRST });
    }
    this.present = new Set(present);
    for (const peer of [...this.pairs.keys()]) if (!present.has(peer)) this.dropPair(peer);
    for (const peer of [...this.invites.keys()]) if (!present.has(peer)) this.dropInvite(peer);
    if (standing.kind === "free" || standing.kind === "inviting" || present.has(standing.peer)) return;
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
    const joining = standing.kind === "joining" && standing.peer === from && standing.challenge.id === message.challenge;
    switch (message.type) {
      case "invite": {
        // Kept whatever this player is doing, to show once they're free; a version of the game without that challenge has nothing to show.
        const challenge = this.host.challengeById(message.challenge);
        if (challenge) this.invites.set(from, challenge);
        return;
      }
      case "accept": {
        const asking = standing.kind === "inviting" && standing.challenge.id === message.challenge;
        if (asking && this.host.free()) {
          // Everyone hears of the pair, and drops the invite, before the partner hears this car is ready.
          this.host.send(null, { type: "start", challenge: message.challenge, attempt: FIRST, partner: from });
          this.pair(from, standing.challenge, 0);
          return;
        }
        // This player can't start one now, which ends the invite for everyone. An accept that finds someone was first, or the
        // invite taken back while it was on its way, needs no answer: the start or the leave sent to everyone has told the joiner.
        if (asking) {
          this.withdraw();
          this.host.notice({ kind: "withdrawn", peer: from });
        }
        return;
      }
      case "start":
        this.dropInvite(from);
        if (message.partner !== this.host.selfId()) {
          this.pairs.set(from, message.partner);
          this.pairs.set(message.partner, from);
          if (joining) {
            this.standing = { kind: "free" };
            this.host.notice({ kind: "taken", peer: from, partner: message.partner });
          }
        } else if (joining && this.host.free()) this.pair(from, standing.challenge, 1);
        // A start for a join this client took back, or can't make now: it's off, for the inviter and everyone who heard of the pair.
        else {
          if (joining) {
            this.standing = { kind: "free" };
            this.host.notice({ kind: "withdrawn", peer: from });
          }
          // Unless this player has an invite of their own out by now, which a leave to everyone would take back.
          this.host.send(standing.kind === "inviting" ? from : null, { type: "leave", challenge: message.challenge, attempt: FIRST });
        }
        return;
      case "leave":
        this.dropPair(from);
        this.dropInvite(from);
        if (standing.kind === "paired" && standing.peer === from) {
          this.unpair();
          this.host.end({ kind: "left", peer: from });
        } else if (joining) {
          this.standing = { kind: "free" };
          this.host.notice({ kind: "withdrawn", peer: from });
        }
        // An inviter whose joiner took their accept back asks on: everyone else still holds the invite.
        return;
      default:
        if (this.playing && standing.kind === "paired" && standing.peer === from && standing.challenge.id === message.challenge) play(this.playing, message);
    }
  }

  private dropInvite(peer: string): void {
    if (this.invites.delete(peer) && this.standing.kind === "free") this.host.notice({ kind: "expired", peer });
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
