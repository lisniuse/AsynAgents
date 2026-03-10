import { config } from '../../../config.js';
import { messageQueue } from '../queue/MessageQueue.js';
import { executeTool, isPythonToolAvailable } from './tools.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { createChildLogger } from '../utils/logger.js';
import type { LLMProvider } from './providers/base.js';
import { buildSystemPrompt } from './providers/base.js';
import { loadSkills, buildSkillsPrompt } from '../skills/SkillLoader.js';
import { buildExperiencePrompt, loadExperiences } from '../experience/ExperienceLoader.js';
import type { SSEEvent } from '../types/index.js';

type SimpleMsg = { role: 'user' | 'assistant'; content: string };

function toLogMeta(data: unknown): Record<string, unknown> | undefined {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  if (data === undefined) return undefined;
  return { value: data };
}

// 0 means unlimited; fall back to 100 as a safety cap when unlimited
const MAX_ITERATIONS = config.maxIterations > 0 ? config.maxIterations : 100;

async function createProvider(history: SimpleMsg[], userMessage: string, images?: string[]): Promise<LLMProvider> {
  const [skills, experiences] = await Promise.all([loadSkills(), loadExperiences()]);
  const systemPrompt = buildSystemPrompt(
    `${buildSkillsPrompt(skills)}${buildExperiencePrompt(experiences)}`,
    config.ui?.userLanguage ?? 'auto',
    config.persona
  );

  if (config.provider === 'openai') {
      return new OpenAIProvider(
        config.openai.apiKey,
        config.openai.model,
        config.openai.baseUrl,
      history,
      userMessage,
      systemPrompt,
      images
    );
  }
    return new AnthropicProvider(
      config.anthropic.apiKey,
      config.anthropic.model,
      config.anthropic.baseUrl,
    history,
    userMessage,
    systemPrompt,
    images
  );
}

export class SubAgent {
  private stopped = false;
  private logger = createChildLogger('SubAgent');

  stop(): void {
    this.stopped = true;
    this.logger.info('Agent stop requested');
  }

  isStopped(): boolean {
    return this.stopped;
  }

  async run(
    threadId: string,
    conversationId: string,
    conversationHistory: SimpleMsg[],
    userMessage: string,
    images?: string[]
  ): Promise<string> {
    this.stopped = false;
    const logger = createChildLogger(`Thread-${threadId.slice(0, 8)}`);

    logger.info('Starting agent', { conversationId, userMessageLength: userMessage.length });

    const publish = (type: SSEEvent['type'], data: unknown): void => {
      if (this.stopped) return;
      logger.debug(`Publishing event: ${type}`, toLogMeta(data));
      messageQueue.publish(conversationId, { type, threadId, data, timestamp: Date.now() });
    };

    publish('agent_start', { threadId });

    const provider = await createProvider(conversationHistory, userMessage, images);
    let finalText = '';
    let thinkingText = '';

    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        if (this.stopped) {
          logger.info('Agent stopped by user');
          publish('agent_stopped', { threadId, reason: 'user_requested' });
          return finalText;
        }

        logger.info(`Starting turn ${i + 1}`);
        
        const result = await provider.doTurn((type, data) => {
          if (this.stopped) return;
          
          logger.debug(`Provider emitted: ${type}`, toLogMeta(data));
          
          if (type === 'thinking_delta') {
            const delta = (data as { text: string }).text;
            thinkingText += delta;
            publish('thinking_delta', data);
          } else if (type === 'text_delta') {
            const delta = (data as { text: string }).text;
            finalText += delta;
            publish('text_delta', data);
          } else if (type === 'tool_call') {
            publish('tool_call', data);
          }
        });

        if (this.stopped) {
          logger.info('Agent stopped by user after turn');
          publish('agent_stopped', { threadId, reason: 'user_requested' });
          return finalText;
        }

        finalText = result.text;
        // 如果 provider 返回了思考内容，使用它
        if (result.thinking) {
          thinkingText = result.thinking;
        }
        logger.info('Turn completed', { stopReason: result.stopReason, textLength: result.text.length });

        if (result.stopReason === 'end_turn' || result.toolCalls.length === 0) {
          logger.info('Ending conversation');
          break;
        }

        // Execute tools and collect results
        const results: Array<{ id: string; result: string }> = [];
        for (const tc of result.toolCalls) {
          if (this.stopped) {
            logger.info('Agent stopped during tool execution');
            publish('agent_stopped', { threadId, reason: 'user_requested' });
            return finalText;
          }

          logger.info(`Executing tool: ${tc.name}`);
          if (tc.name === 'python' && !isPythonToolAvailable()) {
            const output = 'Error: Python tool is disabled because the configured Python interpreter is unavailable.';
            publish('tool_result', { id: tc.id, toolName: tc.name, result: output, isError: true });
            results.push({ id: tc.id, result: output });
            continue;
          }
          const output = await executeTool(tc.name, tc.input);
          const isError = output.startsWith('Error') || output.startsWith('Command failed');
          logger.info('Tool execution completed', { toolName: tc.name, isError, outputLength: output.length });
          publish('tool_result', { id: tc.id, toolName: tc.name, result: output, isError });
          results.push({ id: tc.id, result: output });
        }

        provider.addToolResults(result.toolCalls, results);
        finalText = ''; // reset; real final text comes after last tool round
      }

      if (this.stopped) {
        logger.info('Agent stopped before completion');
        publish('agent_stopped', { threadId, reason: 'user_requested' });
      } else {
        logger.info('Agent completed successfully', { finalTextLength: finalText.length });
        publish('agent_done', { success: true, text: finalText, thinking: thinkingText });
      }
      
      return finalText;
    } catch (err: unknown) {
      const errMsg = (err as Error).message || 'Unknown error';
      logger.error('Agent error', { error: errMsg, stack: (err as Error).stack });
      publish('error', { message: errMsg });
      throw err;
    }
  }
}
