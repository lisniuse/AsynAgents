import { describe, expect, it } from 'vitest';
import {
  extractFinalTextAfterThinking,
  extractThinkingContent,
  sanitizeAssistantOutput,
  stripThinkingTags,
} from '../src/agent/providers/openai.js';

describe('OpenAI thinking extraction', () => {
  it('extracts final text after </thinking> without leaking tag tail', () => {
    const raw = '<thinking>\ninternal\n</thinking>\n\nhello there';
    expect(extractFinalTextAfterThinking(raw)).toBe('hello there');
  });

  it('extracts final text after </think>', () => {
    const raw = '<think>internal</think>\nfinal answer';
    expect(extractFinalTextAfterThinking(raw)).toBe('final answer');
  });

  it('strips thinking tags cleanly', () => {
    const raw = '<thinking>\ninternal\n</thinking>';
    expect(stripThinkingTags(raw)).toBe('internal');
  });

  it('sanitizes malformed nested thinking residue from assistant output', () => {
    const raw = '<thinking>plan</thinking>\n\n<thinking>\n好的\n</老大，布丁已经帮您看完了';
    expect(sanitizeAssistantOutput(raw)).toBe('老大，布丁已经帮您看完了');
  });

  it('extracts only the thinking body from complete tags', () => {
    const raw = '<thinking>\nfirst\n</thinking>\n\nfinal answer';
    expect(extractThinkingContent(raw)).toBe('first');
  });
});
