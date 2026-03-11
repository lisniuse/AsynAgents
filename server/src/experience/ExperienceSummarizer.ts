import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { config } from '../../../config.js';
import type { StoredConversation, StoredMessage } from '../types/index.js';
import {
  getExperience,
  listExperiences,
  saveExperience,
  type ExperienceRecord,
} from './ExperienceStorage.js';
import {
  getConversationExperienceState,
  setConversationExperienceState,
  type ConversationExperienceState,
} from './ExperienceStateStorage.js';

type SummaryTrigger = 'manual' | 'auto';

export interface SummarizeOptions {
  trigger: SummaryTrigger;
  force?: boolean;
}

export interface SummarizeResult {
  skipped: boolean;
  reason?: string;
  action?: 'create_new' | 'update_existing';
  experience?: ExperienceRecord;
}

interface DecisionPayload {
  action: 'create_new' | 'update_existing';
  target_file?: string;
  title: string;
  summary: string;
  keywords: string[];
}

interface ExperienceDraft {
  title: string;
  summary: string;
  keywords: string[];
  body_markdown: string;
}

function sanitizeLine(value: string): string {
  return value.replace(/\r?\n+/g, ' ').trim();
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'experience_note';
}

function normalizeKeywords(keywords: string[]): string[] {
  const normalized = keywords
    .map((keyword) => slugify(keyword))
    .filter(Boolean);
  return [...new Set(normalized)].slice(0, 6);
}

function normalizeFileName(decision: DecisionPayload): string {
  const raw = decision.target_file?.trim();
  if (raw) {
    const base = raw.replace(/\\/g, '/').split('/').pop() ?? raw;
    const stem = base.replace(/\.md$/i, '');
    return `${slugify(stem)}.md`;
  }

  const parts = normalizeKeywords(decision.keywords);
  if (parts.length > 0) {
    return `${parts.join('_')}.md`;
  }

  return `${slugify(decision.title)}.md`;
}

async function ensureUniqueFileName(baseFileName: string): Promise<string> {
  const existing = await getExperience(baseFileName);
  if (!existing) {
    return baseFileName;
  }

  const stem = baseFileName.replace(/\.md$/i, '');
  let index = 2;
  while (true) {
    const candidate = `${stem}_${index}.md`;
    if (!(await getExperience(candidate))) {
      return candidate;
    }
    index += 1;
  }
}

function getRelevantMessages(messages: StoredMessage[]): StoredMessage[] {
  return messages.filter((message) => message.kind !== 'summary_note');
}

export function supportsExperienceSummaries(conversation: StoredConversation): boolean {
  return !conversation.projectSession;
}

function buildConversationTranscript(conversation: StoredConversation): string {
  const parts: string[] = [];

  for (const message of getRelevantMessages(conversation.messages)) {
    const blocks = [`[${message.role.toUpperCase()}] ${message.content.trim()}`];
    if (message.thinking?.trim()) {
      blocks.push(`[THINKING]\n${message.thinking.trim()}`);
    }
    for (const toolCall of message.toolCalls ?? []) {
      blocks.push(`[TOOL ${toolCall.name}] input=${JSON.stringify(toolCall.input)}`);
      if (toolCall.result?.trim()) {
        blocks.push(`[TOOL RESULT]\n${toolCall.result.trim()}`);
      }
    }
    parts.push(blocks.join('\n'));
  }

  return parts.join('\n\n');
}

function buildExperienceIndex(experiences: ExperienceRecord[]): string {
  if (experiences.length === 0) {
    return '(no existing experiences)';
  }

  return experiences
    .map((experience) => {
      const keywords = experience.keywords.length > 0 ? experience.keywords.join(', ') : 'none';
      return `- file: ${experience.fileName}\n  title: ${experience.title}\n  summary: ${experience.summary}\n  keywords: ${keywords}`;
    })
    .join('\n');
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('Model did not return a JSON object');
  }

  return text.slice(first, last + 1);
}

