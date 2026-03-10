import { EventEmitter } from 'events';
import type { SSEEvent } from '../types/index.js';

// Keep buffer for 10 minutes after agent finishes, so late reconnects can replay
const BUFFER_TTL_MS = 10 * 60 * 1000;

class MessageQueue extends EventEmitter {
  private buffers = new Map<string, SSEEvent[]>();
  private cleanupTimers = new Map<string, NodeJS.Timeout>();

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  publish(conversationId: string, event: SSEEvent): void {
    if (!this.buffers.has(conversationId)) {
      this.buffers.set(conversationId, []);
    }
    const buf = this.buffers.get(conversationId)!;
    buf.push(event);
    this.emit(conversationId, event, buf.length - 1);

    // Schedule buffer cleanup after agent finishes
    if (event.type === 'agent_done' || event.type === 'agent_stopped' || event.type === 'error') {
      const existing = this.cleanupTimers.get(conversationId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        this.buffers.delete(conversationId);
        this.cleanupTimers.delete(conversationId);
      }, BUFFER_TTL_MS);
      this.cleanupTimers.set(conversationId, timer);
    }
  }

  /** Subscribe, replaying buffered events from fromIndex first, then streaming new ones. */
  subscribe(
    conversationId: string,
    handler: (event: SSEEvent, index: number) => void,
    fromIndex = 0
  ): () => void {
    const buffer = this.buffers.get(conversationId) ?? [];
    for (let i = fromIndex; i < buffer.length; i++) {
      handler(buffer[i], i);
    }
    this.on(conversationId, handler);
    return () => this.off(conversationId, handler);
  }
}

export const messageQueue = new MessageQueue();
