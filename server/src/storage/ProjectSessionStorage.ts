import { existsSync } from 'fs';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'path';
import { workspaceDir } from '../../../config.js';
import type { ProjectSessionSummary } from '../types/index.js';

const PROJECT_MODE_DIR = join(homedir(), '.asynagents', 'project-mode');
const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  '.cache',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
]);
const MAX_DISCOVERY_DEPTH = 2;
const MAX_TEXT_FILE_BYTES = 1024 * 1024;

export interface ProjectTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: ProjectTreeNode[];
}

export interface ProjectFileSnapshot {
  relativePath: string;
  language: string;
  isText: boolean;
  workingExists: boolean;
  baselineExists: boolean;
  workingContent: string | null;
  baselineContent: string | null;
}

export interface ProjectCheckpointSummary {
  id: string;
  createdAt: number;
  threadId?: string;
}

function sessionDir(conversationId: string): string {
  return join(PROJECT_MODE_DIR, conversationId);
}

function metaFilePath(conversationId: string): string {
  return join(sessionDir(conversationId), 'session.json');
}

function baselineRootDir(conversationId: string): string {
  return join(sessionDir(conversationId), 'baseline');
}

function checkpointsRootDir(conversationId: string): string {
  return join(sessionDir(conversationId), 'checkpoints');
}

function checkpointDir(conversationId: string, checkpointId: string): string {
  return join(checkpointsRootDir(conversationId), checkpointId);
}

function checkpointMetaPath(conversationId: string, checkpointId: string): string {
  return join(checkpointDir(conversationId, checkpointId), 'meta.json');
}

function checkpointSnapshotDir(conversationId: string, checkpointId: string): string {
  return join(checkpointDir(conversationId, checkpointId), 'snapshot');
}

async function ensureProjectModeDir(): Promise<void> {
  await mkdir(PROJECT_MODE_DIR, { recursive: true });
}

export function normalizeProjectPath(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    throw new Error('Project path is required.');
  }

  return isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(workspaceDir, trimmed);
}

function normalizeRelativePath(inputPath: string): string {
  const normalized = inputPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized === '.') {
    return '';
  }
  if (normalized.split('/').includes('..')) {
    throw new Error('Invalid project-relative path.');
  }
  return normalized;
}

function ensureInsideRoot(rootDir: string, targetPath: string): string {
  const resolvedRoot = resolve(rootDir);
  const resolvedTarget = resolve(targetPath);
  const rootWithSep = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(rootWithSep)) {
    throw new Error('Path escapes project root.');
  }
  return resolvedTarget;
}

function resolveFromRoot(rootDir: string, relativePath: string): string {
  const safeRelativePath = normalizeRelativePath(relativePath);
  return ensureInsideRoot(rootDir, join(rootDir, safeRelativePath));
}

async function copyDirectoryFiltered(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      await copyDirectoryFiltered(join(sourceDir, entry.name), join(targetDir, entry.name));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    await cp(join(sourceDir, entry.name), join(targetDir, entry.name));
  }
}

async function listTrackedFiles(rootDir: string): Promise<string[]> {
  if (!existsSync(rootDir)) {
    return [];
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const nested = await listTrackedFiles(join(rootDir, entry.name));
      files.push(...nested.map((child) => join(entry.name, child)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entry.name);
    }
  }

  return files;
}

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const languageByExt: Record<string, string> = {
    '.c': 'c',
    '.cc': 'cpp',
    '.cpp': 'cpp',
    '.css': 'css',
    '.go': 'go',
    '.h': 'c',
    '.hpp': 'cpp',
    '.html': 'html',
    '.java': 'java',
    '.js': 'javascript',
    '.json': 'json',
    '.jsx': 'javascript',
    '.less': 'less',
    '.lua': 'lua',
    '.md': 'markdown',
    '.php': 'php',
    '.py': 'python',
    '.rb': 'ruby',
    '.rs': 'rust',
    '.scss': 'scss',
    '.sh': 'bash',
    '.sql': 'sql',
    '.svg': 'xml',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.txt': 'plaintext',
    '.vue': 'xml',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
  };
  return languageByExt[ext] ?? 'plaintext';
}

async function readTextFileIfPossible(filePath: string): Promise<{ isText: boolean; content: string | null }> {
  if (!existsSync(filePath)) {
    return { isText: true, content: null };
  }

  const fileStat = await stat(filePath);
  if (fileStat.size > MAX_TEXT_FILE_BYTES) {
    return { isText: false, content: null };
  }

  const content = await readFile(filePath, 'utf8');
  if (content.includes('\u0000')) {
    return { isText: false, content: null };
  }

  return { isText: true, content };
}

async function getProjectRoots(conversationId: string): Promise<{
  session: ProjectSessionSummary;
  workingRoot: string;
  baselineRoot: string;
}> {
  const session = await getProjectSession(conversationId);
  if (!session) {
    throw new Error('Project mode is not enabled for this conversation.');
  }

  return {
    session,
    workingRoot: session.projectPath,
    baselineRoot: baselineRootDir(conversationId),
  };
}

async function syncTrackedTree(sourceDir: string, targetDir: string): Promise<void> {
  const [sourceFiles, targetFiles] = await Promise.all([
    listTrackedFiles(sourceDir),
    listTrackedFiles(targetDir),
  ]);

  const sourceSet = new Set(sourceFiles.map((filePath) => filePath.replace(/\\/g, '/')));
  await Promise.all(
    targetFiles.map(async (filePath) => {
      const normalized = filePath.replace(/\\/g, '/');
      if (!sourceSet.has(normalized)) {
        await rm(resolveFromRoot(targetDir, normalized), { force: true });
      }
    })
  );

  await copyDirectoryFiltered(sourceDir, targetDir);
}

