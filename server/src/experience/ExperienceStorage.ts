import { existsSync } from 'fs';
import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export interface ExperienceRecord {
  fileName: string;
  title: string;
  summary: string;
  keywords: string[];
  sourceConversations: string[];
  updatedAt: string;
  body: string;
}

const EXPERIENCE_DIR = join(homedir(), '.asynagents', 'experiences');

function toLine(value: string): string {
  return value.replace(/\r?\n+/g, ' ').trim();
}

function parseFrontMatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw.trim() };
  }

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    meta[key] = value;
  }

  return { meta, body: match[2].trim() };
}

function serializeFrontMatter(record: ExperienceRecord): string {
  const header = [
    '---',
    `title: ${toLine(record.title)}`,
    `summary: ${toLine(record.summary)}`,
    `keywords: ${record.keywords.map((keyword) => toLine(keyword)).filter(Boolean).join(', ')}`,
    `source_conversations: ${record.sourceConversations.join(', ')}`,
    `updated_at: ${record.updatedAt}`,
    '---',
    '',
  ].join('\n');

  return `${header}${record.body.trim()}\n`;
}

function normalizeFileName(name: string): string {
  const trimmed = name.trim().replace(/\\/g, '/').split('/').pop() ?? name.trim();
  if (!trimmed.endsWith('.md')) {
    return `${trimmed}.md`;
  }
  return trimmed;
}

function filePath(fileName: string): string {
  return join(EXPERIENCE_DIR, normalizeFileName(fileName));
}

async function ensureDir(): Promise<void> {
  await mkdir(EXPERIENCE_DIR, { recursive: true });
}

function parseRecord(fileName: string, raw: string): ExperienceRecord {
  const { meta, body } = parseFrontMatter(raw);
  const keywords = (meta['keywords'] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const sourceConversations = (meta['source_conversations'] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    fileName: normalizeFileName(fileName),
    title: meta['title'] ?? fileName.replace(/\.md$/i, ''),
    summary: meta['summary'] ?? '',
    keywords,
    sourceConversations,
    updatedAt: meta['updated_at'] ?? new Date(0).toISOString(),
    body,
  };
}

export function getExperienceDir(): string {
  return EXPERIENCE_DIR;
}

export async function listExperiences(): Promise<ExperienceRecord[]> {
  await ensureDir();
  const files = await readdir(EXPERIENCE_DIR);
  const experiences: ExperienceRecord[] = [];

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    try {
      const raw = await readFile(filePath(file), 'utf-8');
      experiences.push(parseRecord(file, raw));
    } catch {
      // Skip malformed experience files.
    }
  }

  return experiences.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getExperience(fileName: string): Promise<ExperienceRecord | null> {
  await ensureDir();
  const fullPath = filePath(fileName);
  if (!existsSync(fullPath)) {
    return null;
  }

  const raw = await readFile(fullPath, 'utf-8');
  return parseRecord(fileName, raw);
}

export async function getExperienceContent(fileName: string): Promise<string | null> {
  const record = await getExperience(fileName);
  if (!record) {
    return null;
  }

  return serializeFrontMatter(record);
}

export async function saveExperience(record: ExperienceRecord): Promise<ExperienceRecord> {
  await ensureDir();
  const normalized: ExperienceRecord = {
    ...record,
    fileName: normalizeFileName(record.fileName),
    keywords: [...new Set(record.keywords.map((keyword) => keyword.trim()).filter(Boolean))],
    sourceConversations: [...new Set(record.sourceConversations.map((id) => id.trim()).filter(Boolean))],
    updatedAt: record.updatedAt || new Date().toISOString(),
    body: record.body.trim(),
  };

  await writeFile(filePath(normalized.fileName), serializeFrontMatter(normalized), 'utf-8');
  return normalized;
}
