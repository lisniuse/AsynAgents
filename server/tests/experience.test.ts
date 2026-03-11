import { describe, expect, it } from 'vitest';
import { buildExperiencePrompt } from '../src/experience/ExperienceLoader.js';
import { shouldAutoSummarizeConversation } from '../src/experience/ExperienceSummarizer.js';
import type { StoredConversation } from '../src/types/index.js';

describe('buildExperiencePrompt', () => {
  it('renders the experience index for the system prompt', () => {
    const prompt = buildExperiencePrompt([
      {
        fileName: 'retry_provider_timeout.md',
        title: 'Retry flaky provider requests',
        summary: 'Retry once with a shorter context when the provider flakes.',
        keywords: ['retry', 'provider_timeout'],
        sourceConversations: ['c1'],
        updatedAt: '2026-03-10T00:00:00.000Z',
        body: '## Experience',
      },
    ]);

    expect(prompt).toContain('## Experience System');
    expect(prompt).toContain('get_experience');
    expect(prompt).toContain('retry_provider_timeout');
  });
});

describe('shouldAutoSummarizeConversation', () => {
  const baseConversation: StoredConversation = {
    id: 'conversation-1',
    name: 'Conversation',
    createdAt: 1,
    updatedAt: 2,
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'How should we retry provider errors?',
        timestamp: 0,
      },
      {
        id: 'm2',
        role: 'assistant',
        content: 'Retry once with a shorter context.',
        timestamp: 1000,
      },
    ],
  };

  it('returns true when the conversation is idle and has unsummarized content', () => {
    const shouldSummarize = shouldAutoSummarizeConversation(
      baseConversation,
      { lastSummarizedMessageCount: 0 },
      21 * 60 * 1000,
      20
    );

    expect(shouldSummarize).toBe(true);
  });

  it('returns false when there is no new content since the previous summary', () => {
    const shouldSummarize = shouldAutoSummarizeConversation(
      baseConversation,
      { lastSummarizedMessageCount: 2 },
      21 * 60 * 1000,
      20
    );

    expect(shouldSummarize).toBe(false);
  });

  it('ignores summary note messages when checking for new content', () => {
    const shouldSummarize = shouldAutoSummarizeConversation(
      {
        ...baseConversation,
        messages: [
          ...baseConversation.messages,
          {
            id: 'm3',
            role: 'assistant',
            content: 'Created experience: retry_provider_timeout.md',
            timestamp: 2000,
            kind: 'summary_note',
          },
        ],
      },
      { lastSummarizedMessageCount: 2 },
      21 * 60 * 1000,
      20
    );

    expect(shouldSummarize).toBe(false);
  });

  it('returns false for project mode conversations', () => {
    const shouldSummarize = shouldAutoSummarizeConversation(
      {
        ...baseConversation,
        projectSession: {
          mode: 'project',
          projectPath: 'D:/demo',
          projectName: 'demo',
          selectedAt: 123,
        },
      },
      { lastSummarizedMessageCount: 0 },
      21 * 60 * 1000,
      20
    );

    expect(shouldSummarize).toBe(false);
  });
});
