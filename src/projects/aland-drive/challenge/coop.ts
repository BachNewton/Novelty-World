import type { ChallengeMessage, ChallengeType } from "../net/protocol";
import type { ChallengeSession } from "./session";
import { MOST_PLAYERS, type Challenge } from "./types";

/*
 * A co-op challenge or race between this client and one to three other
 * players, over the online world's messages (`net/protocol.ts`): forming the
 * team, then everything that keeps every session on one attempt. The inviter
 * takes seat 0 and those who join the next seats, in the order the inviter
 * heard their accepts.
 *
 * Forming is a world-wide invite, then accepts, then start. The invite goes to
 * everyone, and to everyone who arrives while it's open; each client keeps the
 * invites it holds, by who sent them, until that player takes theirs back,
 * starts, or leaves the world, so ignoring one is the default and costs
 * nothing. The inviter has the last word: each accept it hears takes the next
 * seat, and the invite stays open until the inviter starts it or the room is
 * full, which starts it at once. Start goes to everyone naming the team, so
 * every other invitee drops the invite and every client knows who is in a
 * team, and offers none of them to anyone else. A joiner the start doesn't
 * name was too late. A joiner can take their accept back, and an inviter their
 * invite, before the start.
 *
 * Once started, any player's retry is applied here and sent to the team with
 * the attempt's number; each teammate follows it unless that attempt is
 * already under way there, so retries at once are one. Each car's ready, its
 * result (with a race's team points) and a loss called on its own clock go to
 * the team, and the attempt numbers drop anything about an attempt already
 * over. A player who leaves, or drops out of the world, is dropped: the rest
 * carry on, until only one is left, whose co-op then ends. Messages between
 * two players arrive in the order they were sent, so a start always comes
 * before the ready that follows it. Nothing here waits on time: every change
 * is a message, or this player's own press.
 */

export interface CoopHost {
  send: (to: string | null, message: ChallengeMessage) => void;
  /** This client's own peer id in the world. */
  selfId: () => string | null;
  /** Whether this player could start a challenge now: not in one already, and not on the map or a jump. */
  free: () => boolean;
  /** The challenge an id names, or null if this client doesn't know it. */
  challengeById: (id: string) => Challenge | null;
  /** Starts the challenge as a co-op session in this seat of a team this size, swapping the car, and returns it. */
  begin: (challenge: Challenge, seat: number, players: number) => ChallengeSession;
  /** The team is down to this player alone: the game leaves its session. */
  end: (notice: CoopNotice) => void;
  /** Something the player should hear about that changed nothing else. */
  notice: (notice: CoopNotice) => void;
}

/**
 * Left: a teammate left (the rest carry on), or the last one did (which ends it).
 * Withdrawn: an invite this player had joined was taken back, or the inviter
 * couldn't start. Taken: the invite this player joined started without them.
 * Expired: an invite this player hadn't answered is gone, which the game shows
 * only if the player was answering it.
 */
export interface CoopNotice {
  kind: "left" | "withdrawn" | "expired" | "taken";
  peer: string;
}

/** Where this client stands in co-op: free, asking everyone (with who has joined), joining someone's invite, or playing in a team. */
export type CoopStanding =
  | { kind: "free" }
  | { kind: "inviting"; challenge: Challenge; joined: readonly string[] }
  | { kind: "joining"; peer: string; challenge: Challenge }
  | { kind: "playing"; challenge: Challenge; team: readonly string[]; seat: number };

/** An invite this client holds: who sent it, and to what. */
export interface CoopInvite {
  peer: string;
  challenge: Challenge;
}

const FIRST = 1;

export class CoopLink {
  private standing: CoopStanding = { kind: "free" };
  private playing: ChallengeSession | null = null;
  /** Teammates who have left this client's team, by seat, so nothing more is sent to them or heard from them. */
  private gone = new Set<number>();
  /** Other players in a co-op team, as everyone's start and leave said. */
  private readonly teamed = new Set<string>();
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

  /** The teammates still in, by seat, this player left out; empty outside a team. */
  get teammates(): { peer: string; seat: number }[] {
    const { standing } = this;
    if (standing.kind !== "playing") return [];
    return standing.team.flatMap((peer, seat) => (seat === standing.seat || this.gone.has(seat) ? [] : [{ peer, seat }]));
  }

