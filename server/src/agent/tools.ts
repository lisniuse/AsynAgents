import { exec } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import { config, workspaceDir } from '../../../config.js';
import { getExperienceContent } from '../experience/ExperienceStorage.js';
import { startManagedProcess } from '../process/ManagedProcessStorage.js';
import { getSkillContent } from '../skills/SkillLoader.js';
import { isCatalogItemEnabled } from '../storage/FeatureToggleStorage.js';
import { resolveWritableImagesDir } from '../utils/runtimePaths.js';

const execAsync = promisify(exec);
const MAX_OUTPUT = 12000;
let pythonToolAvailable = true;
const PYTHON_TOOL_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  PYTHONIOENCODING: 'utf-8',
  PYTHONUTF8: '1',
};

export interface ToolExecutionResult {
  output: string;
  images?: string[];
}

export interface ToolExecutionContext {
  rootDir?: string;
  conversationId?: string;
  signal?: AbortSignal;
}

if (!existsSync(workspaceDir)) {
  mkdirSync(workspaceDir, { recursive: true });
}

function resolveWorkspacePath(inputPath: string, rootDir = workspaceDir): string {
  if (path.isAbsolute(inputPath)) return inputPath;
  return path.resolve(rootDir, inputPath);
}

function decodeCommandOutput(buf: Buffer | string): string {
  if (typeof buf === 'string') return buf;
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf8.includes('\uFFFD')) return utf8;
  if (process.platform === 'win32') {
    try {
      return new TextDecoder('gb18030').decode(buf);
    } catch {
      try {
        return new TextDecoder('gbk').decode(buf);
      } catch {
        return utf8;
      }
    }
  }
  return utf8;
}

function truncateOutput(output: string): string {
  return output.length > MAX_OUTPUT
    ? `${output.slice(0, MAX_OUTPUT)}\n... [output truncated]`
    : output;
}

function quoteShellArg(value: string): string {
  if (process.platform === 'win32') {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function guessExtensionFromMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/webp') return '.webp';
  if (normalized === 'image/gif') return '.gif';
  if (normalized === 'image/bmp') return '.bmp';
  if (normalized === 'image/svg+xml') return '.svg';
  return '.jpg';
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function makeImageFileName(requested?: string, extension = '.jpg'): string {
  const stem = requested
    ? sanitizeFileName(path.basename(requested, path.extname(requested)))
    : `assistant-image-${Date.now()}`;
  const safeStem = stem || `assistant-image-${Date.now()}`;
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return `${safeStem}${ext.toLowerCase()}`;
}

async function ensureUniqueImagePath(fileName: string): Promise<{ filePath: string; publicUrl: string }> {
  const imagesDir = resolveWritableImagesDir();
  await fs.mkdir(imagesDir, { recursive: true });

  const parsed = path.parse(fileName);
  const baseName = parsed.name || `assistant-image-${Date.now()}`;
  const ext = parsed.ext || '.jpg';
  let candidate = `${baseName}${ext}`;
  let index = 1;

  while (existsSync(path.join(imagesDir, candidate))) {
    candidate = `${baseName}-${index}${ext}`;
    index += 1;
  }

  return {
    filePath: path.join(imagesDir, candidate),
    publicUrl: `/images/${candidate.replace(/\\/g, '/')}`,
  };
}

async function saveAssistantImage(
  source: string,
  options?: { fileName?: string; mimeType?: string }
): Promise<{ filePath: string; publicUrl: string }> {
  const trimmed = source.trim();
  let buffer: Buffer;
  let extension = '.jpg';

  if (/^https?:\/\//i.test(trimmed)) {
    const response = await fetch(trimmed);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`URL did not return an image: ${contentType || 'unknown content type'}`);
    }

    buffer = Buffer.from(await response.arrayBuffer());
    extension = guessExtensionFromMime(contentType);
  } else if (trimmed.startsWith('data:image/')) {
    const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid base64 image data URL.');
    }
    extension = guessExtensionFromMime(match[1]);
    buffer = Buffer.from(match[2], 'base64');
  } else {
    const resolvedPath = resolveWorkspacePath(trimmed);
    if (existsSync(resolvedPath)) {
      buffer = await fs.readFile(resolvedPath);
      extension = path.extname(resolvedPath) || '.jpg';
    } else if (options?.mimeType) {
      buffer = Buffer.from(trimmed, 'base64');
      extension = guessExtensionFromMime(options.mimeType);
    } else {
      throw new Error('Image source must be a URL, a local file path, or a base64 data URL.');
    }
  }

  const requestedName = options?.fileName
    ? options.fileName
    : /^https?:\/\//i.test(trimmed)
      ? path.basename(new URL(trimmed).pathname)
      : path.basename(trimmed);
  const fileName = makeImageFileName(requestedName, extension || '.jpg');
  const destination = await ensureUniqueImagePath(fileName);
  await fs.writeFile(destination.filePath, buffer);
  return destination;
}

