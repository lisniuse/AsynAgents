import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import type { StoredConversation } from '../types/index.js';

const STORAGE_DIR = join(homedir(), '.asynagents', 'conversations');

async function ensureDir(): Promise<void> {
  await mkdir(STORAGE_DIR, { recursive: true });
}

function filePath(id: string): string {
  return join(STORAGE_DIR, `${id}.json`);
}

export async function listConversations(): Promise<StoredConversation[]> {
  await ensureDir();
  const files = await readdir(STORAGE_DIR);
  const conversations: StoredConversation[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = await readFile(join(STORAGE_DIR, file), 'utf-8');
      conversations.push(JSON.parse(content));
    } catch {
      // skip corrupted files
    }
  }
  return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id: string): Promise<StoredConversation | null> {
  await ensureDir();
  const path = filePath(id);
  if (!existsSync(path)) return null;
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

export async function saveConversation(conversation: StoredConversation): Promise<void> {
  await ensureDir();
  await writeFile(filePath(conversation.id), JSON.stringify(conversation, null, 2), 'utf-8');
}

export async function deleteConversation(id: string): Promise<boolean> {
  const path = filePath(id);
  if (!existsSync(path)) return false;
  await unlink(path);
  return true;
}
