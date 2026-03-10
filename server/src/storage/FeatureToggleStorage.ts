import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

type CatalogKind = 'skills' | 'experiences';
type ToggleMap = Record<string, boolean>;
type ToggleState = Record<CatalogKind, ToggleMap>;

const STATE_DIR = join(homedir(), '.asynagents');
const STATE_PATH = join(STATE_DIR, 'catalog-state.json');

async function ensureDir(): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
}

async function readState(): Promise<ToggleState> {
  await ensureDir();
  if (!existsSync(STATE_PATH)) {
    return { skills: {}, experiences: {} };
  }

  try {
    const raw = await readFile(STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ToggleState>;
    return {
      skills: parsed.skills ?? {},
      experiences: parsed.experiences ?? {},
    };
  } catch {
    return { skills: {}, experiences: {} };
  }
}

async function writeState(state: ToggleState): Promise<void> {
  await ensureDir();
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

export async function isCatalogItemEnabled(kind: CatalogKind, id: string): Promise<boolean> {
  const state = await readState();
  return state[kind][id] ?? true;
}

export async function listCatalogStates(kind: CatalogKind): Promise<ToggleMap> {
  const state = await readState();
  return state[kind];
}

export async function setCatalogItemEnabled(
  kind: CatalogKind,
  id: string,
  enabled: boolean
): Promise<void> {
  const state = await readState();
  state[kind][id] = enabled;
  await writeState(state);
}
