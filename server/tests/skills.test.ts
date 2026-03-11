import { describe, expect, it } from 'vitest';
import type { Skill } from '../src/skills/SkillLoader.js';
import { matchSkill, renderSkillContent } from '../src/skills/SkillLoader.js';

describe('matchSkill', () => {
  const skills: Skill[] = [
    {
      name: 'anytime-search',
      description: 'Search the web',
      content: 'Run from {{SKILL_DIR}}',
      dir: 'D:\\release\\skills\\anytime-search-skill',
      enabled: true,
      source: 'system',
    },
    {
      name: 'create-skill',
      description: 'Create skills',
      content: 'Create skills',
      dir: 'D:\\release\\skills\\create-skill-skill',
      enabled: true,
      source: 'system',
    },
  ];

  it('matches by canonical skill name', () => {
    expect(matchSkill(skills, 'anytime-search')?.name).toBe('anytime-search');
  });

  it('matches by folder name alias', () => {
    expect(matchSkill(skills, 'anytime-search-skill')?.name).toBe('anytime-search');
  });

  it('matches case-insensitively', () => {
    expect(matchSkill(skills, 'CREATE-SKILL-SKILL')?.name).toBe('create-skill');
  });
});

describe('renderSkillContent', () => {
  it('injects skill context and resolves skill dir placeholders', () => {
    const rendered = renderSkillContent({
      name: 'anytime-search',
      description: 'Search the web',
      content: 'Use {{SKILL_DIR}}/search.py',
      dir: 'D:\\release\\skills\\anytime-search-skill',
      enabled: true,
      source: 'system',
    });

    expect(rendered).toContain('Skill directory: D:\\release\\skills\\anytime-search-skill');
    expect(rendered).toContain('Use D:\\release\\skills\\anytime-search-skill/search.py');
    expect(rendered).not.toContain('{{SKILL_DIR}}');
  });
});
