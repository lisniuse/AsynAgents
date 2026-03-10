import { config } from '../../../config.js';
import { listExperiences, type ExperienceRecord } from './ExperienceStorage.js';

export function buildExperiencePrompt(experiences: ExperienceRecord[]): string {
  if (experiences.length === 0) {
    return '';
  }

  const limit = Math.max(1, config.experience.maxEntriesInPrompt || 50);
  const lines = experiences
    .slice(0, limit)
    .map((experience) => {
      const keywords = experience.keywords.length > 0
        ? ` Keywords: ${experience.keywords.join(', ')}.`
        : '';
      return `- \`${experience.fileName.replace(/\.md$/i, '')}\`: ${experience.title}. ${experience.summary}${keywords}`;
    });

  return (
    '\n\n## Experience System\n\n' +
    'You have access to reusable experience notes distilled from previous conversations. ' +
    'Use them to avoid repeating the same analysis. If an experience appears relevant, call `get_experience` before acting.\n\n' +
    'Available experiences:\n' +
    lines.join('\n')
  );
}

export async function loadExperiences(): Promise<ExperienceRecord[]> {
  return listExperiences();
}