  /** The player in a seat of this client's team, or null outside one. */
  peerAt(seat: number): string | null {
    return this.standing.kind === "playing" ? (this.standing.team[seat] ?? null) : null;
  }

  /** Whether another player is in a co-op team, so isn't offered one. */
  busy(peer: string): boolean {
    return this.teamed.has(peer);
  }

  /** Asks everyone in the world to join this challenge. */
  inviteAll(challenge: Challenge): void {
    if (this.standing.kind !== "free") throw new Error(`an invite while ${this.standing.kind}`);
    this.standing = { kind: "inviting", challenge, joined: [] };
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

  /** Starts this client's invite with everyone who has joined it, which tells the whole world who is in the team. */
  start(): void {
    const { standing } = this;
    if (standing.kind !== "inviting" || standing.joined.length === 0) throw new Error(`a start while ${standing.kind} with no one joined`);
    const selfId = this.host.selfId();
    if (selfId === null) throw new Error("a start out of the world");
    const team = [selfId, ...standing.joined];
    // Everyone hears of the team, and drops the invite, before a teammate hears this car is ready.
    this.host.send(null, { type: "start", challenge: standing.challenge.id, attempt: FIRST, team });
    this.play(standing.challenge, team, 0);
  }

  /** The session's own news, for the team: this player's retry, applied here already. */
  retried(attempt: number): void {
    this.toTeam((challenge) => ({ type: "retry", challenge, attempt }));
  }

  ready(attempt: number): void {
    this.toTeam((challenge) => ({ type: "ready", challenge, attempt }));
  }

  /** This player's own time or speed, and in a race their team points. */
  result(attempt: number, result: number, points?: number): void {
    this.toTeam((challenge) => (points === undefined ? { type: "result", challenge, attempt, result } : { type: "result", challenge, attempt, result, points }));
  }

  lost(attempt: number, results: readonly (number | null)[]): void {
    this.toTeam((challenge) => ({ type: "lost", challenge, attempt, results: [...results] }));
  }

  /** This player leaves the co-op challenge: everyone hears, the team carries on without them, and the game leaves its session. */
  leave(): void {
    const { standing, playing } = this;
    if (standing.kind !== "playing" || !playing) throw new Error(`leave while ${standing.kind}`);
    this.host.send(null, { type: "leave", challenge: standing.challenge.id, attempt: playing.run.attempt });
    this.stopPlaying();
  }

  private toTeam(message: (challenge: string) => ChallengeMessage): void {
    const { standing } = this;
    if (standing.kind !== "playing") return;
    for (const { peer } of this.teammates) this.host.send(peer, message(standing.challenge.id));
  }

  private stopPlaying(): void {
    this.standing = { kind: "free" };
    this.playing = null;
    this.gone = new Set();
  }

  /**
   * Everyone else in the world now: an open invite reaches whoever has arrived,
   * and a teammate, an inviter or a joiner who has gone ends their part in what
   * they were in.
   */
  players(present: ReadonlySet<string>): void {
    const { standing } = this;
    if (standing.kind === "inviting") {
      for (const peer of present) if (!this.present.has(peer)) this.host.send(peer, { type: "invite", challenge: standing.challenge.id, attempt: FIRST });
    }
    this.present = new Set(present);
    for (const peer of [...this.teamed]) if (!present.has(peer)) this.teamed.delete(peer);
    for (const peer of [...this.invites.keys()]) if (!present.has(peer)) this.dropInvite(peer);
    if (standing.kind === "inviting") {
      const joined = standing.joined.filter((peer) => present.has(peer));
      if (joined.length !== standing.joined.length) this.standing = { ...standing, joined };
    } else if (standing.kind === "joining" && !present.has(standing.peer)) {
      this.standing = { kind: "free" };
      this.host.notice({ kind: "withdrawn", peer: standing.peer });
    } else if (standing.kind === "playing") {
      for (const { peer } of this.teammates) if (!present.has(peer)) this.dropTeammate(peer);
    }
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
        if (standing.kind !== "inviting" || standing.challenge.id !== message.challenge || standing.joined.includes(from)) return;
        // Only while the room has a seat: one that filled while this accept was on the wire is about to start, and the start tells the joiner.
        if (standing.joined.length + 1 >= MOST_PLAYERS) return;
        const joined = [...standing.joined, from];
        this.standing = { ...standing, joined };
        if (joined.length + 1 < MOST_PLAYERS) return;
        // The room is full: it starts at once, or, with this player unable to start now, is off for everyone.
        if (this.host.free()) this.start();
        else {
          this.withdraw();
          this.host.notice({ kind: "withdrawn", peer: from });
        }
        return;
      }
      case "start": {
        this.dropInvite(from);
        const { team } = message;
        for (const peer of team) this.teamed.add(peer);
        const seat = team.indexOf(this.host.selfId() ?? "");
        if (seat < 0) {
          if (joining) {
            this.standing = { kind: "free" };
            this.host.notice({ kind: "taken", peer: from });
          }
          return;
        }
        this.teamed.delete(team[seat]);
        if (joining && this.host.free()) {
          this.play(standing.challenge, team, seat);
          return;
        }
        // A start for a join this client took back, or can't make now: everyone hears it isn't coming, and the rest carry on.
        if (joining) {
          this.standing = { kind: "free" };
          this.host.notice({ kind: "withdrawn", peer: from });
        }
        // To the team alone if this player has an invite of their own out by now, which a leave to everyone would take back.
        const leave: ChallengeMessage = { type: "leave", challenge: message.challenge, attempt: FIRST };
        if (standing.kind !== "inviting") this.host.send(null, leave);
        else for (const peer of team) if (peer !== team[seat]) this.host.send(peer, leave);
        return;
      }
      case "leave":
        this.teamed.delete(from);
        this.dropInvite(from);
        if (standing.kind === "playing" && standing.team.includes(from)) this.dropTeammate(from);
        else if (joining) {
          this.standing = { kind: "free" };
          this.host.notice({ kind: "withdrawn", peer: from });
        } else if (standing.kind === "inviting" && standing.joined.includes(from)) {
          // A joiner took their accept back: the inviter asks on, and their seat goes to whoever accepts next.
          this.standing = { ...standing, joined: standing.joined.filter((peer) => peer !== from) };
        }
        return;
      default: {
        if (!this.playing || standing.kind !== "playing" || standing.challenge.id !== message.challenge) return;
        const seat = standing.team.indexOf(from);
        if (seat < 0 || seat === standing.seat || this.gone.has(seat)) return;
        play(this.playing, seat, message);
      }
    }
  }

  private dropInvite(peer: string): void {
    if (this.invites.delete(peer) && this.standing.kind === "free") this.host.notice({ kind: "expired", peer });
  }

  /** A teammate left: the rest carry on without them, and with no one left this player's co-op ends. */
  private dropTeammate(peer: string): void {
    const { standing, playing } = this;
    if (standing.kind !== "playing" || !playing) return;
    const seat = standing.team.indexOf(peer);
    if (seat < 0 || seat === standing.seat || this.gone.has(seat)) return;
    this.gone.add(seat);
    if (this.teammates.length === 0) {
      this.stopPlaying();
      this.host.end({ kind: "left", peer });
      return;
    }
    this.host.notice({ kind: "left", peer });
    playing.drop(seat);
  }

  private play(challenge: Challenge, team: readonly string[], seat: number): void {
    // Playing before the session begins, so a first ready sent as it begins has its team to go to.
    this.standing = { kind: "playing", challenge, team, seat };
    this.gone = new Set();
    this.playing = this.host.begin(challenge, seat, team.length);
  }
}

function play(session: ChallengeSession, seat: number, message: ChallengeMessage): void {
  switch (message.type) {
    case "retry":
      session.follow(message.attempt);
      return;
    case "ready":
      session.placed(seat, message.attempt);
      return;
    case "result":
      session.report(message.attempt, seat, message.result, message.points);
      return;
    case "lost":
      session.adoptLoss(message.attempt, message.results);
      return;
  }
}
