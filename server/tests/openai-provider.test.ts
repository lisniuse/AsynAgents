import { describe, expect, it } from 'vitest';
import { extractFinalTextAfterThinking, stripThinkingTags } from '../src/agent/providers/openai.js';

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
});