export function buildPythonCommand(code: string): string {
  const pythonPath = (config.python?.path || 'python').trim() || 'python';
  return `${quoteShellArg(pythonPath)} -c ${quoteShellArg(code)}`;
}

function buildPythonScriptCommand(scriptPath: string): string {
  const pythonPath = (config.python?.path || 'python').trim() || 'python';
  return `${quoteShellArg(pythonPath)} -u ${quoteShellArg(scriptPath)}`;
}

export function setPythonToolAvailable(available: boolean): void {
  pythonToolAvailable = available;
}

export function isPythonToolAvailable(): boolean {
  return pythonToolAvailable;
}

export async function probePythonTool(): Promise<{ available: boolean; error?: string }> {
  try {
    const output = await executePython('import sys\nprint(sys.version)', 10000);
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
      'Execute a shell command. Use for running programs, installing packages, checking system info, compiling code, running tests, and starting long-running dev servers. For long-running commands, set background=true so the process can be managed later.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' },
        background: { type: 'boolean', description: 'Whether to keep the command running in the background for later management' },
        name: { type: 'string', description: 'Optional short label for the managed background process' },
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
    name: 'send_image',
    description:
      'Copy an image into the app static images directory and attach it to the current assistant reply. Supports http(s) URLs, local file paths, and base64 data URLs.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Image source: http(s) URL, local path, or base64 data URL' },
        fileName: { type: 'string', description: 'Optional target filename to use when saving the image' },
        mimeType: { type: 'string', description: 'Optional MIME type when source is raw base64 without a data URL prefix' },
      },
      required: ['source'],
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

function isAbortError(error: unknown): boolean {
  const candidate = error as { name?: string; code?: string; message?: string };
  return candidate?.name === 'AbortError'
    || candidate?.code === 'ABORT_ERR'
    || candidate?.message === 'The operation was aborted';
}

