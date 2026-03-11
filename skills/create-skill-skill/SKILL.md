---
name: create-skill
description: Create, convert, or install reusable skills in the user skill directory (`~/.asynagents/skills`). Use when the user asks to create a new skill, turn a workflow into a skill, convert a GitHub repository into a skill, check whether a cloned repo is already a valid skill, or wants an AI-managed skill setup with discussion and confirmation during ambiguous conversion steps.
---

# Create Skill

Create or convert skills in the user-layer skill directory so they remain available across future conversations.

## Target Location

- Always create or clone user skills under `~/.asynagents/skills/`
- Each skill must live in its own folder
- Each skill must have a root-level `SKILL.md`

## Primary Workflows

### 1. Create a new skill from a user requirement

1. Clarify the skill purpose, trigger phrases, and expected outputs if they are still ambiguous
2. Propose a short skill folder name using lowercase letters, digits, and hyphens
3. Create `~/.asynagents/skills/<skill-folder>/`
4. Write `SKILL.md` with:
   - YAML frontmatter containing only `name` and `description`
   - concise markdown instructions for another agent to use
5. Add `scripts/`, `references/`, or `assets/` only when the skill genuinely needs them
6. Tell the user where the skill was created and what it does

### 2. Convert a GitHub repository into a skill

1. Clone the repository directly into `~/.asynagents/skills/`
2. Inspect the repo root for `SKILL.md`
3. If `SKILL.md` exists, verify it has frontmatter with both:
   - `name`
   - `description`
4. If it is already a valid skill repo:
   - tell the user it is already usable
   - summarize the skill briefly
   - do not rewrite it unless the user asks
5. If it is not yet a valid skill repo:
   - explain what is missing
   - discuss the conversion approach with the user when assumptions matter
   - preserve the repository contents
   - add or update a root `SKILL.md` so the repo becomes a usable skill

### 3. Convert an existing local folder into a skill

1. Inspect the folder contents first
2. Infer the repo or project purpose from README, scripts, source files, and examples
3. Confirm any unclear or high-impact assumptions with the user
4. Create or update a root `SKILL.md`
5. Keep existing files intact unless the user explicitly wants cleanup

## Validation Rules

A repository counts as an immediately usable skill only when all of the following are true:

- it is inside `~/.asynagents/skills/`
- it has a root-level `SKILL.md`
- `SKILL.md` starts with YAML frontmatter
- the frontmatter includes `name`
- the frontmatter includes `description`

If any of those are missing, treat it as a conversion task instead of a ready-to-use skill.

## SKILL.md Requirements

Write `SKILL.md` in this structure:

```md
---
name: skill-name
description: Explain what the skill does and when to use it.
---

# Skill Title

Short operating instructions for another agent.
```

Rules:

- Keep frontmatter minimal: only `name` and `description`
- Keep instructions concise and procedural
- Put trigger guidance in `description`, not in a separate "when to use" section
- Prefer reusable instructions over user-specific one-off notes
- Do not create extra documentation files unless the user explicitly wants them

## Discussion And Confirmation

Discuss with the user before proceeding when:

- the repository purpose is unclear
- the skill name or trigger scope is ambiguous
- converting the repo would require overwriting an existing `SKILL.md`
- multiple plausible skill designs exist
- the user might want the repo left untouched

When the path is obvious and low risk, proceed directly and then report the result.

## Repository Inspection Checklist

When a user provides a GitHub URL or local project:

1. Read the repo root file list
2. Read `README.md` if present
3. Read any existing `SKILL.md`
4. Inspect scripts or entrypoints that reveal the real workflow
5. Decide whether the repo is:
   - already a skill
   - a good candidate for conversion
   - too ambiguous to convert without confirmation

## Output To The User

After creating or converting a skill, always report:

- skill name
- folder path
- whether it was newly created, cloned-and-ready, or converted
- any assumptions made
- any next step the user should know about