async function callConfiguredModel(systemPrompt: string, userPrompt: string): Promise<string> {
  if (config.provider === 'openai') {
    const client = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseUrl,
    });

    const response = await client.chat.completions.create({
      model: config.openai.model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return response.choices[0]?.message?.content ?? '';
  }

  const client = new Anthropic({
    apiKey: config.anthropic.apiKey,
    baseURL: config.anthropic.baseUrl,
  });
  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 4096,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

async function callConfiguredModelJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const response = await callConfiguredModel(systemPrompt, userPrompt);
  const json = extractJsonObject(response);
  return JSON.parse(json) as T;
}

async function decideExperience(
  conversation: StoredConversation,
  experiences: ExperienceRecord[]
): Promise<DecisionPayload> {
  const transcript = buildConversationTranscript(conversation);
  const systemPrompt = [
    'You maintain an experience knowledge base for an autonomous coding agent.',
    'Decide whether the conversation should update an existing experience note or create a new one.',
    'Return strict JSON only.',
    'Use action = "update_existing" only when an existing experience already captures the same lesson.',
    'Use lowercase underscore keywords.',
  ].join(' ');
  const userPrompt = [
    `Conversation title: ${conversation.name}`,
    '',
    'Existing experiences:',
    buildExperienceIndex(experiences),
    '',
    'Conversation transcript:',
    transcript,
    '',
    'Return JSON with this schema:',
    '{"action":"create_new|update_existing","target_file":"optional existing filename.md","title":"short title","summary":"one sentence summary","keywords":["lowercase_keyword"]}',
  ].join('\n');

  const decision = await callConfiguredModelJson<DecisionPayload>(systemPrompt, userPrompt);
  return {
    action: decision.action === 'update_existing' ? 'update_existing' : 'create_new',
    target_file: decision.target_file,
    title: sanitizeLine(decision.title || conversation.name),
    summary: sanitizeLine(decision.summary || 'Experience distilled from a previous conversation.'),
    keywords: normalizeKeywords(decision.keywords ?? []),
  };
}

async function createExperienceDraft(
  conversation: StoredConversation,
  decision: DecisionPayload
): Promise<ExperienceDraft> {
  const transcript = buildConversationTranscript(conversation);
  const systemPrompt = [
    'You write durable experience notes for an autonomous coding agent.',
    'Return strict JSON only.',
    'Write in concise English.',
    'The body_markdown should capture the lesson, signals, and recommended action.',
  ].join(' ');
  const userPrompt = [
    `Conversation title: ${conversation.name}`,
    `Proposed title: ${decision.title}`,
    `Proposed summary: ${decision.summary}`,
    `Proposed keywords: ${decision.keywords.join(', ') || 'none'}`,
    '',
    'Conversation transcript:',
    transcript,
    '',
    'Return JSON with this schema:',
    '{"title":"string","summary":"string","keywords":["keyword"],"body_markdown":"markdown body"}',
  ].join('\n');

  const draft = await callConfiguredModelJson<ExperienceDraft>(systemPrompt, userPrompt);
  return {
    title: sanitizeLine(draft.title || decision.title),
    summary: sanitizeLine(draft.summary || decision.summary),
    keywords: normalizeKeywords(draft.keywords ?? decision.keywords),
    body_markdown: (draft.body_markdown || '## Experience\n\nNo additional details provided.').trim(),
  };
}

