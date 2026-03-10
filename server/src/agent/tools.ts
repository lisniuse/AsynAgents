import { exec } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import { config, workspaceDir } from '../../../config.js';
import { getSkillContent } from '../skills/SkillLoader.js';
import { getExperienceContent } from '../experience/ExperienceStorage.js';

const execAsync = promisify(exec);
const MAX_OUTPUT = 12000;
let pythonToolAvailable = true;

if (!existsSync(workspaceDir)) {
  mkdirSync(workspaceDir, { recursive: true });
}

function resolveWorkspacePath(inputPath: string): string {
  if (path.isAbsolute(inputPath)) return inputPath;
  return path.resolve(workspaceDir, inputPath);
}

function decodeCommandOutput(buf: Buffer | string): string {
  if (typeof buf === 'string') return buf;
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf8.includes('\uFFFD')) return utf8;
  if (process.platform === 'win32') {
    return new TextDecoder('gbk').decode(buf);
  }
  return utf8;
}

function truncateOutput(output: string): string {
  return output.length > MAX_OUTPUT
    ? output.slice(0, MAX_OUTPUT) + '\n... [output truncated]'
    : output;
}

function quoteShellArg(value: string): string {
  if (process.platform === 'win32') {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildPythonCommand(code: string): string {
  const pythonPath = (config.python?.path || 'python').trim() || 'python';
  return `${quoteShellArg(pythonPath)} -c ${quoteShellArg(code)}`;
}

export function setPythonToolAvailable(available: boolean): void {
  pythonToolAvailable = available;
}

export function isPythonToolAvailable(): boolean {
  return pythonToolAvailable;
}

export async function probePythonTool(): Promise<{ available: boolean; error?: string }> {
  try {
    const output = await executeBash(buildPythonCommand('import sys; print(sys.version)'), 10000);
    const available = !output.startsWith('Error') && !output.startsWith('Command failed');
    setPythonToolAvailable(available);
    return available
      ? { available: true }
      : { available: false, error: output };
  } catch (err: unknown) {
    const error = (err as Error).message || 'Unknown error';
    setPythonToolAvailable(false);
    return { available: false, error };
  }
}

const allAnthropicTools: Anthropic.Tool[] = [
  {
    name: 'bash',
    description:
      'Execute a shell command. Use for running programs, installing packages, checking system info, compiling code, running tests, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'python',
    description:
      'Execute Python code with the configured Python interpreter path. Use for scripts, calculations, parsing, and data processing.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python code to execute' },
        timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' },
      },
      required: ['code'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write content to a file. Creates parent directories if needed. Overwrites existing files.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (absolute or relative)' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Read content from a file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and subdirectories in a directory.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path (default: cwd)' },
      },
      required: [],
    },
  },
  {
    name: 'get_experience',
    description:
      'Get the full content of an experience note by filename or keyword slug. Use this when the system prompt lists a relevant experience.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Experience file name or slug (for example "retry_provider_timeout")' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_skill',
    description:
      'Get detailed usage instructions for a skill. Call this before using any skill to learn the exact commands and options.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name (e.g. "anytime-search")' },
      },
      required: ['name'],
    },
  },
];

export function getAnthropicTools(): Anthropic.Tool[] {
  return allAnthropicTools.filter((tool) => tool.name !== 'python' || pythonToolAvailable);
}

export function getOpenAITools(): OpenAI.Chat.ChatCompletionTool[] {
  return getAnthropicTools().map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.input_schema as OpenAI.FunctionParameters,
    },
  }));
}

async function executeBash(command: string, timeout: number): Promise<string> {
  try {
    const result = await execAsync(command, {
      timeout,
      maxBuffer: 1024 * 1024 * 5,
      cwd: workspaceDir,
      encoding: 'buffer',
    });
    const stdout = decodeCommandOutput((result as unknown as { stdout: Buffer }).stdout);
    const stderr = decodeCommandOutput((result as unknown as { stderr: Buffer }).stderr);
    let output = '';
    if (stdout) output += stdout;
    if (stderr) output += (output ? '\n[stderr]\n' : '[stderr]\n') + stderr;
    if (!output) output = '(command completed with no output)';
    return truncateOutput(output);
  } catch (err: unknown) {
    const error = err as { message: string; stderr?: Buffer | string; stdout?: Buffer | string };
    const firstLine = error.message.split('\n')[0];
    let output = firstLine.startsWith('Command failed')
      ? firstLine
      : `Command failed: ${firstLine}`;
    if (error.stderr) output += `\n[stderr]\n${decodeCommandOutput(error.stderr)}`;
    if (error.stdout) output += `\n[stdout]\n${decodeCommandOutput(error.stdout)}`;
    return truncateOutput(output);
  }
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case 'bash':
      return executeBash(
        input['command'] as string,
        (input['timeout'] as number) || 30000
      );

    case 'python':
      return executeBash(
        buildPythonCommand(input['code'] as string),
        (input['timeout'] as number) || 30000
      );

    case 'write_file': {
      const filePath = resolveWorkspacePath(input['path'] as string);
      const content = input['content'] as string;
      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf8');
        return `Successfully wrote ${content.length} bytes to: ${filePath}`;
      } catch (err: unknown) {
        return `Error writing file: ${(err as Error).message}`;
      }
    }

    case 'read_file': {
      const filePath = resolveWorkspacePath(input['path'] as string);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        return content.length > MAX_OUTPUT
          ? content.slice(0, MAX_OUTPUT) + '\n... [content truncated]'
          : content;
      } catch (err: unknown) {
        return `Error reading file: ${(err as Error).message}`;
      }
    }

    case 'list_directory': {
      const dirPath = resolveWorkspacePath((input['path'] as string) || workspaceDir);
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        if (entries.length === 0) return '(empty directory)';
        const lines = entries.map((entry) => `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`);
        return `Contents of ${dirPath}:\n${lines.join('\n')}`;
      } catch (err: unknown) {
        return `Error listing directory: ${(err as Error).message}`;
      }
    }

    case 'get_skill': {
      const skillName = input['name'] as string;
      const content = getSkillContent(skillName);
      if (content === null) {
        return `Skill "${skillName}" not found. Use the available skills list in the system prompt.`;
      }
      return content;
    }

    case 'get_experience': {
      const experienceName = input['name'] as string;
      const content = await getExperienceContent(experienceName);
      if (content === null) {
        return `Experience "${experienceName}" not found. Use the available experiences list in the system prompt.`;
      }
      return content;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
