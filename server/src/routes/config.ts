import { Router } from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CONFIG_PATH, config } from '../../../config.js';
import { probePythonTool } from '../agent/tools.js';
import { resolveWritableImagesDir } from '../utils/runtimePaths.js';

const router = Router();
const PERSONA_NAME_PATTERN = /^[A-Za-z0-9_\u3400-\u9FFF]{0,32}$/u;

function deepMergeOneLevel(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
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

  return merged;
}

function syncRuntimeConfig(nextConfig: typeof config): void {
  config.provider = nextConfig.provider;
  config.maxIterations = nextConfig.maxIterations;
  config.python = nextConfig.python;
  config.experience = nextConfig.experience;
  config.anthropic = nextConfig.anthropic;
  config.openai = nextConfig.openai;
  config.server = nextConfig.server;
  config.app = nextConfig.app;
  config.workspace = nextConfig.workspace;
  config.logging = nextConfig.logging;
  config.ui = nextConfig.ui;
  config.persona = nextConfig.persona;
}

function guessAvatarExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/webp') return '.webp';
  if (normalized === 'image/gif') return '.gif';
  if (normalized === 'image/svg+xml') return '.svg';
  return '.jpg';
}

function savePersonaAvatar(slot: 'ai' | 'user', dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error(`Invalid ${slot} avatar image data`);
  }

  const imagesDir = resolveWritableImagesDir();
  mkdirSync(imagesDir, { recursive: true });
  const extension = guessAvatarExtension(match[1]);
  const fileName = `persona-${slot}-${Date.now()}${extension}`;
  writeFileSync(join(imagesDir, fileName), Buffer.from(match[2], 'base64'));
  return `/images/${fileName}`;
}

function normalizePersonaAvatars(persona: Record<string, unknown> | undefined): void {
  if (!persona) {
    return;
  }

  for (const slot of ['ai', 'user'] as const) {
    const key = slot === 'ai' ? 'aiAvatar' : 'userAvatar';
    const value = persona[key];
    if (typeof value === 'string' && value.startsWith('data:image/')) {
      persona[key] = savePersonaAvatar(slot, value);
    }
  }
}

function validatePersonaNames(persona: unknown): string | null {
  if (!persona || typeof persona !== 'object') {
    return null;
  }

  const { aiName, userName } = persona as { aiName?: unknown; userName?: unknown };
  for (const [label, value] of [['aiName', aiName], ['userName', userName]] as const) {
    if (typeof value !== 'string') {
      continue;
    }
    if (!PERSONA_NAME_PATTERN.test(value)) {
      return `${label} must be 0-32 characters and contain only letters, numbers, underscores, or Chinese characters`;
    }
  }

  return null;
}

router.get('/config', (_req, res) => {
  try {
    res.json(config);
  } catch {
    res.status(500).json({ error: 'Failed to read config' });
  }
});

router.put('/config', async (req, res) => {
  try {
    const existing = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
    const incoming = req.body as Record<string, unknown>;
    const merged = deepMergeOneLevel(existing, incoming);
    normalizePersonaAvatars(merged.persona as Record<string, unknown> | undefined);
    const personaError = validatePersonaNames(merged.persona);

    if (personaError) {
      res.status(400).json({ ok: false, error: personaError });
      return;
    }

    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    syncRuntimeConfig(merged as unknown as typeof config);

    const pythonProbe = await probePythonTool();
    res.json({
      ok: true,
      config: merged,
      pythonAvailable: pythonProbe.available,
      pythonPath: config.python.path,
      pythonError: pythonProbe.error,
    });
  } catch {
    res.status(500).json({ error: 'Failed to write config' });
  }
});

export default router;
