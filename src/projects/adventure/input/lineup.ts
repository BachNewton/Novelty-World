/**
 * Who plays with what, as couch co-op games share inputs out: the keyboard and
 * mouse is one input, each pad another. The first player always plays, on every
 * input the second doesn't hold. A second joins by pressing join on an input the
 * first isn't using (another pad, or the keyboard while the first plays on a
 * pad), holds that input alone, and leaves by pressing join on it again, or when
 * their pad is unplugged. Pure: the controls feed it what was used and pressed.
 */

/** An input: the keyboard and mouse, or a pad by its slot. */
export type Input = "keys" | number;

export interface Lineup {
  /** What the first player used last: the input that can't join, since it is theirs. */
  first: Input;
  /** What the second player holds, or null while the first plays alone. */
  second: Input | null;
}

export const ALONE: Lineup = { first: "keys", second: null };

/** Which player an input plays for: 0 for the first, 1 for the second. */
export function playerOf(lineup: Lineup, input: Input): 0 | 1 {
  return input === lineup.second ? 1 : 0;
}

/** The lineup after an input was used: the first player's own input follows them. */
export function used(lineup: Lineup, input: Input): Lineup {
  return playerOf(lineup, input) === 0 && input !== lineup.first ? { ...lineup, first: input } : lineup;
}

/** The lineup after join was pressed on an input: a second player joins on it, or leaves from it. */
export function pressedJoin(lineup: Lineup, input: Input): Lineup {
  if (lineup.second === null) return input === lineup.first ? lineup : { ...lineup, second: input };
  return input === lineup.second ? { ...lineup, second: null } : lineup;
}

/** The lineup after a pad was unplugged: a second player on it leaves, and a first player on it is back on the keyboard. */
export function padLeft(lineup: Lineup, slot: number): Lineup {
  return {
    first: lineup.first === slot ? "keys" : lineup.first,
    second: lineup.second === slot ? null : lineup.second,
  };
}
