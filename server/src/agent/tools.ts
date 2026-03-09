import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdirSync, existsSync } from 'fs';
import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import { workspaceDir } from '../../../config.js';
import { getSkillContent } from '../skills/SkillLoader.js';

const execAsync = promisify(exec);
const MAX_OUTPUT = 12000;

// 确保 workspace 目录存在
if (!existsSync(workspaceDir)) {
  mkdirSync(workspaceDir, { recursive: true });
}

function resolveWorkspacePath(inputPath: string): string {
  if (path.isAbsolute(inputPath)) return inputPath;
  return path.resolve(workspaceDir, inputPath);
}

// ── Tool definitions ─────────────────────────────────────────────────────

/** Shared tool schemas in Anthropic format (source of truth) */
export const anthropicTools: Anthropic.Tool[] = [
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

/** Convert Anthropic tool format → OpenAI tool format */
export const openAITools: OpenAI.Chat.ChatCompletionTool[] = anthropicTools.map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description ?? '',
    parameters: t.input_schema as OpenAI.FunctionParameters,
  },
}));

// ── Tool execution ───────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case 'bash': {
      const command = input['command'] as string;
      const timeout = (input['timeout'] as number) || 30000;
      const decode = (buf: Buffer | string): string => {
        if (typeof buf === 'string') return buf;
        // 先尝试 UTF-8，无替换字符则说明是合法 UTF-8
        const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
        if (!utf8.includes('\uFFFD')) return utf8;
        // 有乱码则回退 GBK（Windows 系统命令的原生输出）
        if (process.platform === 'win32') {
          return new TextDecoder('gbk').decode(buf);
        }
        return utf8;
      };
      try {
        const result = await execAsync(command, {
          timeout,
          maxBuffer: 1024 * 1024 * 5,
          cwd: workspaceDir,
          encoding: 'buffer',
        });
        const stdout = decode((result as unknown as { stdout: Buffer }).stdout);
        const stderr = decode((result as unknown as { stderr: Buffer }).stderr);
        let output = '';
        if (stdout) output += stdout;
        if (stderr) output += (output ? '\n[stderr]\n' : '[stderr]\n') + stderr;
        if (!output) output = '(command completed with no output)';
        return output.length > MAX_OUTPUT
          ? output.slice(0, MAX_OUTPUT) + '\n... [output truncated]'
          : output;
      } catch (err: unknown) {
        const e = err as { message: string; cmd?: string; stderr?: Buffer | string; stdout?: Buffer | string };
        // e.message 包含 Node.js 用默认编码解析的 stderr，会乱码
        // 只取第一行（"Command failed: <cmd>"），stderr/stdout 用正确编码单独解码
        const firstLine = e.message.split('\n')[0];
        let msg = firstLine.startsWith('Command failed') ? firstLine : `Command failed: ${firstLine}`;
        if (e.stderr) msg += `\n[stderr]\n${decode(e.stderr)}`;
        if (e.stdout) msg += `\n[stdout]\n${decode(e.stdout)}`;
        return msg.slice(0, MAX_OUTPUT);
      }
    }

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
        const lines = entries.map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`);
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

    default:
      return `Unknown tool: ${name}`;
  }
}
