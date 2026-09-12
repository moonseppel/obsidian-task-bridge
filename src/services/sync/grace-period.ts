/**
 * A debounce across passes: a key counts only once it has looked that way for the full duration.
 * A vault-sync tool can deliver `data.json` and the note out of step, and this rides that out.
 * In memory only, so a key that stops appearing is dropped rather than tracked forever.
 */
export class GracePeriod {
  private readonly durationMs: number;
  private readonly firstSeenAt = new Map<string, number>();
  private observedSinceSweep = new Set<string>();

  constructor(durationMs: number) {
    this.durationMs = durationMs;
  }

  /** Records this pass's sighting and answers whether the key is still waiting out its grace. */
  isPending(key: string, now: number = Date.now()): boolean {
    this.observedSinceSweep.add(key);

    const firstSeenAt = this.firstSeenAt.get(key);

    if (firstSeenAt === undefined) {
      this.firstSeenAt.set(key, now);
      return true;
    }

    return now - firstSeenAt < this.durationMs;
  }

  /** Forgets every key not observed since the last sweep, so its grace starts over if it returns. */
  sweep(): void {
    for (const key of this.firstSeenAt.keys()) {
      if (!this.observedSinceSweep.has(key)) {
        this.firstSeenAt.delete(key);
      }
    }

    this.observedSinceSweep = new Set();
  }
}
