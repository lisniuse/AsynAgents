import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { CONFIG_PATH } from '../../../config.js';

const router = Router();

/** GET /api/config — return current config file contents */
router.get('/config', (_req, res) => {
  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    res.json(JSON.parse(content));
  } catch {
    res.status(500).json({ error: 'Failed to read config' });
  }
});

/** PUT /api/config — deep-merge and save config */
router.put('/config', (req, res) => {
  try {
    const existing = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    const incoming = req.body as Record<string, unknown>;

    // Deep merge one level
    const merged: Record<string, unknown> = { ...existing };
    for (const key of Object.keys(incoming)) {
      if (
        typeof incoming[key] === 'object' &&
        incoming[key] !== null &&
        !Array.isArray(incoming[key]) &&
        typeof existing[key] === 'object' &&
        existing[key] !== null
      ) {
        merged[key] = { ...(existing[key] as object), ...(incoming[key] as object) };
      } else {
        merged[key] = incoming[key];
      }
    }

    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to write config' });
  }
});

export default router;
