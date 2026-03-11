import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config, workspaceDir } from '../../config.js';
import {
  buildPythonCommand,
  executeTool,
  getAnthropicTools,
  probePythonTool,
  setPythonToolAvailable,
} from '../src/agent/tools.js';
import { buildSystemPrompt } from '../src/agent/providers/base.js';
import { getExperienceDir, saveExperience } from '../src/experience/ExperienceStorage.js';
import { resolveStaticImagesDir } from '../src/utils/runtimePaths.js';

const originalPythonPath = config.python.path;

afterEach(() => {
  config.python.path = originalPythonPath;
  setPythonToolAvailable(true);
  vi.unstubAllGlobals();
});

describe('buildPythonCommand', () => {
  it('uses the configured python path', () => {
    config.python.path = 'C:\\Python311\\python.exe';

    const command = buildPythonCommand('print("hello")');

    expect(command).toContain('"C:\\Python311\\python.exe"');
    expect(command).toContain('-c');
    expect(command).toContain('print(""hello"")');
  });

  it('falls back to python when the configured path is empty', () => {
    config.python.path = '';

    const command = buildPythonCommand('print(1)');

    expect(command.startsWith('"python" -c ')).toBe(true);
  });

  it('omits python from the tool list and system prompt when disabled', () => {
    setPythonToolAvailable(false);

    const tools = getAnthropicTools();
    const prompt = buildSystemPrompt();

    expect(tools.some((tool) => tool.name === 'python')).toBe(false);
    expect(prompt.includes('- python: Execute Python code with the configured Python interpreter')).toBe(false);
  });

  it('registers the get_experience tool', () => {
    const tools = getAnthropicTools();

    expect(tools.some((tool) => tool.name === 'get_experience')).toBe(true);
  });

  it('registers the send_image tool', () => {
    const tools = getAnthropicTools();
    const prompt = buildSystemPrompt();

    expect(tools.some((tool) => tool.name === 'send_image')).toBe(true);
    expect(prompt.includes('- send_image: Save an image into the static images directory and attach it to the assistant reply')).toBe(true);
  });

  it('reads experience notes through the get_experience tool', async () => {
    await saveExperience({
      fileName: 'unit_test_experience.md',
      title: 'Unit test experience',
      summary: 'Used to verify experience loading.',
      keywords: ['unit_test'],
      sourceConversations: ['conversation-1'],
      updatedAt: '2026-03-10T00:00:00.000Z',
      body: '## Experience\n\nThis is a saved note.',
    });

    const content = await executeTool('get_experience', { name: 'unit_test_experience' });

    expect(content.output).toContain('title: Unit test experience');
    expect(content.output).toContain('This is a saved note.');

    await rm(`${getExperienceDir()}\\unit_test_experience.md`, { force: true });
  });

  it('executes multiline python code and preserves stdout', async () => {
    const probe = await probePythonTool();
    if (!probe.available) {
      return;
    }

    const result = await executeTool('python', {
      code: 'filename = "demo.png"\nprint(filename)\nprint("截图完成")',
    });

    expect(result.output).toContain('demo.png');
    expect(result.output).toContain('截图完成');
  });

  it('saves a local image through send_image', async () => {
    const fixtureDir = join(workspaceDir, 'tmp-image-fixture');
    const sourcePath = join(fixtureDir, 'sample.png');
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(sourcePath, Buffer.from('89504e470d0a1a0a', 'hex'));

    const result = await executeTool('send_image', { source: sourcePath });

    expect(result.images?.[0]).toMatch(/^\/images\/.+\.png$/);
    const savedPath = join(resolveStaticImagesDir(), result.images![0].replace('/images/', ''));
    const savedBuffer = await readFile(savedPath);
    expect(savedBuffer.length).toBeGreaterThan(0);

    await rm(savedPath, { force: true });
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it('saves a base64 data URL through send_image', async () => {
    const result = await executeTool('send_image', {
      source: 'data:image/png;base64,iVBORw0KGgo=',
      fileName: 'inline-image.png',
    });

    expect(result.images?.[0]).toMatch(/^\/images\/inline-image.*\.png$/);
    const savedPath = join(resolveStaticImagesDir(), result.images![0].replace('/images/', ''));
    const savedBuffer = await readFile(savedPath);
    expect(savedBuffer.length).toBeGreaterThan(0);

    await rm(savedPath, { force: true });
  });

  it('downloads a network image through send_image', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeTool('send_image', {
      source: 'https://example.com/image.png',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.images?.[0]).toMatch(/^\/images\/image.*\.png$/);
    const savedPath = join(resolveStaticImagesDir(), result.images![0].replace('/images/', ''));
    const savedBuffer = await readFile(savedPath);
    expect(savedBuffer.length).toBeGreaterThan(0);

    await rm(savedPath, { force: true });
  });
});
