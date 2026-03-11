import { Router } from 'express';
import { writeFileSync } from 'fs';
import { CONFIG_PATH, config } from '../../../config.js';
import { probePythonTool } from '../agent/tools.js';

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
      pythonAvailable: pythonProbe.available,
      pythonPath: config.python.path,
      pythonError: pythonProbe.error,
    });
  } catch {
    res.status(500).json({ error: 'Failed to write config' });
  }
});

export default router;