async function executeBash(
  command: string,
  timeout: number,
  rootDir = workspaceDir,
  signal?: AbortSignal
): Promise<string> {
  try {
    const result = await execAsync(command, {
      timeout,
      maxBuffer: 1024 * 1024 * 5,
      cwd: rootDir,
      encoding: 'buffer',
      signal,
    });
    const stdout = decodeCommandOutput((result as unknown as { stdout: Buffer }).stdout);
    const stderr = decodeCommandOutput((result as unknown as { stderr: Buffer }).stderr);
    let output = '';
    if (stdout) output += stdout;
    if (stderr) output += (output ? '\n[stderr]\n' : '[stderr]\n') + stderr;
    if (!output) output = '(command completed with no output)';
    return truncateOutput(output);
  } catch (err: unknown) {
    if (isAbortError(err)) {
      return 'Command aborted by user.';
    }
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

async function executePython(
  code: string,
  timeout: number,
  rootDir = workspaceDir,
  signal?: AbortSignal
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(rootDir, '.python-tool-'));
  const scriptPath = path.join(tempDir, 'script.py');

  try {
    await fs.writeFile(scriptPath, code, 'utf8');
    const result = await execAsync(buildPythonScriptCommand(scriptPath), {
      timeout,
      maxBuffer: 1024 * 1024 * 5,
      cwd: rootDir,
      encoding: 'buffer',
      env: PYTHON_TOOL_ENV,
      signal,
    });
    const stdout = decodeCommandOutput((result as unknown as { stdout: Buffer }).stdout);
    const stderr = decodeCommandOutput((result as unknown as { stderr: Buffer }).stderr);
    let output = '';
    if (stdout) output += stdout;
    if (stderr) output += (output ? '\n[stderr]\n' : '[stderr]\n') + stderr;
    if (!output) output = '(command completed with no output)';
    return truncateOutput(output);
  } catch (err: unknown) {
    if (isAbortError(err)) {
      return 'Command aborted by user.';
    }
    const error = err as { message: string; stderr?: Buffer | string; stdout?: Buffer | string };
    const firstLine = error.message.split('\n')[0];
    let output = firstLine.startsWith('Command failed')
      ? firstLine
      : `Command failed: ${firstLine}`;
    if (error.stderr) output += `\n[stderr]\n${decodeCommandOutput(error.stderr)}`;
    if (error.stdout) output += `\n[stdout]\n${decodeCommandOutput(error.stdout)}`;
    return truncateOutput(output);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolExecutionContext = {}
): Promise<ToolExecutionResult> {
  const rootDir = context.rootDir || workspaceDir;
  switch (name) {
    case 'bash': {
      if (input['background']) {
        if (!context.conversationId) {
          return {
            output: 'Error: Background bash commands require an active conversation context.',
          };
        }

        try {
          const managed = await startManagedProcess({
            conversationId: context.conversationId,
            command: input['command'] as string,
            cwd: rootDir,
            name: input['name'] as string | undefined,
          });
          const urls = managed.urls.length > 0 ? `\nURLs: ${managed.urls.join(', ')}` : '';
          const ports = managed.ports.length > 0 ? `\nPorts: ${managed.ports.join(', ')}` : '';
          return {
            output:
              `Started background process "${managed.name}" (ID: ${managed.id}, PID: ${managed.pid}).` +
              `\nUse the process manager to inspect logs, open detected URLs, stop it, or delete the record.` +
              urls +
              ports,
          };
        } catch (err: unknown) {
          return {
            output: `Error starting background process: ${(err as Error).message}`,
          };
        }
      }

      return {
        output: await executeBash(
          input['command'] as string,
          (input['timeout'] as number) || 30000,
          rootDir,
          context.signal
        ),
      };
    }

    case 'python':
      return {
        output: await executePython(
          input['code'] as string,
          (input['timeout'] as number) || 30000,
          rootDir,
          context.signal
        ),
      };

    case 'send_image': {
      try {
        const saved = await saveAssistantImage(input['source'] as string, {
          fileName: input['fileName'] as string | undefined,
          mimeType: input['mimeType'] as string | undefined,
        });
        return {
          output: `Saved image for assistant reply: ${saved.publicUrl}`,
          images: [saved.publicUrl],
        };
      } catch (err: unknown) {
        return { output: `Error saving image: ${(err as Error).message}` };
      }
    }

    case 'write_file': {
      const filePath = resolveWorkspacePath(input['path'] as string, rootDir);
      const content = input['content'] as string;
      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf8');
        return { output: `Successfully wrote ${content.length} bytes to: ${filePath}` };
      } catch (err: unknown) {
        return { output: `Error writing file: ${(err as Error).message}` };
      }
    }

    case 'read_file': {
      const filePath = resolveWorkspacePath(input['path'] as string, rootDir);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        return {
          output: content.length > MAX_OUTPUT
            ? `${content.slice(0, MAX_OUTPUT)}\n... [content truncated]`
            : content,
        };
      } catch (err: unknown) {
        return { output: `Error reading file: ${(err as Error).message}` };
      }
    }

    case 'list_directory': {
      const dirPath = resolveWorkspacePath((input['path'] as string) || rootDir, rootDir);
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        if (entries.length === 0) return { output: '(empty directory)' };
        const lines = entries.map((entry) => `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`);
        return { output: `Contents of ${dirPath}:\n${lines.join('\n')}` };
      } catch (err: unknown) {
        return { output: `Error listing directory: ${(err as Error).message}` };
      }
    }

    case 'get_skill': {
      const skillName = input['name'] as string;
      const content = await getSkillContent(skillName);
      if (content === null) {
        return { output: `Skill "${skillName}" not found. Use the available skills list in the system prompt.` };
      }
      return { output: content };
    }

    case 'get_experience': {
      const experienceName = input['name'] as string;
      if (!(await isCatalogItemEnabled('experiences', experienceName.endsWith('.md') ? experienceName : `${experienceName}.md`))) {
        return { output: `Experience "${experienceName}" is disabled.` };
      }
      const content = await getExperienceContent(experienceName);
      if (content === null) {
        return { output: `Experience "${experienceName}" not found. Use the available experiences list in the system prompt.` };
      }
      return { output: content };
    }

    default:
      return { output: `Unknown tool: ${name}` };
  }
}
