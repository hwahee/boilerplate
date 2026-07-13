/**
 * React binding for the remote-config store. Consumption is ONE hook:
 *
 *   const { config } = useConfig();
 *   if (config.features.myFlag) …
 *
 * The provider owns the store lifecycle (init → start polling/push → stop)
 * and re-renders consumers on every config change.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';

import { env } from '../config/env';
import { useApi } from '../api/ApiProvider';
import { KV_KEYS, kvStore } from '../storage/kv-store';
import { RemoteConfigStore, type RemoteConfigState, type SocketLike } from './remote-config';

interface ConfigContextValue extends RemoteConfigState {
  /** Manual refresh (used by foreground return, pull-to-refresh, …). */
  refresh: () => Promise<void>;
  /** Foreground return: refresh + reconnect the push socket. */
  notifyForeground: () => void;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: PropsWithChildren) {
  const api = useApi();

  // The store is created once per provider mount (lazy useState initializer);
  // the api reference is stable for the app's lifetime (see ApiProvider).
  const [store] = useState(
    () =>
      new RemoteConfigStore({
        fetchConfig: (etag) => api.getAppConfig(etag),
        cache: {
          load: () => kvStore.getJson(KV_KEYS.configCache),
          save: (value) => kvStore.setJson(KV_KEYS.configCache, value),
        },
        createSocket: () => new WebSocket(env.wsUrl) as unknown as SocketLike,
      }),
  );

  useEffect(() => {
    void store.init();
    store.start();
    return () => store.stop();
  }, [store]);

  const state = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getState(),
  );

  return (
    <ConfigContext.Provider
      value={{
        ...state,
        refresh: () => store.refresh(),
        notifyForeground: () => store.notifyForeground(),
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfig must be used within <ConfigProvider>');
  return context;
}
