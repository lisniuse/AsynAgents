import OpenAI from 'openai';
import type { LLMProvider, TurnResult, ToolCall, EmitFn } from './base.js';
import { buildSystemPrompt } from './base.js';
import { openAITools } from '../tools.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';

type SimpleMsg = { role: 'user' | 'assistant'; content: string };

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;
  private messages: ChatCompletionMessageParam[];

  constructor(
    apiKey: string,
    model: string,
    baseUrl: string,
    history: SimpleMsg[] = [],
    userMessage: string = '',
    systemPrompt?: string
  ) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
    this.model = model;
    this.messages = [
      { role: 'system', content: systemPrompt ?? buildSystemPrompt() },
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ...(userMessage ? [{ role: 'user' as const, content: userMessage }] : []),
    ];
  }

  async doTurn(emit: EmitFn): Promise<TurnResult> {
    // Accumulate tool calls across stream chunks (keyed by index)
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();
    let rawText = '';
    let finalText = '';
    let thinkingText = '';
    let inThinkingMode = false;

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      tools: openAITools,
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

        // 检测思考过程标记
        // 支持多种思考标记格式: <think>...</think>, <thinking>...</thinking>, 或 reasoning_content 字段
        if (content.includes('<think>') || content.includes('<thinking>')) {
          inThinkingMode = true;
        }

        if (inThinkingMode) {
          // 在思考模式中
          thinkingText += content;
          emit('thinking_delta', { text: content });

          // 检查是否结束思考
          if (content.includes('</think>') || content.includes('</thinking>')) {
            inThinkingMode = false;
          }
        } else {
          // 不在思考模式中，这是最终输出
          // 但如果包含思考标记，需要提取最终内容
          if (thinkingText && !content.includes('<') && !content.includes('>')) {
            // 已经有思考内容，当前内容是最终输出
            finalText += content;
            emit('text_delta', { text: content });
          } else {
            // 可能是思考内容的一部分，先存起来
            const thinkEndIndex = Math.max(
              rawText.lastIndexOf('</think>'),
              rawText.lastIndexOf('</thinking>')
            );
            if (thinkEndIndex !== -1) {
              // 提取 </think> 之后的内容作为最终输出
              const afterThink = rawText.slice(thinkEndIndex);
              const cleanContent = afterThink
                .replace(/<\/?think>/g, '')
                .replace(/<\/?thinking>/g, '')
                .trim();
              if (cleanContent && !finalText.includes(cleanContent)) {
                finalText = cleanContent;
                emit('text_delta', { text: content });
              }
            } else {
              // 还没有看到思考结束标记，可能是思考内容
              thinkingText += content;
              emit('thinking_delta', { text: content });
            }
          }
        }
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallMap.has(idx)) {
            toolCallMap.set(idx, { id: '', name: '', args: '' });
          }
          const acc = toolCallMap.get(idx)!;
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;
          if (tc.function?.arguments) acc.args += tc.function.arguments;
        }
      }
    }

    // 流结束后，如果最终文本为空但有思考内容，尝试提取
    if (!finalText && thinkingText) {
      const thinkEndIndex = Math.max(
        thinkingText.lastIndexOf('</think>'),
        thinkingText.lastIndexOf('</thinking>')
      );
      if (thinkEndIndex !== -1) {
        finalText = thinkingText.slice(thinkEndIndex + 8).trim(); // 8 is length of </think>
        thinkingText = thinkingText.slice(0, thinkEndIndex + 8);
      }
    }

    // 清理思考内容中的标记
    const cleanThinking = thinkingText
      .replace(/<\/?think>/g, '')
      .replace(/<\/?thinking>/g, '')
      .trim();

    const toolCalls: ToolCall[] = [];
    if (finishReason === 'tool_calls' && toolCallMap.size > 0) {
      for (const [, tc] of [...toolCallMap.entries()].sort(([a], [b]) => a - b)) {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.args || '{}'); } catch { input = { _raw: tc.args }; }
        toolCalls.push({ id: tc.id, name: tc.name, input });
        emit('tool_call', { id: tc.id, name: tc.name, input });
      }

      // Add assistant message with tool_calls to history
      this.messages.push({
        role: 'assistant',
        content: finalText || rawText || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        })),
      });

      return { text: finalText || rawText, stopReason: 'tool_use', toolCalls, thinking: cleanThinking };
    }

    // Normal end
    this.messages.push({ role: 'assistant', content: finalText || rawText });
    return { text: finalText || rawText, stopReason: 'end_turn', toolCalls: [], thinking: cleanThinking };
  }

  addToolResults(_toolCalls: ToolCall[], results: Array<{ id: string; result: string }>): void {
    for (const r of results) {
      this.messages.push({
        role: 'tool',
        tool_call_id: r.id,
        content: r.result,
      });
    }
  }
}
