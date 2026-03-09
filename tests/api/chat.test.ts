import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import chatRouter from '../../server/src/routes/chat.js';

const app = express();
app.use(express.json());
app.use('/api', chatRouter);

describe('Chat API', () => {
  describe('POST /api/chat', () => {
    it('should return 400 if sessionId is missing', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Hello' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('sessionId and message are required');
    });

    it('should return 400 if message is missing', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'test-session' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('sessionId and message are required');
    });

    it('should return 200 and threadId for valid request', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({
          sessionId: 'test-session',
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
          sessionId: 'test-session',
          message: 'Hello',
          conversationHistory,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('threadId');
    });
  });
});
