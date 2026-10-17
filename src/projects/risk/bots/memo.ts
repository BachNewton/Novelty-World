/** Remembers a pure function's answers by a key that names everything the answer reads.
 *  Bounded: once it holds `limit` answers it forgets them all and starts again, which
 *  changes only the time an answer takes, never the answer. */
export class Memo<V> {
  private answers = new Map<string, V>();

  constructor(private readonly limit: number) {}

  get(key: string, compute: () => V): V {
    const known = this.answers.get(key);
    if (known !== undefined) return known;
    if (this.answers.size >= this.limit) this.answers = new Map();
    const answer = compute();
    this.answers.set(key, answer);
    return answer;
  }
}

/** One memo per settings object, so bots with different settings never share answers. */
export function memoFor<K extends object, V>(memos: WeakMap<K, Memo<V>>, settings: K, limit: number): Memo<V> {
  let memo = memos.get(settings);
  if (memo === undefined) memos.set(settings, (memo = new Memo(limit)));
  return memo;
}
