/**
 * Health endpoints — deliberately split in two so orchestrators can
 * distinguish "process is alive" from "instance can take traffic":
 *
 *   GET /api/health/live   — liveness: the process is up. Never touches
 *                            dependencies; restarting on failure is correct.
 *   GET /api/health/ready  — readiness: DB reachable and not shutting down.
 *                            Returns 503 during graceful shutdown so load
 *                            balancers drain this instance first.
 */
import type { Container } from '../container';
import { json } from '../http/respond';

export interface AppState {
  shuttingDown: boolean;
}

export function livenessRoute() {
  return {
    GET: () => json({ status: 'ok' }),
  };
}

export function readinessRoute(container: Container, state: AppState) {
  return {
    GET: async () => {
      if (state.shuttingDown) {
        return json({ ready: false, db: 'unknown', reason: 'shutting_down' }, { status: 503 });
      }
      const dbUp = await container.dbPing();
      return json({ ready: dbUp, db: dbUp ? 'up' : 'down' }, { status: dbUp ? 200 : 503 });
    },
  };
}
