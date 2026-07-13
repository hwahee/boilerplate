/**
 * Worker role — background job processing.
 *
 * The same binary can run as `web`, `worker`, or `all` (SERVER_ROLE), so a
 * deployment can scale HTTP and background processing independently. Jobs
 * travel over the pub/sub bus: with the redis driver they are distributed
 * across instances; with the memory driver they stay in-process.
 *
 * Register new job types in `JOB_HANDLERS`.
 */
import { s, toValidator } from '@app/shared/validation';

import type { Container } from './container';
import { CHANNELS } from './pubsub';

const jobValidator = toValidator(
  s.looseObject({
    type: s.string().check(s.minLength(1)),
  }),
);

type JobHandler = (job: Record<string, unknown>, container: Container) => Promise<void>;

const pushBroadcastJobValidator = toValidator(
  s.looseObject({
    title: s.string().check(s.minLength(1)),
    body: s.string().check(s.minLength(1)),
    data: s.optional(s.record(s.string(), s.unknown())),
  }),
);

const JOB_HANDLERS: Record<string, JobHandler> = {
  /** Demo job published by TodoService.create. Replace with real work. */
  'todo.created': (job, container) => {
    container.log.info('worker processed job', { type: 'todo.created', todoId: job.todoId });
    return Promise.resolve();
  },

  /**
   * Broadcast push (config-change notices, marketing, …), enqueued by
   * POST /api/admin/push/broadcast. Delivery runs through the PushSender
   * facade — dry-run logging unless PUSH_DRIVER=expo.
   */
  'push.broadcast': async (job, container) => {
    const parsed = pushBroadcastJobValidator.safeParse(job);
    if (!parsed.ok) {
      container.log.warn('push.broadcast job malformed', { job });
      return;
    }
    const receipts = await container.pushTokenService().broadcast({
      title: parsed.value.title,
      body: parsed.value.body,
      data: parsed.value.data,
    });
    container.log.info('push.broadcast finished', {
      recipients: receipts.length,
      failed: receipts.filter((receipt) => !receipt.ok).length,
    });
  },
};

/** Starts consuming jobs; returns an unsubscribe function for shutdown. */
export async function startWorker(container: Container): Promise<() => Promise<void>> {
  const { log } = container;
  const unsubscribe = await container.pubsub().subscribe(CHANNELS.jobs, (message) => {
    const parsed = jobValidator.safeParse(message);
    if (!parsed.ok) {
      log.warn('worker received malformed job', { message });
      return;
    }
    const handler = JOB_HANDLERS[parsed.value.type];
    if (!handler) {
      log.warn('worker received unknown job type', { type: parsed.value.type });
      return;
    }
    handler(parsed.value, container).catch((error: unknown) => {
      log.error('job failed', {
        type: parsed.value.type,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
  log.info('worker started', { channel: CHANNELS.jobs });
  return unsubscribe;
}
