
// npx ts-node -r tsconfig-paths/register src/database/seeds/runner.ts
// or (after build): node dist/database/seeds/runner.js

// src/database/seeds/runner.ts  (robust discovery)
import 'reflect-metadata';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

// Resolve data-source from project root (robust)
const dsPath = join(process.cwd(), 'data-source');
const dsModule = require(dsPath);
const AppDataSource: import('typeorm').DataSource = dsModule.AppDataSource || dsModule;

type SeedModule = {
  default: any;
  up?: (manager: import('typeorm').EntityManager) => Promise<void>;
  down?: (manager: import('typeorm').EntityManager) => Promise<void>;
};

function listCandidateDirs(): string[] {
  const cwd = process.cwd();
  // candidate directories in order of preference
  return [
    __dirname, // where this runner lives (compiled: dist/... OR src/...)
    join(cwd, 'dist', 'database', 'seeds'),
    join(cwd, 'dist', 'src', 'database', 'seeds'),
    join(cwd, 'dist', 'src', 'seeds'),
    join(cwd, 'src', 'database', 'seeds'),
    join(cwd, 'database', 'seeds'),
  ];
}

function discoverSeedFiles(): string[] {
  const seen: string[] = [];
  const candidates = listCandidateDirs();
  console.log('Seed discovery candidates (in order):');
  candidates.forEach((c) => console.log(' -', c));
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir).filter((f) => /^\d+.*\.(ts|js)$/.test(f) && f !== 'runner.ts').sort();
      if (files.length) {
        console.log(`Found ${files.length} seed files in: ${dir}`);
        return files.map((f) => join(dir, f));
      } else {
        console.log(`No matching seed files in: ${dir}`);
      }
    } catch (err) {
      console.warn(`Could not read ${dir}:`, err && (err.message || err));
    }
  }
  return seen;
}

async function run() {
  console.log('Initializing DataSource...');
  await AppDataSource.initialize();
  console.log('DataSource initialized.');

  const seedPaths = discoverSeedFiles();
  if (seedPaths.length === 0) {
    console.warn('No seed files discovered. See candidate dirs above.');
    await AppDataSource.destroy();
    return;
  }

  for (const filepath of seedPaths) {
    console.log('---');
    console.log('Processing seed file:', filepath);
    try {
      const mod: SeedModule = require(filepath);
      const up = mod.up || (mod.default && mod.default.up);
      if (!up) {
        console.warn(`Skipping ${filepath} — no up exported.`);
        continue;
      }
      console.log(`Running seed.up for: ${filepath}`);
      await AppDataSource.transaction(async (manager) => {
        await up(manager);
      });
      console.log(`Seed succeeded: ${filepath}`);
    } catch (err: any) {
      console.error(`Seed error for file ${filepath}:`, err && (err.stack || err.message || err));
      // continue to next seed so you can see all issues
    }
  }

  await AppDataSource.destroy();
  console.log('All seeds processed (robust runner done).');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Runner fatal error', err && (err.stack || err));
    process.exit(1);
  });
}

