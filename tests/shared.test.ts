import { afterEach, expect, test, vi } from 'vitest';
import { getClientId, getEventParams, getHashId, getRandomId, getUrlData, getScrollPercentage } from '../packages/shared/src';
import { browser } from './browser';

afterEach(() => vi.unstubAllGlobals());

test('event parameters exclude null values but retain meaningful zero and false values', () => {
  expect(getEventParams({ zero: 0, false: false, null: null, missing: undefined })).toEqual([['zero', '0'], ['false', 'false']]);
  expect(getEventParams([['zero', 0], ['false', false], ['missing', undefined]])).toEqual([['zero', '0'], ['false', 'false']]);
});

test('shared client storage preserves identifiers for its consumers', () => {
  const app = browser();
  vi.stubGlobal('window', app.window);
  const id = getClientId('contract');
  expect(getClientId('contract')).toBe(id);
  expect(app.storage.get('contract')).toBe(id);
});

test('hashes remain deterministic and identifier length contracts remain intact', () => {
  expect(getHashId('same seed')).toBe(getHashId('same seed'));
  for (const length of [8, 12, 16]) expect(getRandomId(length)).toHaveLength(length);
  expect(getRandomId(32)).toHaveLength(16);
  expect(getHashId('seed', 32)).toHaveLength(32);
});

test('relative URLs and hosts with ports are classified correctly', () => {
  const app = browser({ url: 'https://example.test:8443/' });
  vi.stubGlobal('window', app.window);
  expect(getUrlData('/download.pdf')).toEqual({ isExternal: false, hostname: 'example.test', pathname: '/download.pdf' });
  expect(getUrlData('https://example.test:8443/path').isExternal).toBe(false);
  expect(getUrlData('https://other.test/path').isExternal).toBe(true);
});

test('pages without scrollable content do not report a 90 percent scroll', () => {
  const app = browser();
  vi.stubGlobal('window', app.window);
  vi.stubGlobal('document', app.document);
  expect(getScrollPercentage()).toBe(0);
});
