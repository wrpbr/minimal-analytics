import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';

test('the CommonJS build can be imported on a server without browser globals', () => {
  const require = createRequire(import.meta.url);
  const api = require('../packages/ga4/dist/index.cjs') as { track(id: string): void };
  expect(() => api.track('G-TEST123')).not.toThrow();
});

test('the ESM build exports track without browser globals', async () => {
  // Import the built file rather than the source entry.
  const path = new URL('../packages/ga4/dist/index.js', import.meta.url).href;
  const api = await import(/* @vite-ignore */ path) as { track(id: string): void };
  expect(() => api.track('G-TEST123')).not.toThrow();
});

test('the browser artifact stays within an 8 KiB gzip budget and its types are self-contained', () => {
  expect(gzipSync(readFileSync('packages/ga4/dist/browser.js')).length).toBeLessThanOrEqual(8192);
  expect(readFileSync('packages/ga4/dist/index.d.ts', 'utf8')).not.toContain('@minimal-analytics/shared');
});
