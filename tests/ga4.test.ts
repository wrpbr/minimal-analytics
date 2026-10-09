import { expect, test } from 'vitest';
import { browser } from './browser';

test('reloads and tabs share the client and session without incrementing the session count', () => {
  const first = browser();
  first.track();
  const initial = first.params();
  expect(initial.get('en')).toBe('page_view');
  expect(initial.get('v')).toBe('2');
  expect(initial.get('sid')).toBe('1791558000');
  expect(initial.get('sct')).toBe('1');
  expect(initial.get('_ss')).toBe('1');
  expect(initial.get('_fv')).toBe('1');
  expect(initial.get('seg')).toBe('0');
  for (const second of [browser({ storage: first.storage }), browser({ storage: first.storage })]) {
    second.track();
    expect(second.params().get('sid')).toBe(initial.get('sid'));
    expect(second.params().get('cid')).toBe(initial.get('cid'));
    expect(second.params().get('sct')).toBe('1');
    expect(second.params().has('_ss')).toBe(false);
    expect(second.params().has('_fv')).toBe(false);
    expect(second.params().get('seg')).toBe('1');
  }
});

test('only inactivity starts a new session and resets its engagement', () => {
  const app = browser();
  app.track();
  app.advance(29 * 60000);
  app.track({ type: 'action' });
  expect(app.params().get('sid')).toBe('1791558000');
  app.advance(30 * 60000);
  app.track({ type: 'action' });
  expect(app.params().get('sid')).toBe('1791561540');
  expect(app.params().get('sct')).toBe('2');
  expect(app.params().get('_ss')).toBe('1');
  expect(app.params().get('seg')).toBe('0');
  expect(app.params().get('_et')).toBe('0');
  app.track({ type: 'action' });
  expect(app.params().has('_ss')).toBe(false);
});

test('a configured timeout and separate measurement IDs use separate session state', () => {
  const app = browser({ config: { sessionTimeout: 60 } });
  app.track();
  app.advance(60000);
  app.track({ type: 'action' });
  expect(app.params().get('sct')).toBe('2');
  app.track(undefined, 'G-OTHER123');
  expect(app.params().get('sct')).toBe('1');
  expect(app.params().get('cid')).toBe(app.params(0).get('cid'));
});

test('an existing GA cookie keeps the client identity without a false first visit', () => {
  const app = browser({ cookie: '_ga=GA1.1.1234567890.1700000000' });
  app.track();
  expect(app.params().get('cid')).toBe('1234567890.1700000000');
  expect(app.params().has('_fv')).toBe(false);
});

test('invalid session storage does not break tracking', () => {
  const app = browser({ storage: new Map([['minimalAnalytics:session:G-TEST123', '{"count":"broken"}']]) });
  expect(() => app.track()).not.toThrow();
  expect(app.params().get('sct')).toBe('1');
});

test('blocked storage and cookies use stable page-local state', () => {
  const app = browser({ blockedStorage: true, blockedCookies: true });
  expect(() => app.track()).not.toThrow();
  const first = app.params();
  app.track({ type: 'action' });
  expect(app.params().get('cid')).toBe(first.get('cid'));
  expect(app.params().get('sid')).toBe(first.get('sid'));
  expect(app.params().has('_fv')).toBe(false);
});

test('failed writes keep the latest session state instead of rereading stale storage', () => {
  const first = browser();
  first.track();
  const next = browser({ storage: first.storage, failedWrites: true, now: 1791559860000 });
  next.track();
  expect(next.params().get('sct')).toBe('2');
  next.track({ type: 'action' });
  expect(next.params().get('sct')).toBe('2');
  expect(next.params().has('_ss')).toBe(false);
});

test.each(['absent', 'false', 'throws'] as const)('a %s beacon falls back to fetch with keepalive', beacon => {
  const app = browser({ beacon });
  expect(() => app.track()).not.toThrow();
  expect(app.requests).toHaveLength(1);
  expect(app.fetch).toHaveBeenCalledWith(expect.stringContaining('/g/collect?'), {
    method: 'POST', keepalive: true, mode: 'no-cors', credentials: 'omit',
  });
});

test('unavailable transports and rejected requests do not interrupt the application', async () => {
  const none = browser({ beacon: 'absent', noFetch: true });
  expect(() => none.track()).not.toThrow();
  const offline = browser({ beacon: 'throws', fetchRejects: true });
  expect(() => offline.track()).not.toThrow();
  await Promise.resolve();
});

