import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const out = 'packages/ga4/dist';
await mkdir(out, { recursive: true });
for (const [format, file] of [['esm', 'index.js'], ['cjs', 'index.cjs'], ['iife', 'browser.js']] as const) {
  await build({
    entryPoints: ['packages/ga4/src/index.ts'],
    outfile: `${out}/${file}`,
    bundle: true,
    minify: true,
    format,
    globalName: format === 'iife' ? 'minimalAnalyticsGA4' : undefined,
    target: 'es2018',
    alias: { '@minimal-analytics/shared': './packages/shared/src/index.ts' },
    legalComments: 'none',
    banner: { js: '/*! MIT: James Hill (2022). Fork: wrpbr/minimal-analytics. See LICENSE. */' },
  });
}
execFileSync('node_modules/.bin/tsc', ['--project', 'tsconfig.declarations.json'], { stdio: 'inherit' });
await copyFile('build/types/ga4/src/index.d.ts', `${out}/index.d.ts`);
await copyFile('LICENSE', 'packages/ga4/LICENSE');
await copyFile('LICENSE', `${out}/LICENSE`);
const browser = await readFile(`${out}/browser.js`);
const sizes = { raw: browser.length, gzip: gzipSync(browser).length, brotli: brotliCompressSync(browser).length };
if (sizes.gzip > 8192) throw new Error(`Browser gzip size ${sizes.gzip} exceeds 8192 bytes`);
await writeFile(`${out}/size.json`, `${JSON.stringify(sizes, null, 2)}\n`);
const hashes = [];
for (const file of ['browser.js', 'index.js', 'index.cjs', 'index.d.ts', 'LICENSE', 'size.json']) {
  hashes.push(`${createHash('sha256').update(await readFile(`${out}/${file}`)).digest('hex')}  ${file}`);
}
await writeFile(`${out}/SHA256SUMS`, `${hashes.join('\n')}\n`);
console.log(`GA4 browser: ${sizes.raw} bytes, gzip ${sizes.gzip}, Brotli ${sizes.brotli} (gzip limit 8192).`);
