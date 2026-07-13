/**
 * Boot-screen ad slot — interface only; NO ad SDK ships with the
 * boilerplate. Wiring a real network (AdMob, …) means implementing
 * `AdProvider` in one new file and swapping it where the boot screen
 * creates its slot (src/boot/useBootSequence.ts).
 *
 * Timing rules (enforced by the boot machine, not by providers):
 *   - min show time + skippability come from remote config (`bootAd`),
 *   - a slow/failed load NEVER blocks app entry (timeout → enter app).
 */

export interface AdSlotEvents {
  /** The creative is loaded and visible content can be shown. */
  onReady(): void;
  /** Loading or playback failed — the boot flow moves on. */
  onFailed(reason?: string): void;
  /** The creative finished on its own (e.g. video ended). */
  onCompleted(): void;
}

export interface AdSlot {
  /** Begin loading; report lifecycle via `events`. Must be abandonable. */
  start(events: AdSlotEvents): void;
  /** Cancel timers/requests; called on unmount, timeout and skip. */
  dispose(): void;
}

export interface AdProvider {
  createBootAdSlot(): AdSlot;
}