test('URLs remove private query fields, fragments and credentials, including dl overrides', () => {
  const app = browser({ url: 'https://example.test/login?pin=private-pin&auth_token=private-token&phone=private-phone&utm_source=mail#private-fragment' });
  app.track();
  expect(app.params().get('dl')).toBe('https://example.test/login?utm_source=mail');
  expect(app.params().get('dr')).toBe('https://referrer.test/?utm_source=referral');
  app.track({ type: 'action', event: {
    dl: 'https://username:password@example.test/override?pin=private-pin&utm_medium=email#private-fragment',
    'ep.email': 'private-email', auth_token: 'private-token', 'ep.pin': 'private-pin', cid: 'forged-client',
  } });
  expect(app.params().getAll('dl')).toEqual(['https://example.test/override?utm_medium=email']);
  expect(decodeURIComponent(app.requests.join('\n'))).not.toMatch(/private-|username|password|forged-client/);
  expect(app.params().has('dt')).toBe(false);
});

test('custom parameters preserve numbers, zero and false without replacing protocol fields', () => {
  const app = browser();
  app.track({ type: 'custom_event', event: [
    ['event_category', 'conversion'], ['value', 0], ['success', false], ['missing', undefined],
    ['cid', 'forged'], ['en', 'forged'], ['_s', 50], ['_et', 999999],
  ], keyEvent: true });
  expect(app.params().get('en')).toBe('custom_event');
  expect(app.params().get('ep.event_category')).toBe('conversion');
  expect(app.params().get('epn.value')).toBe('0');
  expect(app.params().get('ep.success')).toBe('false');
  expect(app.params().has('ep.missing')).toBe(false);
  expect(app.params().get('_s')).toBe('1');
  expect(app.params().get('_et')).toBe('0');
  expect(app.params().get('_c')).toBe('1');
  expect(app.params().get('seg')).toBe('1');
});

test('page identity stays stable and hit count increases within a page', () => {
  const app = browser();
  app.track();
  const page = app.params().get('_p');
  app.track({ type: 'action' });
  expect(app.params().get('_p')).toBe(page);
  expect(app.params().get('_s')).toBe('2');
  app.track({ type: 'action' });
  expect(app.params().get('_s')).toBe('3');
});

test('pushState, replaceState and popstate track real route changes once', () => {
  const app = browser();
  app.track();
  app.window.history.pushState({}, '', '/next?pin=private-pin');
  expect(app.requests).toHaveLength(2);
  expect(app.params().get('dl')).toBe('https://example.test/next');
  expect(app.params().get('dr')).toBe('https://example.test/');
  app.window.history.replaceState({}, '', '/next?pin=other-secret');
  expect(app.requests).toHaveLength(2);
  app.window.history.replaceState({}, '', '/third');
  expect(app.requests).toHaveLength(3);
  app.window.history.replaceState({}, '', '/fourth');
  app.window.dispatchEvent(new app.window.PopStateEvent('popstate'));
  expect(app.requests).toHaveLength(4);
});

test('forms track first interaction and submit attempts without input values', () => {
  const app = browser();
  app.track();
  app.document.body.innerHTML = '<form id="login"><input value="private-input" name="phone"></form>';
  const input = app.document.querySelector('input')!;
  input.dispatchEvent(new app.window.Event('focusin', { bubbles: true }));
  input.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  app.document.querySelector('form')!.dispatchEvent(new app.window.Event('submit', { bubbles: true }));
  expect(app.requests.map((_, index) => app.params(index).get('en'))).toEqual(['page_view', 'form_start', 'form_submit']);
  expect(app.params().get('ep.form_id')).toBe('login');
  expect(app.requests.join('\n')).not.toContain('private-input');
});

test('ignored regions and disabled automatic tracking do not collect forms or navigation', () => {
  const app = browser({ config: { trackForms: false, trackNavigation: false } });
  app.track();
  app.document.body.innerHTML = '<form><input></form>';
  app.document.querySelector('input')!.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  app.window.history.pushState({}, '', '/next');
  expect(app.requests).toHaveLength(1);
  const ignored = browser();
  ignored.track();
  ignored.document.body.innerHTML = '<div data-analytics-ignore><form><input></form><a href="https://external.test/">Link</a></div>';
  ignored.document.querySelector('input')!.dispatchEvent(new ignored.window.Event('input', { bubbles: true }));
  ignored.document.querySelector('a')!.dispatchEvent(new ignored.window.Event('click', { bubbles: true }));
  expect(ignored.requests).toHaveLength(1);
});

