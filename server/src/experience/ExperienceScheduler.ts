import { config, validateConfig } from '../../../config.js';
import { isConversationRunning } from '../routes/chat.js';
import { listConversations } from '../storage/ConversationStorage.js';
import { createChildLogger } from '../utils/logger.js';
import { getConversationExperienceState } from './ExperienceStateStorage.js';
import { shouldAutoSummarizeConversation, summarizeConversation } from './ExperienceSummarizer.js';

export class ExperienceScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly logger = createChildLogger('ExperienceScheduler');

  start(): void {
    if (this.timer) {
      return;
    }

    const intervalMs = Math.max(30000, config.experience.scanIntervalMs || 60000);
    this.timer = setInterval(() => {
      void this.runOnce();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const validation = validateConfig();
      if (!validation.valid) {
        return;
      }

      const conversations = await listConversations();
      const now = Date.now();

      for (const conversation of conversations) {
        if (isConversationRunning(conversation.id)) {
          continue;
        }

        const state = await getConversationExperienceState(conversation.id);
        if (!shouldAutoSummarizeConversation(conversation, state, now, config.experience.idleMinutes)) {
          continue;
        }

        try {
          const result = await summarizeConversation(conversation, { trigger: 'auto' });
          if (!result.skipped && result.experience) {
            this.logger.info('Auto-summarized conversation into experience', {
              conversationId: conversation.id,
              fileName: result.experience.fileName,
            });
          }
        } catch (error) {
          this.logger.error('Failed to auto-summarize conversation', {
            conversationId: conversation.id,
            error: (error as Error).message,
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
