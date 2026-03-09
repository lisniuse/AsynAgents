import { EventEmitter } from 'events';
import type { SSEEvent } from '../types/index.js';

class MessageQueue extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  publish(sessionId: string, event: SSEEvent): void {
    this.emit(sessionId, event);
  }

  subscribe(sessionId: string, handler: (event: SSEEvent) => void): () => void {
    this.on(sessionId, handler);
    return () => this.off(sessionId, handler);
  }
}

export const messageQueue = new MessageQueue();
