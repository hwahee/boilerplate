/**
 * Remote-config store — framework-free core (unit-tested under bun; the
 * React binding lives in ./ConfigProvider.tsx).
 *
 * Freshness strategy (both paths, complementing each other):
 *   1. POLLING — every `configPolling.intervalMs` (server-controlled,
 *      default 1 min) with `If-None-Match`, so an unchanged config costs a
 *      bodyless 304.
 *   2. PUSH — a WebSocket receives `config.changed` broadcasts and triggers
 *      an immediate refresh. Reconnects with exponential backoff; while the
 *      socket is down, polling still guarantees eventual freshness. On
 *      foreground return the app calls `notifyForeground()` (refresh +
 *      reconnect) since sockets die in the background.
 *
 * Resilience: the last good config is cached on disk and loaded before any
 * network I/O; parse failures fall back per-key (see parseAppConfig). A
 * fetch failure never throws out of this class — offline is a normal state.
 */
import { DEFAULT_APP_CONFIG, parseAppConfig, type AppConfig } from '@app/shared/domain/app-config';

import type { AppConfigFetchResult } from '../api/endpoints';

export interface RemoteConfigState {
  config: AppConfig;
  revision: number;
  /** Where the current value came from — 'default' means "no data yet". */
  source: 'default' | 'cache' | 'network';
}

interface CachedConfig {
  revision: number;
  entries: Record<string, unknown>;
  etag: string | null;
}

export interface RemoteConfigCache {
  load(): Promise<CachedConfig | null>;
  save(value: CachedConfig): Promise<void>;
}

/** Minimal WebSocket surface (RN + Bun compatible, mockable in tests). */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((error: unknown) => void) | null;
  close(): void;
}

export interface RemoteConfigDeps {
  fetchConfig(etag: string | null): Promise<AppConfigFetchResult>;
  cache?: RemoteConfigCache;
  /** Return null to disable the push path (tests, unsupported envs). */
  createSocket?: () => SocketLike | null;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export class RemoteConfigStore {
  private state: RemoteConfigState = {
    config: DEFAULT_APP_CONFIG,
    revision: 0,
    source: 'default',
  };
  private etag: string | null = null;
  private listeners = new Set<() => void>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs = DEFAULT_APP_CONFIG.configPolling.intervalMs;
  private socket: SocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = RECONNECT_BASE_MS;
  private running = false;
  private refreshing = false;

  constructor(private readonly deps: RemoteConfigDeps) {}

  getState(): RemoteConfigState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Loads the disk cache (instant, offline-safe), then hits the network. */
  async init(): Promise<void> {
    const cached = await this.deps.cache?.load();
    if (cached && this.state.source === 'default') {
      this.etag = cached.etag;
      this.setState({
        config: parseAppConfig(cached.entries),
        revision: cached.revision,
        source: 'cache',
      });
    }
    await this.refresh();
  }

  /** Conditional fetch; 304 and network failures are silent no-ops. */
  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const result = await this.deps.fetchConfig(this.etag);
      if (result.payload) {
        this.etag = result.etag;
        this.setState({
          config: parseAppConfig(result.payload.entries),
          revision: result.payload.revision,
          source: 'network',
        });
        await this.deps.cache?.save({
          revision: result.payload.revision,
          entries: result.payload.entries,
          etag: result.etag,
        });
      }
    } catch {
      // Offline / server hiccup: keep the current (cached) config.
    } finally {
      this.refreshing = false;
    }
  }

  /** Starts polling + the push socket. Idempotent. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedulePolling();
    this.connectSocket();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  /** Foreground return: sockets die in the background — refresh + reconnect. */
  notifyForeground(): void {
    void this.refresh();
    if (this.running && !this.socket) {
      this.reconnectDelayMs = RECONNECT_BASE_MS;
      this.connectSocket();
    }
  }

  private setState(next: RemoteConfigState): void {
    this.state = next;
    // The polling cadence itself is remote-controlled; apply changes live.
    const interval = next.config.configPolling.intervalMs;
    if (interval !== this.pollIntervalMs) {
      this.pollIntervalMs = interval;
      if (this.running) this.schedulePolling();
    }
    for (const listener of this.listeners) listener();
  }

  private schedulePolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => void this.refresh(), this.pollIntervalMs);
  }

  private connectSocket(): void {
    const socket = this.deps.createSocket?.() ?? null;
    if (!socket) return;
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectDelayMs = RECONNECT_BASE_MS; // healthy again
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string };
        if (message.type === 'config.changed') void this.refresh();
      } catch {
        // Ignore malformed frames.
      }
    };
    const scheduleReconnect = () => {
      this.socket = null;
      if (!this.running) return;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connectSocket(), this.reconnectDelayMs);
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS);
    };
    socket.onclose = scheduleReconnect;
    socket.onerror = () => socket.close();
  }
}
