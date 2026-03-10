import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const repoRootFromEnv = process.env.ASYN_AGENTS_REPO_ROOT;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = repoRootFromEnv || resolve(__dirname, '../../..');

function isPackagedRuntime(): boolean {
  return typeof (process as NodeJS.Process & { pkg?: unknown }).pkg !== 'undefined';
}

function getRuntimeBaseDir(): string {
  return isPackagedRuntime() ? dirname(process.execPath) : REPO_ROOT;
}

export function resolveStaticDir(): string {
  const runtimePublic = join(getRuntimeBaseDir(), 'public');
  if (isPackagedRuntime() && existsSync(runtimePublic)) {
    return runtimePublic;
  }

  const appDist = join(REPO_ROOT, 'app', 'dist');
  if (existsSync(appDist)) {
    return appDist;
  }

  const generatedServerPublic = join(REPO_ROOT, 'server', 'public');
  if (existsSync(generatedServerPublic)) {
    return generatedServerPublic;
  }

  return runtimePublic;
}

export function resolveSystemSkillsDir(): string {
  const runtimeSkills = join(getRuntimeBaseDir(), 'skills');
  if (existsSync(runtimeSkills)) {
    return runtimeSkills;
  }

  return join(REPO_ROOT, 'skills');
}
