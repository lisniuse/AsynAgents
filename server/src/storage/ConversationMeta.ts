import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const META_PATH = join(homedir(), '.asynagents', 'conversation-meta.json');

export interface ConversationMetaEntry {
  pinned?: boolean;
  bold?: boolean;
}

type MetaMap = Record<string, ConversationMetaEntry>;

async function read(): Promise<MetaMap> {
  if (!existsSync(META_PATH)) return {};
  try {
    return JSON.parse(await readFile(META_PATH, 'utf-8')) as MetaMap;
  } catch {
    return {};
  }
}

async function write(map: MetaMap): Promise<void> {
  await mkdir(join(homedir(), '.asynagents'), { recursive: true });
  await writeFile(META_PATH, JSON.stringify(map, null, 2), 'utf-8');
}

export async function getAllMeta(): Promise<MetaMap> {
  return read();
}

export async function updateMeta(id: string, patch: ConversationMetaEntry): Promise<ConversationMetaEntry> {
  const map = await read();
  map[id] = { ...map[id], ...patch };
  await write(map);
  return map[id];
}

export async function deleteMeta(id: string): Promise<void> {
  const map = await read();
  delete map[id];
  await write(map);
}
