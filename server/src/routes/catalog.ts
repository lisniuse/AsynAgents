import { Router } from 'express';
import { listSkills } from '../skills/SkillLoader.js';
import { listExperiences } from '../experience/ExperienceStorage.js';
import { listCatalogStates, setCatalogItemEnabled } from '../storage/FeatureToggleStorage.js';

const router = Router();

router.get('/skills', async (_req, res) => {
  try {
    const skills = await listSkills();
    res.json(skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      source: skill.source,
      enabled: skill.enabled,
    })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/skills/:name/state', async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    await setCatalogItemEnabled('skills', req.params.name, enabled);
    res.json({ ok: true, name: req.params.name, enabled });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/experiences', async (_req, res) => {
  try {
    const [experiences, state] = await Promise.all([
      listExperiences(),
      listCatalogStates('experiences'),
    ]);
    res.json(experiences.map((experience) => ({
      fileName: experience.fileName,
      title: experience.title,
      summary: experience.summary,
      keywords: experience.keywords,
      enabled: state[experience.fileName] ?? true,
    })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/experiences/:fileName/state', async (req, res) => {
  try {
    const fileName = decodeURIComponent(req.params.fileName);
    const enabled = Boolean(req.body.enabled);
    await setCatalogItemEnabled('experiences', fileName, enabled);
    res.json({ ok: true, fileName, enabled });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
