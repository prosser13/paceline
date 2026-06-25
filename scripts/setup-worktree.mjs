// Prepare a fresh git worktree so the dev server / preview can run in it.
//
// A new worktree has neither `node_modules` (gitignored) nor `.env.local`
// (gitignored secrets), and Turbopack 16 refuses a `node_modules` symlink that
// points outside the project root — so the deps must be installed *in* the
// worktree and the env file copied in. This does both, idempotently.
//
// Run once after creating a worktree:  node scripts/setup-worktree.mjs
import { spawnSync, execSync } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const here = process.cwd();

// 1. Dependencies — offline-first (the npm cache is warm from the main checkout,
//    so this is fast and usually needs no network).
if (existsSync(join(here, 'node_modules', 'next'))) {
  console.log('• node_modules present ✓');
} else {
  console.log('• Installing dependencies (offline-first)…');
  const r = spawnSync('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], { stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error('  npm install failed'); process.exit(r.status ?? 1); }
  console.log('  dependencies installed ✓');
}

// 2. .env.local — copy from a sibling worktree (the main checkout) that has one.
if (existsSync(join(here, '.env.local'))) {
  console.log('• .env.local present ✓');
} else {
  const list = execSync('git worktree list --porcelain', { encoding: 'utf8' });
  const paths = [...list.matchAll(/^worktree (.+)$/gm)].map(m => m[1].trim());
  const src = paths.find(p => p !== here && existsSync(join(p, '.env.local')));
  if (src) {
    copyFileSync(join(src, '.env.local'), join(here, '.env.local'));
    console.log(`• .env.local copied from ${src} ✓`);
  } else {
    console.log('• No .env.local found in a sibling worktree — copy it in manually.');
  }
}

console.log('\nWorktree ready — `npm run dev` (or the preview tool) will work now.');
