import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chatRouter from './routes/chat.js';
import eventsRouter from './routes/events.js';
import conversationsRouter from './routes/conversations.js';
import configRouter from './routes/config.js';
import { config, activeModel, validateConfig, workspaceDir, CONFIG_PATH } from '../../config.js';
import { logger, log } from './utils/logger.js';
import { loadSkills } from './skills/SkillLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    log.info(`${req.method} ${req.path}`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('user-agent'),
    });
  });
  next();
});

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, '../public')));

app.use('/api', chatRouter);
app.use('/api', eventsRouter);
app.use('/api', conversationsRouter);
app.use('/api', configRouter);

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next();
  res.sendFile(join(__dirname, '../public', 'index.html'));
});

app.get('/health', (_req, res) => {
  const validation = validateConfig();
  res.json({
    status: validation.valid ? 'ok' : 'misconfigured',
    provider: config.provider,
    model: activeModel(),
    baseUrl: config.provider === 'openai' ? config.openai.baseUrl : undefined,
    configFile: CONFIG_PATH,
    workspace: workspaceDir,
    ...(validation.errors.length > 0 && { configErrors: validation.errors }),
  });
});

app.listen(config.server.port, () => {
  const model = activeModel();
  const providerLabel = config.provider === 'openai'
    ? `OpenAI-compatible  [${config.openai.baseUrl}]`
    : `Anthropic`;

  const validation = validateConfig();
  const skills = loadSkills();

  log.info('Asyn Agents Server started', {
    url: `http://localhost:${config.server.port}`,
    provider: providerLabel,
    model,
    configFile: CONFIG_PATH,
    workspace: workspaceDir,
    logLevel: config.logging.level,
    configured: validation.valid,
    skills: skills.map((s) => s.name),
  });

  console.log(`\n🚀 Asyn Agents Server`);
  console.log(`   URL:       http://localhost:${config.server.port}`);
  console.log(`   Provider:  ${providerLabel}`);
  console.log(`   Model:     ${model}`);
  console.log(`   Config:    ${CONFIG_PATH}`);
  console.log(`   Workspace: ${workspaceDir}`);
  if (validation.valid) {
    console.log(`   API Key:   ✓ configured`);
  } else {
    console.log(`   API Key:   ✗ missing`);
    validation.errors.forEach(e => console.log(`              ⚠ ${e}`));
  }
  if (skills.length > 0) {
    console.log(`   Skills:    ${skills.map((s) => s.name).join(', ')}`);
  }
  console.log();
});

// 优雅关闭
process.on('SIGTERM', () => {
  log.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
