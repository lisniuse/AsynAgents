import { randomUUID } from 'crypto';
import { exec, spawn, type ChildProcess } from 'child_process';
import { existsSync, createWriteStream } from 'fs';
import * as fs from 'fs/promises';
import { homedir } from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { createChildLogger } from '../utils/logger.js';

const execAsync = promisify(exec);
const logger = createChildLogger('ManagedProcess');

const ROOT_DIR = path.join(homedir(), '.asynagents', 'managed-processes');
const ITEMS_DIR = path.join(ROOT_DIR, 'items');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');
const OUTPUT_TAIL_LIMIT = 4000;
const ANSI_ESCAPE_PATTERN = /\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

const activeChildren = new Map<string, ChildProcess>();

export type ManagedProcessStatus = 'running' | 'stopped' | 'exited' | 'failed';

export interface ManagedProcessRecord {
  id: string;
  conversationId: string;
  name: string;
  command: string;
  cwd: string;
  pid: number;
  status: ManagedProcessStatus;
  startedAt: number;
  endedAt?: number;
  exitCode?: number | null;
  signal?: string | null;
  ports: number[];
  urls: string[];
  recentOutput: string;
  logFile: string;
}

interface StartManagedProcessOptions {
  conversationId: string;
  command: string;
  cwd: string;
  name?: string;
}

function itemFile(id: string): string {
  return path.join(ITEMS_DIR, `${id}.json`);
}

function logFile(id: string): string {
  return path.join(LOGS_DIR, `${id}.log`);
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(ITEMS_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });
}

function toDisplayName(command: string, preferred?: string): string {
  const trimmed = preferred?.trim();
  if (trimmed) {
    return trimmed.slice(0, 64);
  }

  const compact = command.trim().replace(/\s+/g, ' ');
  if (!compact) {
    return 'Background process';
  }

  return compact.length > 64 ? `${compact.slice(0, 61)}...` : compact;
}

function appendOutput(existing: string, chunk: string): string {
  if (!chunk) {
    return existing;
  }

  const merged = `${existing}${chunk}`;
  return merged.length > OUTPUT_TAIL_LIMIT
    ? merged.slice(merged.length - OUTPUT_TAIL_LIMIT)
    : merged;
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}

