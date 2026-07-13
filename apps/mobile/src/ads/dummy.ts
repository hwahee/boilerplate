/**
 * Dummy ad provider: pretends to load a creative, then "plays" it for a few
 * seconds. Lets the whole boot-ad flow (min show, skip, timeout, failure)
 * be exercised without any ad SDK. The boot screen renders a placeholder
 * card while this is "showing".
 */
import type { AdProvider, AdSlot, AdSlotEvents } from './types';

const FAKE_LOAD_MS = 700;
const FAKE_PLAY_MS = 2_500;

export const dummyAdProvider: AdProvider = {
  createBootAdSlot(): AdSlot {
    let timers: ReturnType<typeof setTimeout>[] = [];
    return {
      start(events: AdSlotEvents) {
        timers.push(
          setTimeout(() => {
            events.onReady();
            timers.push(setTimeout(() => events.onCompleted(), FAKE_PLAY_MS));
          }, FAKE_LOAD_MS),
        );
      },
      dispose() {
        for (const timer of timers) clearTimeout(timer);
        timers = [];
      },
    };
  },
};
