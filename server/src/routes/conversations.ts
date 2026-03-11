import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { validateConfig } from '../../../config.js';
import * as storage from '../storage/ConversationStorage.js';
import * as meta from '../storage/ConversationMeta.js';
import { deleteConversationExperienceState } from '../experience/ExperienceStateStorage.js';
import {
  getSummaryResultText,
  supportsExperienceSummaries,
  summarizeConversation,
} from '../experience/ExperienceSummarizer.js';
import { isConversationRunning } from './chat.js';
import type { StoredConversation } from '../types/index.js';
import {
  applyProjectBaseline,
  listProjectCheckpoints,
  initializeProjectSession,
  listProjectCandidates,
  listChangedProjectFiles,
  listProjectTree,
  readProjectFile,
  restoreProjectCheckpoint,
} from '../storage/ProjectSessionStorage.js';
import {
  deleteConversationProcess,
  listConversationProcesses,
  stopConversationProcess,
} from '../process/ManagedProcessStorage.js';

const router = Router();

router.get('/conversations', async (_req, res) => {
  try {
    const [conversations, metaMap] = await Promise.all([
      storage.listConversations(),
      meta.getAllMeta(),
    ]);
    const merged = conversations.map((conversation) => ({
      ...conversation,
      ...metaMap[conversation.id],
    }));
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/conversations', async (req, res) => {
  try {
    const { name = '新对话' } = req.body;
    const conversation: StoredConversation = {
      id: uuidv4(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    await storage.saveConversation(conversation);
    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/conversations/:id', async (req, res) => {
  try {
    const existing = await storage.getConversation(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { name, messages } = req.body;
    const updated: StoredConversation = {
      ...existing,
      ...(name !== undefined && { name }),
      ...(messages !== undefined && { messages }),
      updatedAt: Date.now(),
    };
    await storage.saveConversation(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/conversations/:id', async (req, res) => {
  try {
    const success = await storage.deleteConversation(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Not found' });
    }

    await meta.deleteMeta(req.params.id).catch(() => {});
    await deleteConversationExperienceState(req.params.id).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/conversations/:id/meta', async (req, res) => {
  try {
    const { pinned, bold } = req.body;
    const updated = await meta.updateMeta(req.params.id, { pinned, bold });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/conversations/:id/summarize', async (req, res) => {
  try {
    const conversationId = req.params.id;
    if (isConversationRunning(conversationId)) {
      res.status(409).json({ error: 'Conversation is still running.' });
      return;
    }

    const conversation = await storage.getConversation(conversationId);
    if (!conversation) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (!supportsExperienceSummaries(conversation)) {
      res.status(409).json({ error: 'Experience summaries are not available for project mode conversations.' });
      return;
    }

    const validation = validateConfig();
    if (!validation.valid) {
      res.status(503).json({ error: validation.errors.join('\n') });
      return;
    }

    const result = await summarizeConversation(conversation, {
      trigger: 'manual',
      force: true,
    });
    res.json({
      ...result,
      message: getSummaryResultText(result),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/projects', async (_req, res) => {
  try {
    const projects = await listProjectCandidates();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/conversations/:id/project/select', async (req, res) => {
  try {
    const existing = await storage.getConversation(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const projectPath = String(req.body.path ?? '').trim();
    const session = await initializeProjectSession(req.params.id, projectPath);
    const updated: StoredConversation = {
      ...existing,
      projectSession: session,
      updatedAt: Date.now(),
    };
    await storage.saveConversation(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/conversations/:id/project/tree', async (req, res) => {
  try {
    const tree = await listProjectTree(req.params.id);
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/conversations/:id/project/file', async (req, res) => {
  try {
    const relativePath = String(req.query.path ?? '');
    const file = await readProjectFile(req.params.id, relativePath);
    res.json(file);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/conversations/:id/project/changes', async (req, res) => {
  try {
    const changes = await listChangedProjectFiles(req.params.id);
    res.json(changes);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/conversations/:id/project/checkpoints', async (req, res) => {
  try {
    const checkpoints = await listProjectCheckpoints(req.params.id);
    res.json(checkpoints);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/conversations/:id/project/rollback-to-message', async (req, res) => {
  try {
    if (isConversationRunning(req.params.id)) {
      res.status(409).json({ error: 'Conversation is still running.' });
      return;
    }

    const conversation = await storage.getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const messageId = String(req.body.messageId ?? '').trim();
    if (!messageId) {
      res.status(400).json({ error: 'messageId is required' });
      return;
    }

    const targetIndex = conversation.messages.findIndex((message) => message.id === messageId);
    if (targetIndex === -1) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const targetMessage = conversation.messages[targetIndex];
    if (targetMessage.role !== 'user') {
      res.status(400).json({ error: 'Only user messages can be used as checkpoints' });
      return;
    }

    if (!targetMessage.checkpointId) {
      res.status(400).json({ error: 'This message does not have a checkpoint' });
      return;
    }

    await restoreProjectCheckpoint(req.params.id, targetMessage.checkpointId);

    const updated: StoredConversation = {
      ...conversation,
      messages: conversation.messages.slice(0, targetIndex),
      updatedAt: Date.now(),
    };
    await storage.saveConversation(updated);

    res.json({
      ok: true,
      inputMessage: targetMessage.content,
      conversation: updated,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/conversations/:id/project/checkpoints/:checkpointId/restore', async (req, res) => {
  try {
    const checkpoint = await restoreProjectCheckpoint(
      req.params.id,
      req.params.checkpointId
    );
    res.json({ ok: true, checkpoint });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/conversations/:id/project/apply', async (req, res) => {
  try {
    await applyProjectBaseline(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/conversations/:id/processes', async (req, res) => {
  try {
    const processes = await listConversationProcesses(req.params.id);
    res.json(processes);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/conversations/:id/processes/:processId/stop', async (req, res) => {
  try {
    const processInfo = await stopConversationProcess(req.params.id, req.params.processId);
    res.json(processInfo);
  } catch (err) {
    const message = (err as Error).message;
    const status = message === 'Process not found.' ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

router.delete('/conversations/:id/processes/:processId', async (req, res) => {
  try {
    await deleteConversationProcess(req.params.id, req.params.processId);
    res.json({ ok: true });
  } catch (err) {
    const message = (err as Error).message;
    const status = message === 'Process not found.'
      ? 404
      : message === 'Stop the process before deleting it.'
        ? 409
        : 500;
    res.status(status).json({ error: message });
  }
});

export default router;