async function buildProjectTree(currentDir: string, rootDir: string): Promise<ProjectTreeNode[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const nodes: ProjectTreeNode[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    if (!entry.isDirectory() && !entry.isFile()) {
      continue;
    }

    const fullPath = join(currentDir, entry.name);
    const relativePath = relative(rootDir, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'directory',
        children: await buildProjectTree(fullPath, rootDir),
      });
      continue;
    }

    nodes.push({
      name: entry.name,
      path: relativePath,
      type: 'file',
    });
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export async function initializeProjectSession(
  conversationId: string,
  projectPath: string
): Promise<ProjectSessionSummary> {
  await ensureProjectModeDir();
  const normalizedPath = normalizeProjectPath(projectPath);
  const summary: ProjectSessionSummary = {
    mode: 'project',
    projectPath: normalizedPath,
    projectName: basename(normalizedPath),
    selectedAt: Date.now(),
  };

  const rootDir = sessionDir(conversationId);
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(rootDir, { recursive: true });
  await copyDirectoryFiltered(normalizedPath, baselineRootDir(conversationId));
  await writeFile(metaFilePath(conversationId), JSON.stringify(summary, null, 2), 'utf8');
  return summary;
}

export async function getProjectSession(
  conversationId: string
): Promise<ProjectSessionSummary | null> {
  const path = metaFilePath(conversationId);
  if (!existsSync(path)) {
    return null;
  }

  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as ProjectSessionSummary;
}

export async function listProjectTree(conversationId: string): Promise<ProjectTreeNode[]> {
  const { workingRoot } = await getProjectRoots(conversationId);
  return buildProjectTree(workingRoot, workingRoot);
}

export async function readProjectFile(
  conversationId: string,
  relativePath: string
): Promise<ProjectFileSnapshot> {
  const { workingRoot, baselineRoot } = await getProjectRoots(conversationId);
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) {
    throw new Error('File path is required.');
  }

  const workingPath = resolveFromRoot(workingRoot, normalizedRelativePath);
  const baselinePath = resolveFromRoot(baselineRoot, normalizedRelativePath);
  const [working, baseline] = await Promise.all([
    readTextFileIfPossible(workingPath),
    readTextFileIfPossible(baselinePath),
  ]);

  return {
    relativePath: normalizedRelativePath,
    language: detectLanguage(normalizedRelativePath),
    isText: working.isText && baseline.isText,
    workingExists: existsSync(workingPath),
    baselineExists: existsSync(baselinePath),
    workingContent: working.content,
    baselineContent: baseline.content,
  };
}

export async function createProjectCheckpoint(
  conversationId: string,
  threadId?: string
): Promise<ProjectCheckpointSummary> {
  const { workingRoot } = await getProjectRoots(conversationId);
  const checkpointId = `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const summary: ProjectCheckpointSummary = {
    id: checkpointId,
    createdAt: Date.now(),
    ...(threadId ? { threadId } : {}),
  };

  await mkdir(checkpointDir(conversationId, checkpointId), { recursive: true });
  await copyDirectoryFiltered(workingRoot, checkpointSnapshotDir(conversationId, checkpointId));
  await writeFile(
    checkpointMetaPath(conversationId, checkpointId),
    JSON.stringify(summary, null, 2),
    'utf8'
  );
  return summary;
}

export async function listProjectCheckpoints(
  conversationId: string
): Promise<ProjectCheckpointSummary[]> {
  const rootDir = checkpointsRootDir(conversationId);
  if (!existsSync(rootDir)) {
    return [];
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  const checkpoints = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const raw = await readFile(checkpointMetaPath(conversationId, entry.name), 'utf8');
        return JSON.parse(raw) as ProjectCheckpointSummary;
      })
  );

  return checkpoints.sort((a, b) => b.createdAt - a.createdAt);
}

export async function restoreProjectCheckpoint(
  conversationId: string,
  checkpointId: string
): Promise<ProjectCheckpointSummary> {
  const { workingRoot } = await getProjectRoots(conversationId);
  const metaPath = checkpointMetaPath(conversationId, checkpointId);
  if (!existsSync(metaPath)) {
    throw new Error('Checkpoint not found.');
  }

  const raw = await readFile(metaPath, 'utf8');
  const summary = JSON.parse(raw) as ProjectCheckpointSummary;
  await syncTrackedTree(checkpointSnapshotDir(conversationId, checkpointId), workingRoot);
  return summary;
}

export async function applyProjectBaseline(conversationId: string): Promise<void> {
  const { workingRoot, baselineRoot } = await getProjectRoots(conversationId);
  await rm(baselineRoot, { recursive: true, force: true });
  await copyDirectoryFiltered(workingRoot, baselineRoot);
}

async function discoverProjects(
  currentDir: string,
  depth: number,
  results: string[]
): Promise<void> {
  if (depth > MAX_DISCOVERY_DEPTH) {
    return;
  }

  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = join(currentDir, entry.name);
    results.push(fullPath);
    await discoverProjects(fullPath, depth + 1, results);
  }
}

export async function listProjectCandidates(): Promise<Array<{ name: string; path: string }>> {
  await ensureProjectModeDir();
  const paths: string[] = [];
  await discoverProjects(workspaceDir, 0, paths);
  const seen = new Set<string>();

  return paths
    .filter((projectPath) => {
      if (seen.has(projectPath)) {
        return false;
      }
      seen.add(projectPath);
      return true;
    })
    .map((projectPath) => ({
      name: basename(projectPath),
      path: projectPath,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
