import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export interface ConversationExperienceState {
  lastSummarizedAt?: number;
  lastSummarizedMessageCount?: number;
  lastExperienceFile?: string;
}

const STATE_DIR = join(homedir(), '.asynagents', 'experience-state');
const STATE_PATH = join(STATE_DIR, 'conversation-state.json');

async function ensureDir(): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
}

async function readAll(): Promise<Record<string, ConversationExperienceState>> {
  await ensureDir();
  if (!existsSync(STATE_PATH)) {
    return {};
  }

  try {
    const raw = await readFile(STATE_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, ConversationExperienceState>;
  } catch {
    return {};
  }
}

async function writeAll(state: Record<string, ConversationExperienceState>): Promise<void> {
  await ensureDir();
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

export async function getConversationExperienceState(
  conversationId: string
): Promise<ConversationExperienceState> {
  const state = await readAll();
  return state[conversationId] ?? {};
}

export async function setConversationExperienceState(
  conversationId: string,
  nextState: ConversationExperienceState
): Promise<void> {
  const state = await readAll();
  state[conversationId] = nextState;
  await writeAll(state);
}

export async function deleteConversationExperienceState(conversationId: string): Promise<void> {
  const state = await readAll();
  delete state[conversationId];
  await writeAll(state);
}
