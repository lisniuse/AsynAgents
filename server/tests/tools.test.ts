import { rm } from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../../config.js';
import {
  buildPythonCommand,
  executeTool,
  getAnthropicTools,
  setPythonToolAvailable,
} from '../src/agent/tools.js';
import { buildSystemPrompt } from '../src/agent/providers/base.js';
import { getExperienceDir, saveExperience } from '../src/experience/ExperienceStorage.js';

const originalPythonPath = config.python.path;

afterEach(() => {
  config.python.path = originalPythonPath;
  setPythonToolAvailable(true);
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

    expect(content).toContain('title: Unit test experience');
    expect(content).toContain('This is a saved note.');

    await rm(`${getExperienceDir()}\\unit_test_experience.md`, { force: true });
  });
});
