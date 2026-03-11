import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import { getOpenAITools } from '../tools.js';
import { buildSystemPrompt } from './base.js';
import type { EmitFn, LLMProvider, ToolCall, TurnResult } from './base.js';

type SimpleMsg = { role: 'user' | 'assistant'; content: string };

const THINK_CLOSE_TAGS = ['</thinking>', '</think>'] as const;

function findLastThinkingCloseTag(text: string): { index: number; tag: string } | null {
  let lastMatch: { index: number; tag: string } | null = null;

  for (const tag of THINK_CLOSE_TAGS) {
    const index = text.lastIndexOf(tag);
    if (index !== -1 && (!lastMatch || index > lastMatch.index)) {
      lastMatch = { index, tag };
    }
  }

  return lastMatch;
}

export function extractFinalTextAfterThinking(text: string): string {
  const match = findLastThinkingCloseTag(text);
  if (!match) return '';
  return text.slice(match.index + match.tag.length).trim();
}

export function stripThinkingTags(text: string): string {
  return text
    .replace(/<\/?think>/g, '')
    .replace(/<\/?thinking>/g, '')
    .trim();
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;
  private messages: ChatCompletionMessageParam[];

  constructor(
    apiKey: string,
    model: string,
    baseUrl: string,
    history: SimpleMsg[] = [],
    userMessage = '',
    systemPrompt?: string,
    images?: string[]
  ) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
    this.model = model;

    type OAIUserContent =
      | string
      | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

    let userContent: OAIUserContent = userMessage;
    if (images && images.length > 0) {
      const parts: Array<
        { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
      > = images.map((url) => ({ type: 'image_url', image_url: { url } }));
      if (userMessage) parts.push({ type: 'text', text: userMessage });
      userContent = parts;
    }

    this.messages = [
      { role: 'system', content: systemPrompt ?? buildSystemPrompt() },
      ...history.map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      })),
      ...(userMessage || (images && images.length > 0)
        ? [{ role: 'user' as const, content: userContent }]
        : []),
    ];
  }

  async doTurn(emit: EmitFn): Promise<TurnResult> {
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();
    let rawText = '';
    let finalText = '';
    let thinkingText = '';
    let inThinkingMode = false;

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      tools: getOpenAITools(),
      tool_choice: 'auto',
      stream: true,
    });

    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      finishReason = chunk.choices[0]?.finish_reason ?? finishReason;

      if (delta?.content) {
        const content = delta.content;
        rawText += content;

        if (content.includes('<think>') || content.includes('<thinking>')) {
          inThinkingMode = true;
        }

        if (inThinkingMode) {
          thinkingText += content;
          emit('thinking_delta', { text: content });

          if (content.includes('</think>') || content.includes('</thinking>')) {
            inThinkingMode = false;
          }
        } else if (thinkingText && !content.includes('<') && !content.includes('>')) {
          finalText += content;
          emit('text_delta', { text: content });
        } else {
          const extractedText = extractFinalTextAfterThinking(rawText);
          if (extractedText) {
            if (!finalText.includes(extractedText)) {
              finalText = extractedText;
              emit('text_delta', { text: content });
            }
          } else {
            thinkingText += content;
            emit('thinking_delta', { text: content });
          }
        }
      }

      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index;
          if (!toolCallMap.has(index)) {
            toolCallMap.set(index, { id: '', name: '', args: '' });
          }
          const acc = toolCallMap.get(index)!;
          if (toolCall.id) acc.id = toolCall.id;
          if (toolCall.function?.name) acc.name = toolCall.function.name;
          if (toolCall.function?.arguments) acc.args += toolCall.function.arguments;
        }
      }
    }

    if (!finalText && thinkingText) {
      const match = findLastThinkingCloseTag(thinkingText);
      if (match) {
        finalText = thinkingText.slice(match.index + match.tag.length).trim();
        thinkingText = thinkingText.slice(0, match.index + match.tag.length);
      }
    }

    const cleanThinking = stripThinkingTags(thinkingText);

    const toolCalls: ToolCall[] = [];
    if (finishReason === 'tool_calls' && toolCallMap.size > 0) {
      for (const [, toolCall] of [...toolCallMap.entries()].sort(([a], [b]) => a - b)) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(toolCall.args || '{}');
        } catch {
          input = { _raw: toolCall.args };
        }

        toolCalls.push({ id: toolCall.id, name: toolCall.name, input });
        emit('tool_call', { id: toolCall.id, name: toolCall.name, input });
      }

      this.messages.push({
        role: 'assistant',
        content: finalText || extractFinalTextAfterThinking(rawText) || rawText || null,
        tool_calls: toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: 'function' as const,
          function: { name: toolCall.name, arguments: JSON.stringify(toolCall.input) },
        })),
      });

      return {
        text: finalText || extractFinalTextAfterThinking(rawText) || rawText,
        stopReason: 'tool_use',
        toolCalls,
        thinking: cleanThinking,
      };
    }

    const outputText = finalText || extractFinalTextAfterThinking(rawText) || rawText;
    this.messages.push({ role: 'assistant', content: outputText });
    return { text: outputText, stopReason: 'end_turn', toolCalls: [], thinking: cleanThinking };
  }

  addToolResults(_toolCalls: ToolCall[], results: Array<{ id: string; result: string }>): void {
    for (const result of results) {
      this.messages.push({
        role: 'tool',
        tool_call_id: result.id,
        content: result.result,
      });
    }
  }
}
