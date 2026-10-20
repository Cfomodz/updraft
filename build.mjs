import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('static', 'dist', { recursive: true });

const common = { bundle: true, target: 'chrome116', sourcemap: true, minify: !watch, logLevel: 'info', outdir: 'dist' };
const configs = [
  // The content script is a classic script, so it must not be ESM.
  { ...common, entryPoints: { content: 'src/content/index.ts' }, format: 'iife' },
  { ...common, entryPoints: { background: 'src/background/index.ts', sidepanel: 'src/sidepanel/index.ts', options: 'src/options/index.ts' }, format: 'esm' },
];

if (watch) {
  for (const c of configs) await (await context(c)).watch();
} else {
  await Promise.all(configs.map((c) => build(c)));
}
