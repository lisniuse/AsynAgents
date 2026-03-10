import cors from 'cors';
import express from 'express';
import { join } from 'path';
import { CONFIG_PATH, activeModel, config, validateConfig, workspaceDir } from '../../config.js';
import { isPythonToolAvailable, probePythonTool } from './agent/tools.js';
import { ExperienceScheduler } from './experience/ExperienceScheduler.js';
import { listExperiences } from './experience/ExperienceStorage.js';
import chatRouter from './routes/chat.js';
import configRouter from './routes/config.js';
import conversationsRouter from './routes/conversations.js';
import eventsRouter from './routes/events.js';
import { loadSkills } from './skills/SkillLoader.js';
import { resolveStaticDir } from './utils/runtimePaths.js';
import { log } from './utils/logger.js';

const app = express();
const staticDir = resolveStaticDir();

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
app.use(express.static(staticDir));

app.use('/api', chatRouter);
app.use('/api', eventsRouter);
app.use('/api', conversationsRouter);
app.use('/api', configRouter);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next();
  res.sendFile(join(staticDir, 'index.html'));
});

app.get('/health', async (_req, res) => {
  const validation = validateConfig();
  const experiences = await listExperiences().catch(() => []);
  res.json({
    status: validation.valid ? 'ok' : 'misconfigured',
    provider: config.provider,
    model: activeModel(),
    baseUrl: config.provider === 'openai' ? config.openai.baseUrl : undefined,
    pythonPath: config.python.path,
    pythonAvailable: isPythonToolAvailable(),
    configFile: CONFIG_PATH,
    workspace: workspaceDir,
    hostname: config.server.hostname,
    experienceCount: experiences.length,
    ...(validation.errors.length > 0 && { configErrors: validation.errors }),
  });
});

const experienceScheduler = new ExperienceScheduler();

async function bootstrap(): Promise<void> {
  const pythonProbe = await probePythonTool();
  experienceScheduler.start();
  const listenHost = config.server.hostname.trim();

  const onListening = async () => {
    const model = activeModel();
    const providerLabel = config.provider === 'openai'
      ? `OpenAI-compatible [${config.openai.baseUrl}]`
      : 'Anthropic';
    const hostForDisplay = listenHost || 'localhost';

    const validation = validateConfig();
    const skills = loadSkills();
    const experiences = await listExperiences().catch(() => []);

    log.info('Asyn Agents Server started', {
      url: `http://${hostForDisplay}:${config.server.port}`,
      provider: providerLabel,
      model,
      configFile: CONFIG_PATH,
      workspace: workspaceDir,
      hostname: config.server.hostname,
      pythonPath: config.python.path,
      pythonAvailable: isPythonToolAvailable(),
      logLevel: config.logging.level,
      configured: validation.valid,
      skills: skills.map((skill) => skill.name),
      experiences: experiences.length,
    });

    console.log('\nAsyn Agents Server');
    console.log(`   URL:        http://${hostForDisplay}:${config.server.port}`);
    console.log(`   Hostname:   ${listenHost || '(all interfaces)'}`);
    console.log(`   Provider:   ${providerLabel}`);
    console.log(`   Model:      ${model}`);
    console.log(`   Config:     ${CONFIG_PATH}`);
    console.log(`   Workspace:  ${workspaceDir}`);
    console.log(`   Python:     ${config.python.path}`);
    console.log(`   Python OK:  ${isPythonToolAvailable() ? 'yes' : 'no'}`);
    console.log(`   Experiences:${String(experiences.length).padStart(4, ' ')}`);
    if (!pythonProbe.available && pythonProbe.error) {
      console.log(`               ${pythonProbe.error.split('\n')[0]}`);
    }
    if (validation.valid) {
      console.log('   API Key:    configured');
    } else {
      console.log('   API Key:    missing');
      validation.errors.forEach((error) => console.log(`               ${error}`));
    }
    if (skills.length > 0) {
      console.log(`   Skills:     ${skills.map((skill) => skill.name).join(', ')}`);
    }
    console.log();
  };

  const server = listenHost
    ? app.listen(config.server.port, listenHost, onListening)
    : app.listen(config.server.port, onListening);

  server.on('error', (error: NodeJS.ErrnoException) => {
    experienceScheduler.stop();

    if (error.code === 'EADDRINUSE') {
      const message = `Port ${config.server.port}${listenHost ? ` on ${listenHost}` : ''} is already in use. Stop the existing server or change "server.port" or "server.hostname" in ${CONFIG_PATH}.`;
      console.error(message);
      log.error('Server failed to start', {
        error: message,
        port: config.server.port,
        hostname: config.server.hostname,
      });
      process.exit(1);
      return;
    }

    console.error(error.message);
    log.error('Server failed to start', {
      error: error.message,
      code: error.code,
    });
    process.exit(1);
  });
}

process.on('SIGTERM', () => {
  experienceScheduler.stop();
  log.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  experienceScheduler.stop();
  log.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

bootstrap().catch((error) => {
  log.error('Failed to bootstrap server', {
    error: (error as Error).message,
    stack: (error as Error).stack,
  });
  process.exit(1);
});
