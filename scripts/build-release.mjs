import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');
const SERVER_DIR = path.join(ROOT, 'server');
const BUILD_DIR = path.join(ROOT, '.build');
const RELEASE_DIR = path.join(ROOT, 'release');
const TARGET_MAP = {
  'win-x64': { pkg: 'node18-win-x64', exe: 'asynagents-server.exe' },
  'linux-x64': { pkg: 'node18-linux-x64', exe: 'asynagents-server' },
  'macos-x64': { pkg: 'node18-macos-x64', exe: 'asynagents-server' },
};

function getDefaultTarget() {
  if (process.platform === 'win32') return 'win-x64';
  if (process.platform === 'darwin') return 'macos-x64';
  return 'linux-x64';
}

function parseTargets(argv) {
  const targetIndex = argv.indexOf('--target');
  if (targetIndex !== -1 && argv[targetIndex + 1]) {
    const value = argv[targetIndex + 1];
    if (value === 'all') {
      return Object.keys(TARGET_MAP);
    }
    return [value];
  }
  return [getDefaultTarget()];
}

function run(command, args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

async function ensureEmptyDir(dir) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

async function copyDirContents(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir);
  for (const entry of entries) {
    await cp(path.join(sourceDir, entry), path.join(targetDir, entry), { recursive: true });
  }
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function buildFrontend() {
  await run('npm', ['run', 'build'], APP_DIR);
}

async function bundleServer() {
  await mkdir(BUILD_DIR, { recursive: true });
  await build({
    entryPoints: [path.join(SERVER_DIR, 'src', 'server.ts')],
    outfile: path.join(BUILD_DIR, 'server.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    sourcemap: false,
    minify: false,
    external: [],
    define: {
      'process.env.ASYN_AGENTS_REPO_ROOT': JSON.stringify(ROOT),
      'import.meta.url': JSON.stringify(pathToFileURL(path.join(SERVER_DIR, 'src', 'server.ts')).href),
    },
  });
}

async function stageReleaseAssets(target) {
  const targetDir = path.join(RELEASE_DIR, target);
  await ensureEmptyDir(targetDir);

  const publicDir = path.join(targetDir, 'public');
  const skillsDir = path.join(targetDir, 'skills');

  await copyDirContents(path.join(APP_DIR, 'dist'), publicDir);

  if (await pathExists(path.join(ROOT, 'skills'))) {
    await copyDirContents(path.join(ROOT, 'skills'), skillsDir);
  }

  return targetDir;
}

async function packageServer(target, targetDir) {
  const metadata = TARGET_MAP[target];
  if (!metadata) {
    throw new Error(`Unsupported target: ${target}`);
  }

  const outputPath = path.join(targetDir, metadata.exe);
  await run('npx', [
    'pkg',
    path.join(BUILD_DIR, 'server.cjs'),
    '--target',
    metadata.pkg,
    '--output',
    outputPath,
  ]);
}

async function main() {
  const targets = parseTargets(process.argv.slice(2));

  for (const target of targets) {
    if (!TARGET_MAP[target]) {
      throw new Error(`Unknown target "${target}". Supported targets: ${Object.keys(TARGET_MAP).join(', ')}`);
    }
  }

  await ensureEmptyDir(BUILD_DIR);
  await mkdir(RELEASE_DIR, { recursive: true });

  console.log('Building frontend...');
  await buildFrontend();

  console.log('Bundling server...');
  await bundleServer();

  for (const target of targets) {
    console.log(`Packaging release for ${target}...`);
    const targetDir = await stageReleaseAssets(target);
    await packageServer(target, targetDir);
    console.log(`Release ready: ${targetDir}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
