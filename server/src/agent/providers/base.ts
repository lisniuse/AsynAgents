import { isPythonToolAvailable } from '../tools.js';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface TurnResult {
  text: string;
  /** 'end_turn' = done; 'tool_use' = has tool calls */
  stopReason: 'end_turn' | 'tool_use';
  toolCalls: ToolCall[];
  /** 思考过程内容 */
  thinking?: string;
}

export type EmitFn = (
  type: 'text_delta' | 'thinking_delta' | 'tool_call',
  data: unknown
) => void;

/**
 * A provider manages its own internal message state and executes one API
 * "turn" at a time. SubAgent owns the outer loop and tool execution.
 */
export interface LLMProvider {
  /** Stream one API call; emit text deltas and tool_call notifications */
  doTurn(emit: EmitFn): Promise<TurnResult>;

  /** Add executed tool results so next doTurn() can continue */
  addToolResults(
    toolCalls: ToolCall[],
    results: Array<{ id: string; result: string }>
  ): void;
}

function buildToolSection(): string {
  const toolLines = [
    '- bash: Execute any shell command (package managers, compilers, interpreters, etc.)',
    '- write_file: Create or overwrite a file',
    '- read_file: Read file contents',
    '- list_directory: List directory contents',
    '- send_image: Save an image into the static images directory and attach it to the assistant reply',
    '- get_experience: Read a saved experience note in full',
    '- get_skill: Read a skill instruction file in full',
  ];

  if (isPythonToolAvailable()) {
    toolLines.splice(1, 0, '- python: Execute Python code with the configured Python interpreter');
  }

  return toolLines.join('\n');
}

function buildOsSection(): string {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    return `
## Runtime Environment
- OS: Windows (${arch})
- Preferred shell: **PowerShell** (use \`powershell -Command "..."\` or plain PowerShell syntax)
- Fallback shell: cmd.exe (use only when PowerShell is unavailable)
- Do NOT use Unix-only commands (ls, grep, cat, etc.) — use PowerShell equivalents (Get-ChildItem, Select-String, Get-Content, etc.)
- Path separator: backslash (\`\\\`)`;
  }

  if (platform === 'darwin') {
    return `
## Runtime Environment
- OS: macOS (${arch})
- Preferred shell: **bash** or **zsh**
- Use standard Unix commands freely (ls, grep, cat, find, etc.)
- Path separator: forward slash (\`/\`)`;
  }

  return `
## Runtime Environment
- OS: Linux (${arch})
- Preferred shell: **bash**
- Use standard Unix commands freely (ls, grep, cat, find, etc.)
- Path separator: forward slash (\`/\`)`;
}

function buildBaseSystemPrompt(): string {
  return `You are a powerful AI sub-agent with full system access. You can run shell commands, write and read files, install packages, execute code in any language, and solve complex problems.

Available tools:
${buildToolSection()}
${buildOsSection()}

IMPORTANT: You must separate your thinking process from your final answer using the following format:
<thinking>
Put your thinking process, analysis, and reasoning here. This includes:
- Understanding the user's request
- Planning your approach
- Analyzing results
- Deciding next steps
</thinking>

Your final answer here. This should be the actual result or response to the user, without any thinking or reasoning.

Guidelines:
1. ALWAYS wrap your thinking process in <thinking>...</thinking> tags
2. Put your actual response AFTER the closing </thinking> tag
3. The content inside <thinking> tags will be shown separately from your final answer
4. Be concise in your final answer
5. Keep working until the task is FULLY completed`;
}

function buildUserLanguageSection(userLanguage: string): string {
  if (userLanguage === 'zh') {
    return '\n\n## Response Language\nAlways respond to the user in **Chinese (中文)**, regardless of the language they write in.';
  }
  if (userLanguage === 'en') {
    return '\n\n## Response Language\nAlways respond to the user in **English**, regardless of the language they write in.';
  }
  // 'auto' or unknown: no constraint
  return '';
}

interface PersonaOptions {
  aiName?: string;
  userName?: string;
  personality?: string;
}

interface ProjectModeOptions {
  projectPath?: string;
}

const PERSONA_NAME_ALLOWED = /[A-Za-z0-9_\u3400-\u9FFF]/gu;

function sanitizePersonaName(value?: string): string {
  if (!value) return '';
  const matches = value.match(PERSONA_NAME_ALLOWED);
  return (matches ?? []).join('').slice(0, 32).trim();
}

function buildPersonaSection(persona: PersonaOptions): string {
  const lines: string[] = [];
  const aiName = sanitizePersonaName(persona.aiName);
  const userName = sanitizePersonaName(persona.userName);
  if (aiName) lines.push(`- Your name is **${aiName}**. Use this name when introducing yourself.`);
  if (userName) lines.push(`- Address the user as **${userName}**.`);
  if (persona.personality?.trim()) lines.push(`- Personality / tone: ${persona.personality.trim()}`);
  if (lines.length === 0) return '';
  return '\n\n## Persona\n' + lines.join('\n');
}

function buildProjectModeSection(projectMode?: ProjectModeOptions): string {
  const projectPath = projectMode?.projectPath?.trim();
  if (!projectPath) {
    return '';
  }

  return `\n\n## Project Mode
- You are operating in an AI IDE style project session.
- The active project root is: ${projectPath}
- Treat this project root as your default working directory for code, file reads, file writes, and shell commands.
- Prefer inspecting the project structure before making changes.
- When you make code changes, keep them cohesive and oriented toward buildable results.`;
}

/** Build the full system prompt, optionally appending skills and user language preference. */
export function buildSystemPrompt(
  skillsSection?: string,
  userLanguage?: string,
  persona?: PersonaOptions,
  projectMode?: ProjectModeOptions
): string {
  const basePrompt = buildBaseSystemPrompt();
  const langSection = userLanguage ? buildUserLanguageSection(userLanguage) : '';
  const personaSection = persona ? buildPersonaSection(persona) : '';
  const projectModeSection = buildProjectModeSection(projectMode);
  return basePrompt + personaSection + projectModeSection + langSection + (skillsSection ?? '');
}

/** @deprecated Use buildSystemPrompt() instead */
export const SYSTEM_PROMPT = buildBaseSystemPrompt();
