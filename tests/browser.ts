import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, vi } from 'vitest';
import type { TrackOptions } from '../packages/ga4/src/index';

type Options = NonNullable<Window['minimalAnalytics']>;
type BrowserWindow = Window & typeof globalThis & {
  minimalAnalyticsGA4: { track(id: string, options?: TrackOptions): void };
};
const source = readFileSync('packages/ga4/dist/browser.js', 'utf8');
type BrowserDom = { window: BrowserWindow };
// The test bridge uses the public constructor and standard DOM types.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: Record<string, string | boolean>) => BrowserDom;
};
const opened: BrowserDom[] = [];
afterEach(() => {
  for (const dom of opened.splice(0)) dom.window.close();
});

export function browser(options: {
  config?: Options;
  storage?: Map<string, string>;
  blockedStorage?: boolean;
  failedWrites?: boolean;
  blockedCookies?: boolean;
  cookie?: string;
  url?: string;
  now?: number;
  beacon?: 'absent' | 'false' | 'throws';
  noFetch?: boolean;
  fetchRejects?: boolean;
  amd?: boolean;
} = {}) {
  const dom = new JSDOM('', {
    url: options.url ?? 'https://example.test/',
    referrer: 'https://referrer.test/?pin=referrer-secret&utm_source=referral',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  opened.push(dom);
  const window = dom.window as unknown as BrowserWindow;
  let now = options.now ?? 1791558000000;
  window.Date.now = () => now;
  window.minimalAnalytics = { analyticsStorage: 'granted', ...options.config };
  if (options.cookie) window.document.cookie = options.cookie;
  const storage = options.storage ?? new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    get() {
      if (options.blockedStorage) throw new window.DOMException('Storage denied', 'SecurityError');
      return {
        get length() { return storage.size; },
        key(index: number) { return [...storage.keys()][index] ?? null; },
        getItem(key: string) { return storage.get(key) ?? null; },
        setItem(key: string, value: string) {
          if (options.failedWrites) throw new window.DOMException('Storage full', 'QuotaExceededError');
          storage.set(key, String(value));
        },
        removeItem(key: string) { storage.delete(key); },
        clear() { storage.clear(); },
      } satisfies Storage;
    },
  });
  if (options.blockedCookies) Object.defineProperty(window.document, 'cookie', {
    get() { throw new window.DOMException('Cookies denied', 'SecurityError'); },
  });
  const requests: string[] = [];
  const fetch = vi.fn((input: RequestInfo | URL) => {
    requests.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return options.fetchRejects ? Promise.reject(new Error('Offline')) : Promise.resolve({} as Response);
  });
  window.fetch = options.noFetch ? undefined as unknown as typeof window.fetch : fetch;
  Object.defineProperty(window.navigator, 'sendBeacon', { configurable: true, value: options.beacon === 'absent' ? undefined : (url: string) => {
    if (options.beacon === 'throws') throw new Error('Blocked beacon');
    if (options.beacon === 'false') return false;
    requests.push(url);
    return true;
  } });
  if (options.amd) window.eval('window.define = function() { throw new Error("AMD invoked"); }; window.define.amd = {};');
  // A real script element has different global-var semantics from strict eval.
  const script = window.document.createElement('script');
  script.textContent = source;
  window.document.head.appendChild(script);
  if (!window.minimalAnalyticsGA4?.track) throw new Error('Browser artifact did not expose track');
  const track = (props?: TrackOptions, id = 'G-TEST123') => window.minimalAnalyticsGA4.track(id, props);
  const params = (index = requests.length - 1) => new URL(requests[index]).searchParams;
  return {
    window, document: window.document, requests, storage, fetch, track, params,
    advance(ms: number) { now += ms; },
    visibility(value: 'visible' | 'hidden') {
      Object.defineProperty(window.document, 'visibilityState', { configurable: true, value });
      window.document.dispatchEvent(new window.Event('visibilitychange'));
    },
  };
}