function mergeDetectedRuntime(record: ManagedProcessRecord, chunk: string): ManagedProcessRecord {
  const cleanChunk = stripAnsi(chunk);
  const urls = new Set(record.urls);
  const ports = new Set(record.ports);

  const urlMatches = cleanChunk.match(/https?:\/\/[^\s"'`]+/g) ?? [];
  for (const match of urlMatches) {
    urls.add(match);
    try {
      const parsed = new URL(match);
      if (parsed.port) {
        const port = Number(parsed.port);
        if (Number.isFinite(port)) {
          ports.add(port);
        }
      }
    } catch {
      // ignore invalid URL fragments from logs
    }
  }

  const portMatches = cleanChunk.matchAll(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/g);
  for (const match of portMatches) {
    const port = Number(match[1]);
    if (Number.isFinite(port)) {
      ports.add(port);
    }
  }

  return {
    ...record,
    urls: Array.from(urls),
    ports: Array.from(ports).sort((a, b) => a - b),
    recentOutput: appendOutput(record.recentOutput, cleanChunk),
  };
}

async function writeRecord(record: ManagedProcessRecord): Promise<void> {
  await ensureDirs();
  await fs.writeFile(itemFile(record.id), JSON.stringify(record, null, 2), 'utf8');
}

async function readRecord(id: string): Promise<ManagedProcessRecord | null> {
  await ensureDirs();
  const file = itemFile(id);
  if (!existsSync(file)) {
    return null;
  }

  const content = await fs.readFile(file, 'utf8');
  return JSON.parse(content) as ManagedProcessRecord;
}

async function readAllRecords(): Promise<ManagedProcessRecord[]> {
  await ensureDirs();
  const files = await fs.readdir(ITEMS_DIR);
  const records: ManagedProcessRecord[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) {
      continue;
    }

    try {
      const content = await fs.readFile(path.join(ITEMS_DIR, file), 'utf8');
      records.push(JSON.parse(content) as ManagedProcessRecord);
    } catch {
      // Skip broken process records.
    }
  }

  return records;
}

async function readRecentOutput(logPath: string): Promise<string> {
  try {
    const content = stripAnsi(await fs.readFile(logPath, 'utf8'));
    return content.length > OUTPUT_TAIL_LIMIT
      ? content.slice(content.length - OUTPUT_TAIL_LIMIT)
      : content;
  } catch {
    return '';
  }
}

async function findListeningPorts(pid: number): Promise<number[]> {
  try {
    if (process.platform === 'win32') {
      const command = `powershell -NoLogo -NoProfile -Command "$ports = Get-NetTCPConnection -State Listen -OwningProcess ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort; if ($ports) { $ports | Sort-Object -Unique }"`;
      const { stdout } = await execAsync(command, { windowsHide: true });
      return stdout
        .split(/\r?\n/)
        .map((line) => Number(line.trim()))
        .filter((port) => Number.isFinite(port));
    }

    const { stdout } = await execAsync(`lsof -Pan -p ${pid} -iTCP -sTCP:LISTEN`, { windowsHide: true });
    return Array.from(stdout.matchAll(/:(\d+)\s+\(LISTEN\)/g))
      .map((match) => Number(match[1]))
      .filter((port) => Number.isFinite(port));
  } catch {
    return [];
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function refreshRecord(record: ManagedProcessRecord): Promise<ManagedProcessRecord> {
  let next = { ...record };

  if (!next.recentOutput && next.logFile) {
    next.recentOutput = await readRecentOutput(next.logFile);
  }

  if (next.status === 'running') {
    if (!isPidAlive(next.pid)) {
      next = {
        ...next,
        status: next.exitCode && next.exitCode !== 0 ? 'failed' : 'exited',
        endedAt: next.endedAt ?? Date.now(),
      };
      await writeRecord(next);
      return next;
    }

    const ports = await findListeningPorts(next.pid);
    const mergedPorts = Array.from(new Set([...next.ports, ...ports])).sort((a, b) => a - b);
    if (mergedPorts.join(',') !== next.ports.join(',')) {
      next = { ...next, ports: mergedPorts };
      await writeRecord(next);
    }
  }

  return next;
}

async function updateRecord(id: string, updater: (record: ManagedProcessRecord) => ManagedProcessRecord): Promise<ManagedProcessRecord | null> {
  const current = await readRecord(id);
  if (!current) {
    return null;
  }

  const next = updater(current);
  await writeRecord(next);
  return next;
}

async function killProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await execAsync(`taskkill /PID ${pid} /T /F`, { windowsHide: true });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    process.kill(pid, 'SIGTERM');
  }
}

export async function startManagedProcess({
  conversationId,
  command,
  cwd,
  name,
}: StartManagedProcessOptions): Promise<ManagedProcessRecord> {
  await ensureDirs();

  const id = randomUUID();
  const logPath = logFile(id);
  const logStream = createWriteStream(logPath, { flags: 'a' });
  const child = spawn(command, {
    cwd,
    env: process.env,
    shell: true,
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (!child.pid) {
    logStream.end();
    throw new Error('Failed to start background process.');
  }

  let record: ManagedProcessRecord = {
    id,
    conversationId,
    name: toDisplayName(command, name),
    command,
    cwd,
    pid: child.pid,
    status: 'running',
    startedAt: Date.now(),
    ports: [],
    urls: [],
    recentOutput: '',
    logFile: logPath,
  };

  const handleChunk = (source: 'stdout' | 'stderr', data: Buffer | string) => {
    const chunk = Buffer.isBuffer(data) ? data.toString('utf8') : data;
    logStream.write(chunk);
    record = mergeDetectedRuntime(record, source === 'stderr' ? `[stderr] ${chunk}` : chunk);
    void writeRecord(record);
  };

  child.stdout?.on('data', (data) => handleChunk('stdout', data));
  child.stderr?.on('data', (data) => handleChunk('stderr', data));

  child.on('error', (error) => {
    record = {
      ...record,
      status: 'failed',
      endedAt: Date.now(),
      recentOutput: appendOutput(record.recentOutput, `${error.message}\n`),
    };
    activeChildren.delete(id);
    logStream.end();
    void writeRecord(record);
    logger.error('Managed process failed to start', {
      processId: id,
      command,
      error: error.message,
    });
  });

  child.on('exit', (code, signal) => {
    activeChildren.delete(id);
    logStream.end();
    void updateRecord(id, (current) => ({
      ...current,
      status: current.status === 'stopped'
        ? 'stopped'
        : code && code !== 0
          ? 'failed'
          : 'exited',
      exitCode: code,
      signal,
      endedAt: current.endedAt ?? Date.now(),
      recentOutput: record.recentOutput,
      ports: record.ports,
      urls: record.urls,
    }));
  });

  activeChildren.set(id, child);
  await writeRecord(record);
  logger.info('Managed process started', {
    processId: id,
    conversationId,
    pid: child.pid,
    command,
    cwd,
  });

  return record;
}

export async function listConversationProcesses(conversationId: string): Promise<ManagedProcessRecord[]> {
  const records = await readAllRecords();
  const filtered = records.filter((record) => record.conversationId === conversationId);
  const refreshed = await Promise.all(filtered.map((record) => refreshRecord(record)));
  return refreshed.sort((a, b) => b.startedAt - a.startedAt);
}

export async function stopConversationProcess(
  conversationId: string,
  processId: string
): Promise<ManagedProcessRecord> {
  const record = await readRecord(processId);
  if (!record || record.conversationId !== conversationId) {
    throw new Error('Process not found.');
  }

  if (record.status !== 'running') {
    return record;
  }

  try {
    await killProcessTree(record.pid);
  } catch (error) {
    if (isPidAlive(record.pid)) {
      throw error;
    }
  }

  const stopped = await updateRecord(processId, (current) => ({
    ...current,
    status: 'stopped',
    endedAt: current.endedAt ?? Date.now(),
  }));

  if (!stopped) {
    throw new Error('Process not found.');
  }

  activeChildren.delete(processId);
  return stopped;
}

export async function deleteConversationProcess(
  conversationId: string,
  processId: string
): Promise<void> {
  const record = await readRecord(processId);
  if (!record || record.conversationId !== conversationId) {
    throw new Error('Process not found.');
  }

  if (record.status === 'running') {
    throw new Error('Stop the process before deleting it.');
  }

  await fs.rm(itemFile(processId), { force: true });
  if (record.logFile) {
    await fs.rm(record.logFile, { force: true });
  }
}
