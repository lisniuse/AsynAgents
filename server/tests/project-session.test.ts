import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyProjectBaseline,
  createProjectCheckpoint,
  initializeProjectSession,
  listProjectCheckpoints,
  listProjectTree,
  readProjectFile,
  restoreProjectCheckpoint,
} from '../src/storage/ProjectSessionStorage.js';

const createdPaths: string[] = [];

async function createTempProject(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'asyn-agents-project-'));
  createdPaths.push(projectRoot);
  await mkdir(join(projectRoot, 'src'), { recursive: true });
  await writeFile(join(projectRoot, 'README.md'), '# Demo\n', 'utf8');
  await writeFile(join(projectRoot, 'src', 'index.ts'), 'export const answer = 42;\n', 'utf8');
  return projectRoot;
}

function sessionDir(conversationId: string): string {
  return join(homedir(), '.asynagents', 'project-mode', conversationId);
}

afterEach(async () => {
  await Promise.all(
    createdPaths.splice(0, createdPaths.length).map((targetPath) =>
      rm(targetPath, { recursive: true, force: true })
    )
  );
});

describe('ProjectSessionStorage', () => {
  it('creates a project session snapshot and exposes a tree', async () => {
    const projectRoot = await createTempProject();
    const conversationId = `project-tree-${Date.now()}`;
    createdPaths.push(sessionDir(conversationId));

    const session = await initializeProjectSession(conversationId, projectRoot);
    const tree = await listProjectTree(conversationId);

    expect(session.projectPath).toBe(projectRoot);
    expect(tree.map((node) => node.name)).toContain('README.md');
    expect(tree.find((node) => node.name === 'src')?.children?.[0]?.path).toBe('src/index.ts');
  });

  it('returns both baseline and working file contents', async () => {
    const projectRoot = await createTempProject();
    const conversationId = `project-file-${Date.now()}`;
    createdPaths.push(sessionDir(conversationId));

    await initializeProjectSession(conversationId, projectRoot);
    await writeFile(join(projectRoot, 'src', 'index.ts'), 'export const answer = 84;\n', 'utf8');

    const snapshot = await readProjectFile(conversationId, 'src/index.ts');

    expect(snapshot.language).toBe('typescript');
    expect(snapshot.workingContent).toContain('84');
    expect(snapshot.baselineContent).toContain('42');
    expect(snapshot.isText).toBe(true);
  });

  it('creates checkpoints, restores them, and can apply the current workspace as baseline', async () => {
    const projectRoot = await createTempProject();
    const conversationId = `project-restore-${Date.now()}`;
    createdPaths.push(sessionDir(conversationId));

    await initializeProjectSession(conversationId, projectRoot);
    const checkpoint = await createProjectCheckpoint(conversationId, 'thread-1');
    await writeFile(join(projectRoot, 'src', 'index.ts'), 'export const answer = 128;\n', 'utf8');

    const checkpoints = await listProjectCheckpoints(conversationId);
    expect(checkpoints[0]?.id).toBe(checkpoint.id);

    await restoreProjectCheckpoint(conversationId, checkpoint.id);
    const restored = await readProjectFile(conversationId, 'src/index.ts');
    expect(restored.workingContent).toContain('42');

    await writeFile(join(projectRoot, 'src', 'index.ts'), 'export const answer = 256;\n', 'utf8');
    await applyProjectBaseline(conversationId);
    const applied = await readProjectFile(conversationId, 'src/index.ts');
    expect(applied.baselineContent).toContain('256');
  });
});
