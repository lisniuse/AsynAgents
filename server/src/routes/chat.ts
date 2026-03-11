import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SubAgent } from '../agent/SubAgent.js';
import { validateConfig } from '../../../config.js';
import type { ChatRequest, ChatResponse } from '../types/index.js';
import { getConversation, saveConversation } from '../storage/ConversationStorage.js';
import { createProjectCheckpoint } from '../storage/ProjectSessionStorage.js';

const router = Router();
const runningAgents = new Map<string, SubAgent>();
const runningConversationThreads = new Map<string, Set<string>>();

function trackConversationThread(conversationId: string, threadId: string): void {
  const threads = runningConversationThreads.get(conversationId) ?? new Set<string>();
  threads.add(threadId);
  runningConversationThreads.set(conversationId, threads);
}

function untrackConversationThread(conversationId: string, threadId: string): void {
  const threads = runningConversationThreads.get(conversationId);
  if (!threads) {
    return;
  }

  threads.delete(threadId);
  if (threads.size === 0) {
    runningConversationThreads.delete(conversationId);
  }
}

export function isConversationRunning(conversationId: string): boolean {
  return (runningConversationThreads.get(conversationId)?.size ?? 0) > 0;
}

router.post('/chat', async (req, res) => {
  try {
    const validation = validateConfig();
    if (!validation.valid) {
      res.status(503).json({ error: validation.errors.join('\n') });
      return;
    }

    const { conversationId, conversationHistory, message, messageId, images } =
      req.body as ChatRequest;

    if (!conversationId || (!message && !images?.length)) {
      res.status(400).json({ error: 'conversationId and message (or images) are required' });
      return;
    }

    if (isConversationRunning(conversationId)) {
      res.status(409).json({ error: 'Conversation is still running.' });
      return;
    }

    const conversation = await getConversation(conversationId);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const threadId = uuidv4();
    const projectPath = conversation.projectSession?.projectPath;
    let checkpointId: string | undefined;

    if (projectPath && messageId) {
      const checkpoint = await createProjectCheckpoint(conversationId, { messageId });
      checkpointId = checkpoint.id;
      conversation.messages = conversation.messages.map((storedMessage) =>
        storedMessage.id === messageId
          ? { ...storedMessage, checkpointId }
          : storedMessage
      );
      conversation.updatedAt = Date.now();
      await saveConversation(conversation);
    }

    const response: ChatResponse = {
      threadId,
      ...(checkpointId ? { checkpointId } : {}),
    };
    res.json(response);

    const agent = new SubAgent();
    runningAgents.set(threadId, agent);
    trackConversationThread(conversationId, threadId);

    const finalizeThread = async () => {
      runningAgents.delete(threadId);
      untrackConversationThread(conversationId, threadId);
    };

    agent
      .run(
        threadId,
        conversationId,
        conversationHistory || [],
        message,
        images,
        projectPath
      )
      .then(finalizeThread)
      .catch(async (err: Error) => {
        console.error(`[Thread ${threadId}] Agent error:`, err.message);
        await finalizeThread();
      });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/chat/stop', (req, res) => {
  const { threadId } = req.body as { threadId: string };

  if (!threadId) {
    res.status(400).json({ error: 'threadId is required' });
    return;
  }

  const agent = runningAgents.get(threadId);
  if (agent) {
    agent.stop();
    res.json({ success: true, message: 'Stop signal sent' });
  } else {
    res.status(404).json({ error: 'Agent not found or already completed' });
  }
});

export default router;
