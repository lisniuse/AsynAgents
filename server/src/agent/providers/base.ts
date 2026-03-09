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

const BASE_SYSTEM_PROMPT = `You are a powerful AI sub-agent with full system access. You can run shell commands, write and read files, install packages, execute code in any language, and solve complex problems.

Available tools:
- bash: Execute any shell command (package managers, compilers, interpreters, etc.)
- write_file: Create or overwrite a file
- read_file: Read file contents
- list_directory: List directory contents

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

/** Build the full system prompt, optionally appending skills content. */
export function buildSystemPrompt(skillsSection?: string): string {
  return skillsSection ? BASE_SYSTEM_PROMPT + skillsSection : BASE_SYSTEM_PROMPT;
}

/** @deprecated Use buildSystemPrompt() instead */
export const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;
