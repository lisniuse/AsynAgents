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

/** Load all skills from a directory (each subdirectory = one skill). */
function loadSkillsFromDir(dir: string): Skill[] {
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

/** Cached skill map (loaded once at startup). */
let skillCache: Map<string, Skill> | null = null;

/** Load all skills (system + user). User skills override system skills with same name. */
export function loadSkills(): Skill[] {
  const systemSkills = loadSkillsFromDir(SYSTEM_SKILLS_DIR);
  const userSkills = loadSkillsFromDir(USER_SKILLS_DIR);

  // Merge: user skills override system skills by name
  const map = new Map<string, Skill>();
  for (const skill of systemSkills) map.set(skill.name, skill);
  for (const skill of userSkills) map.set(skill.name, skill);

  skillCache = map;
  return [...map.values()];
}

/** Get full content of a skill by name. Returns null if not found. */
export function getSkillContent(name: string): string | null {
  if (!skillCache) loadSkills();
  const skill = skillCache!.get(name);
  return skill ? skill.content : null;
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
