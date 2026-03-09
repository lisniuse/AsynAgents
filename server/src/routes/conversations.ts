import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as storage from '../storage/ConversationStorage.js';
import type { StoredConversation } from '../types/index.js';

const router = Router();

router.get('/conversations', async (_req, res) => {
  try {
    const conversations = await storage.listConversations();
    res.json(conversations);
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
    if (!existing) return res.status(404).json({ error: 'Not found' });
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
    if (!success) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
