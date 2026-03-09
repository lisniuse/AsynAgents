import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, TurnResult, ToolCall, EmitFn } from './base.js';
import { buildSystemPrompt } from './base.js';
import { anthropicTools } from '../tools.js';

type SimpleMsg = { role: 'user' | 'assistant'; content: string };

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private messages: Anthropic.MessageParam[];
  private systemPrompt: string;

  constructor(
    apiKey: string,
    model: string,
    baseUrl?: string,
    history: SimpleMsg[] = [],
    userMessage: string = '',
    systemPrompt?: string
  ) {
    this.client = new Anthropic({ apiKey, baseURL: baseUrl });
    this.model = model;
    this.systemPrompt = systemPrompt ?? buildSystemPrompt();
    this.messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      ...(userMessage ? [{ role: 'user' as const, content: userMessage }] : []),
    ];
  }

  async doTurn(emit: EmitFn): Promise<TurnResult> {
    let currentToolId = '';
    let currentToolName = '';
    let currentInputJson = '';
    let text = '';

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 8192,
      system: this.systemPrompt,
      tools: anthropicTools,
      messages: this.messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolId = event.content_block.id;
          currentToolName = event.content_block.name;
          currentInputJson = '';
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          text += event.delta.text;
          emit('text_delta', { text: event.delta.text });
        } else if (event.delta.type === 'input_json_delta') {
          currentInputJson += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolId && currentToolName) {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(currentInputJson || '{}'); } catch { input = { _raw: currentInputJson }; }
          emit('tool_call', { id: currentToolId, name: currentToolName, input });
          currentToolId = '';
          currentToolName = '';
          currentInputJson = '';
        }
      }
    }

    const response = await stream.finalMessage();
    // Append raw assistant content (preserves tool_use blocks Anthropic needs)
    this.messages.push({ role: 'assistant', content: response.content });

    const toolCalls: ToolCall[] = (response.content as Anthropic.ContentBlock[])
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

    const stopReason = response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn';
    return { text, stopReason, toolCalls };
  }

  addToolResults(toolCalls: ToolCall[], results: Array<{ id: string; result: string }>): void {
    const toolResults: Anthropic.ToolResultBlockParam[] = results.map((r) => ({
      type: 'tool_result',
      tool_use_id: r.id,
      content: r.result,
    }));
    this.messages.push({ role: 'user', content: toolResults });
  }
}
