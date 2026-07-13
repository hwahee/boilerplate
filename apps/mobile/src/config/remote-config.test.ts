import { describe, expect, test } from 'bun:test';

import { DEFAULT_APP_CONFIG } from '@app/shared/domain/app-config';

import type { AppConfigFetchResult } from '../api/endpoints';
import { RemoteConfigStore, type RemoteConfigCache } from './remote-config';

function makeStore(options: {
  responses?: AppConfigFetchResult[];
  cache?: RemoteConfigCache;
  onFetch?: (etag: string | null) => void;
  fail?: boolean;
}) {
  const responses = [...(options.responses ?? [])];
  const controls = { fail: options.fail ?? false };
  const store = new RemoteConfigStore({
    fetchConfig: (etag) => {
      options.onFetch?.(etag);
      if (controls.fail) return Promise.reject(new Error('offline'));
      const next = responses.shift();
      if (!next) return Promise.resolve({ payload: null, etag });
      return Promise.resolve(next);
    },
    cache: options.cache,
  });
  return Object.assign(store, { controls });
}

const RESPONSE_R3: AppConfigFetchResult = {
  payload: {
    revision: 3,
    entries: { maintenance: { enabled: true, message: 'be back soon' } },
  },
  etag: '"cfg-3"',
};

describe('RemoteConfigStore', () => {
  test('starts with defaults, applies a network snapshot on init', async () => {
    const store = makeStore({ responses: [RESPONSE_R3] });
    expect(store.getState()).toEqual({
      config: DEFAULT_APP_CONFIG,
      revision: 0,
      source: 'default',
    });

    await store.init();
    const state = store.getState();
    expect(state.source).toBe('network');
    expect(state.revision).toBe(3);
    expect(state.config.maintenance).toEqual({ enabled: true, message: 'be back soon' });
    // Unlisted keys keep their defaults.
    expect(state.config.bootAd).toEqual(DEFAULT_APP_CONFIG.bootAd);
  });

  test('sends the stored ETag and treats 304 as "no change"', async () => {
    const etags: (string | null)[] = [];
    const store = makeStore({ responses: [RESPONSE_R3], onFetch: (etag) => etags.push(etag) });

    await store.init(); // 200, revision 3
    await store.refresh(); // 304
    expect(etags).toEqual([null, '"cfg-3"']);
    expect(store.getState().revision).toBe(3);
    expect(store.getState().source).toBe('network');
  });

  test('loads the disk cache before any network I/O (offline cold start)', async () => {
    const cache: RemoteConfigCache = {
      load: () =>
        Promise.resolve({
          revision: 2,
          entries: { noticeBanner: { enabled: true, text: 'cached!', url: null } },
          etag: '"cfg-2"',
        }),
      save: () => Promise.resolve(),
    };
    const store = makeStore({ cache, fail: true });
    await store.init(); // network fails — cache must win over defaults
    const state = store.getState();
    expect(state.source).toBe('cache');
    expect(state.revision).toBe(2);
    expect(state.config.noticeBanner.text).toBe('cached!');
  });

  test('persists fresh snapshots to the cache', async () => {
    const saved: unknown[] = [];
    const cache: RemoteConfigCache = {
      load: () => Promise.resolve(null),
      save: (value) => {
        saved.push(value);
        return Promise.resolve();
      },
    };
    const store = makeStore({ responses: [RESPONSE_R3], cache });
    await store.init();
    expect(saved).toEqual([
      { revision: 3, entries: RESPONSE_R3.payload!.entries, etag: '"cfg-3"' },
    ]);
  });

  test('fetch failures never throw and never clobber good state', async () => {
    const store = makeStore({ responses: [RESPONSE_R3] });
    await store.init();

    const failing = new RemoteConfigStore({
      fetchConfig: () => Promise.reject(new Error('boom')),
    });
    await failing.init(); // must not throw
    expect(failing.getState().source).toBe('default');

    // Existing store keeps its data on later failures too.
    store.controls.fail = true;
    await store.refresh();
    expect(store.getState().revision).toBe(3);
  });

  test('notifies subscribers on every state change', async () => {
    let notified = 0;
    const store = makeStore({ responses: [RESPONSE_R3] });
    store.subscribe(() => (notified += 1));
    await store.init();
    expect(notified).toBe(1);
  });
});
