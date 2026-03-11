import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import chatRouter from '../../server/src/routes/chat.js';
import {
  deleteConversation,
  saveConversation,
} from '../../server/src/storage/ConversationStorage.js';
import type { StoredConversation } from '../../server/src/types/index.js';
import { SubAgent } from '../../server/src/agent/SubAgent.js';

const app = express();
app.use(express.json());
app.use('/api', chatRouter);
const conversationId = 'test-conversation';

describe('Chat API', () => {
  beforeEach(() => {
    vi.spyOn(SubAgent.prototype, 'run').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeAll(async () => {
    const conversation: StoredConversation = {
      id: conversationId,
      name: 'Test Conversation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    await saveConversation(conversation);
  });

  afterAll(async () => {
    await deleteConversation(conversationId).catch(() => {});
  });

  describe('POST /api/chat', () => {
    it('should return 400 if sessionId is missing', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Hello' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('conversationId and message (or images) are required');
    });

    it('should return 400 if message is missing', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ conversationId });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('conversationId and message (or images) are required');
    });

    it('should return 200 and threadId for valid request', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({
          conversationId,
          message: 'Hello',
          conversationHistory: [],
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('threadId');
      expect(typeof response.body.threadId).toBe('string');
    });

    it('should accept conversation history', async () => {
      const conversationHistory = [
        { role: 'user', content: 'Previous message' },
        { role: 'assistant', content: 'Previous response' },
      ];

      const response = await request(app)
        .post('/api/chat')
        .send({
          conversationId,
          message: 'Hello',
          conversationHistory,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('threadId');
    });

    it('should reject a new message while the same conversation is still running', async () => {
      vi.restoreAllMocks();
      let resolveRun: (() => void) | null = null;
      vi.spyOn(SubAgent.prototype, 'run').mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveRun = resolve;
          })
      );

      const firstResponse = await request(app)
        .post('/api/chat')
        .send({
          conversationId,
          message: 'First message',
          conversationHistory: [],
        });

      expect(firstResponse.status).toBe(200);

      const secondResponse = await request(app)
        .post('/api/chat')
        .send({
          conversationId,
          message: 'Second message',
          conversationHistory: [],
        });

      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body.error).toBe('Conversation is still running.');

      resolveRun?.();
    });
  });
});
