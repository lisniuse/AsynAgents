import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../../config.js';
import {
  buildPythonCommand,
  getAnthropicTools,
  setPythonToolAvailable,
} from '../src/agent/tools.js';
import { buildSystemPrompt } from '../src/agent/providers/base.js';

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
});