test('consent defaults to denied and follows gtag updates without writing identifiers', () => {
  const app = browser();
  delete app.window.minimalAnalytics;
  app.track();
  expect(app.requests).toHaveLength(0);
  expect(app.storage.size).toBe(0);
  app.window.dataLayer = [['consent', 'default', { analytics_storage: 'denied' }]];
  app.track();
  expect(app.requests).toHaveLength(0);
  app.window.dataLayer.push(['consent', 'update', { analytics_storage: 'granted' }]);
  app.track();
  expect(app.requests).toHaveLength(1);
  expect(app.params().get('gcs')).toBe('G101');
  expect(app.params().get('npa')).toBe('1');
  app.window.dataLayer.push(['consent', 'update', { analytics_storage: 'denied' }]);
  app.track({ type: 'action' });
  expect(app.requests).toHaveLength(1);
});

test('visibility and pagehide flush only unsent visible engagement', () => {
  const app = browser();
  app.track();
  app.advance(12000);
  app.visibility('hidden');
  expect(app.params().get('en')).toBe('user_engagement');
  expect(app.params().get('_et')).toBe('12000');
  expect(app.params().get('seg')).toBe('1');
  app.window.dispatchEvent(new app.window.Event('pagehide'));
  expect(app.requests).toHaveLength(2);
  app.advance(60000);
  app.visibility('visible');
  app.advance(5000);
  app.window.dispatchEvent(new app.window.Event('pagehide'));
  expect(app.params().get('_et')).toBe('5000');
  expect(app.requests).toHaveLength(3);
});

test('scroll fires once at 90 percent, then resets for the next route', async () => {
  const app = browser();
  app.track();
  Object.defineProperty(app.document.documentElement, 'scrollHeight', { value: 2000 });
  Object.defineProperty(app.window, 'innerHeight', { value: 1000 });
  Object.defineProperty(app.window, 'pageYOffset', { value: 950 });
  app.document.dispatchEvent(new app.window.Event('scroll'));
  await new Promise(resolve => setTimeout(resolve, 350));
  expect(app.params().get('en')).toBe('scroll');
  expect(app.params().get('epn.percent_scrolled')).toBe('90');
  app.document.dispatchEvent(new app.window.Event('scroll'));
  await new Promise(resolve => setTimeout(resolve, 350));
  expect(app.requests).toHaveLength(2);
  app.window.history.pushState({}, '', '/next');
  app.document.dispatchEvent(new app.window.Event('scroll'));
  await new Promise(resolve => setTimeout(resolve, 350));
  expect(app.requests).toHaveLength(4);
});

test('outbound links and downloads omit visible text and sanitize their URLs', () => {
  const app = browser();
  app.track();
  app.document.body.innerHTML = '<a href="https://external.test/?pin=private-pin">private-text</a><a href="/files/report.pdf?token=private-token" id="download">private-text</a><a href="/internal" id="internal">Internal</a>';
  app.document.querySelector('a')!.dispatchEvent(new app.window.Event('click', { bubbles: true }));
  expect(app.params().get('en')).toBe('click');
  expect(app.params().get('ep.link_url')).toBe('https://external.test/');
  app.document.querySelector('#download')!.dispatchEvent(new app.window.Event('click', { bubbles: true }));
  expect(app.params().get('en')).toBe('file_download');
  expect(app.params().get('ep.file_name')).toBe('/files/report.pdf');
  expect(app.params().get('ep.outbound')).toBe('false');
  app.document.querySelector('#internal')!.dispatchEvent(new app.window.Event('click', { bubbles: true }));
  expect(app.requests).toHaveLength(3);
  expect(decodeURIComponent(app.requests.join('\n'))).not.toMatch(/private-/);
});

test('search tracking is opt-in, uses the value and preserves custom event names', () => {
  const off = browser({ url: 'https://example.test/?q=private-search' });
  off.track({ type: 'custom_event' });
  expect(off.params().get('en')).toBe('custom_event');
  expect(off.requests.join('\n')).not.toContain('private-search');
  const on = browser({ url: 'https://example.test/?q=charging', config: { searchTracking: true } });
  on.track();
  expect(on.requests).toHaveLength(2);
  expect(on.params(0).get('en')).toBe('page_view');
  expect(on.params(1).get('en')).toBe('view_search_results');
  expect(on.params(1).get('ep.search_term')).toBe('charging');
});

test('browser scripts avoid AMD interception and support opt-in global auto tracking', () => {
  const app = browser({ amd: true, config: {
    defineGlobal: true, autoTrack: true, trackingId: 'G-TEST123',
  } });
  expect(app.requests).toHaveLength(1);
  expect(app.window.track).toBeTypeOf('function');
  app.window.track!({ type: 'custom_event' });
  expect(app.requests).toHaveLength(2);
});
