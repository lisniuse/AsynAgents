import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveSystemSkillsDir } from '../utils/runtimePaths.js';

export interface Skill {
  name: string;
  description: string;
  content: string;
  /** Directory the skill was loaded from (for resolving relative paths in content) */
  dir: string;
  enabled: boolean;
  source: 'system' | 'user';
}

/** Parse YAML front matter from a SKILL.md string. Returns { meta, body }. */
function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta, body: raw };

  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    meta[key] = value;
  }

  return { meta, body: match[2] };
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildSkillAliases(skill: Skill): Set<string> {
  const aliases = new Set<string>();
  const dirName = path.basename(skill.dir);
  const push = (value?: string) => {
    if (!value) return;
    aliases.add(normalizeLookupKey(value));
  };

  push(skill.name);
  push(dirName);

  if (!skill.name.endsWith('-skill')) {
    push(`${skill.name}-skill`);
  }

  if (dirName.endsWith('-skill')) {
    push(dirName.slice(0, -6));
  }

  return aliases;
}

export function matchSkill(skills: Skill[], requestedName: string): Skill | null {
  const lookup = normalizeLookupKey(requestedName);
  for (const skill of skills) {
    if (buildSkillAliases(skill).has(lookup)) {
      return skill;
    }
  }
  return null;
}

export function renderSkillContent(skill: Skill): string {
  const renderedBody = skill.content.replaceAll('{{SKILL_DIR}}', skill.dir);
  return (
    `## Skill Context\n` +
    `- Skill name: ${skill.name}\n` +
    `- Skill directory: ${skill.dir}\n` +
    `- Resolve any relative paths from this directory.\n\n` +
    renderedBody
  );
}

/** Load all skills from a directory (each subdirectory = one skill). */
function loadSkillsFromDir(dir: string, source: 'system' | 'user'): Skill[] {
  if (!fs.existsSync(dir)) return [];

  const skills: Skill[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(dir, entry.name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) continue;

    try {
      const raw = fs.readFileSync(skillMdPath, 'utf8');
      const { meta, body } = parseFrontMatter(raw);

      if (!meta['name']) continue;

      skills.push({
        name: meta['name'],
        description: meta['description'] ?? '',
        content: body.trim(),
        dir: skillDir,
        enabled: true,
        source,
      });
    } catch {
      // Skip malformed skill files
    }
  }

  return skills;
}

/** System skills directory. In packaged builds, this resolves next to the executable. */
const SYSTEM_SKILLS_DIR = resolveSystemSkillsDir();

/** User skills directory. */
const USER_SKILLS_DIR = path.join(os.homedir(), '.asynagents', 'skills');

async function mergeSkills(): Promise<Skill[]> {
  const { listCatalogStates } = await import('../storage/FeatureToggleStorage.js');
  const systemSkills = loadSkillsFromDir(SYSTEM_SKILLS_DIR, 'system');
  const userSkills = loadSkillsFromDir(USER_SKILLS_DIR, 'user');
  const toggleState = await listCatalogStates('skills');

  // Merge: user skills override system skills by name
  const map = new Map<string, Skill>();
  for (const skill of systemSkills) map.set(skill.name, skill);
  for (const skill of userSkills) map.set(skill.name, skill);

  return [...map.values()].map((skill) => ({
    ...skill,
    enabled: toggleState[skill.name] ?? true,
  }));
}

/** Load enabled skills (system + user). User skills override system skills with same name. */
export async function loadSkills(): Promise<Skill[]> {
  const skills = await mergeSkills();
  return skills.filter((skill) => skill.enabled);
}

/** List all skills for management UIs. */
export async function listSkills(): Promise<Skill[]> {
  return mergeSkills();
}

/** Get full content of a skill by name. Returns null if not found. */
export async function getSkillContent(name: string): Promise<string | null> {
  const skills = await loadSkills();
  const skill = matchSkill(skills, name);
  return skill ? renderSkillContent(skill) : null;
}

/**
 * Build the skills section for the system prompt.
 * Only includes name + description — full content is fetched on demand via get_skill tool.
 */
export function buildSkillsPrompt(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const lines = skills.map((s) => `- **${s.name}**: ${s.description}`);

  return (
    `\n\n## Available Skills\n\n` +
    `You have access to the following skills. ` +
    `When you need to use one, call the \`get_skill\` tool first to get detailed usage instructions.\n\n` +
    lines.join('\n')
  );
}