async function mergeExperienceDraft(
  conversation: StoredConversation,
  decision: DecisionPayload,
  existing: ExperienceRecord
): Promise<ExperienceDraft> {
  const transcript = buildConversationTranscript(conversation);
  const systemPrompt = [
    'You update an existing experience note with new evidence from a conversation.',
    'Return strict JSON only.',
    'Keep the note concise and avoid duplicated bullets.',
    'Write in concise English.',
  ].join(' ');
  const userPrompt = [
    `Existing file: ${existing.fileName}`,
    '',
    'Existing experience note:',
    [
      `Title: ${existing.title}`,
      `Summary: ${existing.summary}`,
      `Keywords: ${existing.keywords.join(', ') || 'none'}`,
      '',
      existing.body,
    ].join('\n'),
    '',
    'New conversation transcript:',
    transcript,
    '',
    'Update the note so it preserves the old lesson and incorporates any new useful detail.',
    'Return JSON with this schema:',
    '{"title":"string","summary":"string","keywords":["keyword"],"body_markdown":"markdown body"}',
  ].join('\n');

  const draft = await callConfiguredModelJson<ExperienceDraft>(systemPrompt, userPrompt);
  return {
    title: sanitizeLine(draft.title || decision.title || existing.title),
    summary: sanitizeLine(draft.summary || decision.summary || existing.summary),
    keywords: normalizeKeywords(draft.keywords ?? [...existing.keywords, ...decision.keywords]),
    body_markdown: (draft.body_markdown || existing.body).trim(),
  };
}

export function shouldAutoSummarizeConversation(
  conversation: StoredConversation,
  state: ConversationExperienceState,
  now: number,
  idleMinutes: number
): boolean {
  if (!supportsExperienceSummaries(conversation)) {
    return false;
  }

  const messages = getRelevantMessages(conversation.messages);
  if (messages.length === 0) {
    return false;
  }

  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) {
    return false;
  }

  if (now - lastUserMessage.timestamp < idleMinutes * 60 * 1000) {
    return false;
  }

  const messageCount = messages.length;
  if ((state.lastSummarizedMessageCount ?? 0) >= messageCount) {
    return false;
  }

  return true;
}

export async function summarizeConversation(
  conversation: StoredConversation,
  options: SummarizeOptions
): Promise<SummarizeResult> {
  if (!supportsExperienceSummaries(conversation)) {
    return {
      skipped: true,
      reason: 'Experience summaries are not available for project mode conversations.',
    };
  }

  const relevantMessages = getRelevantMessages(conversation.messages);
  if (relevantMessages.length === 0) {
    return { skipped: true, reason: 'Conversation has no messages to summarize.' };
  }

  const currentMessageCount = relevantMessages.length;
  const state = await getConversationExperienceState(conversation.id);
  if (!options.force && (state.lastSummarizedMessageCount ?? 0) >= currentMessageCount) {
    return { skipped: true, reason: 'Conversation has no new content since the last summary.' };
  }

  const experiences = await listExperiences();
  const decision = await decideExperience(conversation, experiences);
  const normalizedFileName = normalizeFileName(decision);
  const matchedExperience = await getExperience(normalizedFileName);
  const existing = decision.action === 'update_existing' ? matchedExperience : null;
  const fileName = existing
    ? existing.fileName
    : await ensureUniqueFileName(normalizedFileName);

  const draft = existing
    ? await mergeExperienceDraft(conversation, decision, existing)
    : await createExperienceDraft(conversation, decision);

  const saved = await saveExperience({
    fileName: existing?.fileName ?? fileName,
    title: draft.title,
    summary: draft.summary,
    keywords: draft.keywords.length > 0 ? draft.keywords : decision.keywords,
    sourceConversations: [
      ...(existing?.sourceConversations ?? []),
      conversation.id,
    ],
    updatedAt: new Date().toISOString(),
    body: draft.body_markdown,
  });

  await setConversationExperienceState(conversation.id, {
    lastSummarizedAt: Date.now(),
    lastSummarizedMessageCount: currentMessageCount,
    lastExperienceFile: saved.fileName,
  });

  return {
    skipped: false,
    action: existing ? 'update_existing' : 'create_new',
    experience: saved,
  };
}

export function getSummaryCommand(): string {
  return '/summarize';
}

export function getSummaryResultText(result: SummarizeResult): string {
  if (result.skipped) {
    return result.reason ?? 'No experience summary was produced.';
  }

  const actionText = result.action === 'update_existing'
    ? 'Updated experience'
    : 'Created experience';
  const experience = result.experience!;
  return `${actionText}: ${experience.fileName}\n${experience.title}\n${experience.summary}`;
}
