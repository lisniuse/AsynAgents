import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import conversationsRouter from '../../server/src/routes/conversations.js';
import { deleteConversation, saveConversation } from '../../server/src/storage/ConversationStorage.js';
import type { StoredConversation } from '../../server/src/types/index.js';

const app = express();
app.use(express.json());
app.use('/api', conversationsRouter);

const standardConversationId = 'summary-standard-conversation';
const projectConversationId = 'summary-project-conversation';

describe('Conversations API', () => {
  beforeAll(async () => {
    const baseMessages = [
      {
        id: 'm1',
        role: 'user' as const,
        content: 'Summarize me',
        timestamp: Date.now() - 1000,
      },
      {
        id: 'm2',
        role: 'assistant' as const,
        content: 'ok',
        timestamp: Date.now(),
      },
    ];

    const standardConversation: StoredConversation = {
      id: standardConversationId,
      name: 'Standard Conversation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: baseMessages,
    };

    const projectConversation: StoredConversation = {
      id: projectConversationId,
      name: 'Project Conversation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: baseMessages,
      projectSession: {
        mode: 'project',
        projectName: 'demo',
        projectPath: 'D:/demo',
        selectedAt: Date.now(),
      },
    };

    await saveConversation(standardConversation);
    await saveConversation(projectConversation);
  });

  afterAll(async () => {
    await deleteConversation(standardConversationId).catch(() => {});
    await deleteConversation(projectConversationId).catch(() => {});
  });

  it('rejects manual summarize for project mode conversations', async () => {
    const response = await request(app).post(`/api/conversations/${projectConversationId}/summarize`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Experience summaries are not available for project mode conversations.');
  });
});
