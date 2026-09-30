import type { ChatMessage } from '@shared/domain/chat';

/** How many messages a room keeps on screen; older ones scroll away for good. */
const MAX_KEPT = 500;

/**
 * Folds newly received messages into the ones already held: ordered by `seq`,
 * each once — the same message may arrive both live and in a history
 * response, or as the answer to our own send.
 *
 * `after` marks a history response fetched with `?after=`: when it does not
 * pick up right after that number, more was missed than the room's backlog
 * covers, and the messages before the hole are dropped rather than shown as
 * if nothing had happened in between.
 */
export function mergeMessages(
  held: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
  options: { after?: number } = {},
): ChatMessage[] {
  const first = incoming[0];
  const missedSome =
    options.after !== undefined && first !== undefined && first.seq > options.after + 1;
  const kept = missedSome ? held.filter((message) => message.seq >= first.seq) : held;

  const bySeq = new Map(kept.map((message) => [message.seq, message]));
  for (const message of incoming) bySeq.set(message.seq, message);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_KEPT);
}
