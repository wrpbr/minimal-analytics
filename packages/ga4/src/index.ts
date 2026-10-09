import {
  debounce,
  getDocument,
  getScrollPercentage,
  getRandomId,
  isTargetElement,
  getUrlData,
  getEventParams,
} from '@minimal-analytics/shared';
import { param, files } from './model';
import { getTrackingState } from './state';
import { analyticsGranted, permittedParameter, sanitizeUrl } from './privacy';
import { send } from './transport';

/* -----------------------------------
 *
 * Window
 *
 * -------------------------------- */

declare global {
  interface Window {
    track?: typeof track;
    minimalAnalytics?: {
      defineGlobal?: boolean;
      analyticsEndpoint?: string;
      trackingId?: string;
      autoTrack?: boolean;
      analyticsStorage?: 'granted' | 'denied';
      sessionTimeout?: number;
      trackForms?: boolean;
      trackNavigation?: boolean;
      searchTracking?: boolean;
      collectTitle?: boolean;
    };
    dataLayer?: unknown[];
  }
}

/* -----------------------------------
 *
 * IProps
 *
 * -------------------------------- */

type ParamValue = string | number | boolean | undefined | null;
type EventParams = Record<string, ParamValue> | [string, ParamValue][];

interface TrackOptions {
  type?: string;
  event?: EventParams;
  debug?: boolean;
  keyEvent?: boolean;
}

/* -----------------------------------
 *
 * Variables
 *
 * -------------------------------- */

const isBrowser = typeof window !== 'undefined';
const defineGlobal = isBrowser && window.minimalAnalytics?.defineGlobal;
const autoTrack = isBrowser && window.minimalAnalytics?.autoTrack;
const analyticsEndpoint = 'https://www.google-analytics.com/g/collect';
const searchTerms = ['q', 's', 'search', 'query', 'keyword'];
const clickTargets = 'a, button, input[type=submit], input[type=button]';
let clickHandler: EventListener;
let scrollHandler: EventListener;
let unloadHandler: EventListener;
let activeSince: number | undefined;
let activeMilliseconds = 0;
let trackCalled = false;
let pageId = getRandomId();
let hitCount = 0;
let lastPage = '';
let previousPage = '';
let sentEngagement = 0;
let scrolled = false;
const startedForms = new WeakSet<HTMLFormElement>();

/* -----------------------------------
 *
 * Events
 *
 * -------------------------------- */

const eventKeys = {
  pageView: 'page_view',
  scroll: 'scroll',
  click: 'click',
  viewSearchResults: 'view_search_results',
  userEngagement: 'user_engagement',
  fileDownload: 'file_download',
};

/* -----------------------------------
 *
 * Arguments
 *
 * -------------------------------- */

function getArguments(args: [string | TrackOptions | undefined, TrackOptions?]): [string | undefined, TrackOptions] {
  const globalId = window.minimalAnalytics?.trackingId;
  const trackingId = typeof args[0] === 'string' ? args[0] : globalId;
  const props = typeof args[0] === 'object' ? args[0] : args[1] || {};

  return [trackingId, { type: eventKeys.pageView, ...props }];
}

/* -----------------------------------
 *
 * EventMeta
 *
 * -------------------------------- */

function getEventMeta({ type = '', event }: Pick<TrackOptions, 'type' | 'event'>) {
  let eventParams = [[param.eventName, type]];

  if (event) {
    const values = Array.isArray(event) ? Object.fromEntries(event) : event;
    const protectedKeys = new Set([
      'v', 'tid', 'cid', 'sid', 'sct', 'seg', '_ss', '_fv', '_p', '_s', 'en',
      'gcs', 'gcd', 'npa', '_c', '_et',
    ]);
    for (const [key, value] of getEventParams(event)) {
      if (!key || value == null || protectedKeys.has(key) || !permittedParameter(key)) continue;
      const normalized = key.startsWith('ep.') || key.startsWith('epn.')
        || ['dl', 'dr', 'dt'].includes(key)
        ? key : `${typeof values[key] === 'number' ? 'epn' : 'ep'}.${key}`;
      eventParams.push([normalized, value]);
    }
  }

  return eventParams;
}

/* -----------------------------------
 *
 * Query
 *
 * -------------------------------- */

function getQueryParams(trackingId: string, { type, event, debug, keyEvent }: TrackOptions) {
  const { location, referrer, title } = getDocument();
  let totalEngagement = getActiveTime();
  const { id, firstVisit, sessionStart, session } = getTrackingState(
    trackingId, type === eventKeys.pageView, totalEngagement, keyEvent,
  );
  if (sessionStart) {
    activeMilliseconds = 0;
    activeSince = document.visibilityState === 'hidden' ? undefined : Date.now();
    sentEngagement = 0;
    totalEngagement = 0;
  }
  const screen = self.screen || ({} as Screen);

  let params = [
    [param.protocolVersion, '2'],
    [param.trackingId, trackingId],
    [param.pageId, pageId],
    [param.language, (navigator.language || '').toLowerCase()],
    [param.clientId, id],
    [param.firstVisit, firstVisit ? '1' : ''],
    [param.hitCount, `${++hitCount}`],
    [param.sessionId, session.id],
    [param.sessionCount, `${session.count}`],
    [param.sessionEngagement, session.engaged ? '1' : '0'],
    [param.sessionStart, sessionStart ? '1' : ''],
    [param.debug, debug ? '1' : ''],
    [param.referrer, previousPage || referrer],
    [param.location, location],
    [param.title, window.minimalAnalytics?.collectTitle ? title : ''],
    [param.screenResolution, `${screen.width}x${screen.height}`],
    [param.enagementTime, `${Math.max(0, totalEngagement - sentEngagement)}`],
    ['gcs', 'G101'],
    ['npa', '1'],
    ['_c', keyEvent ? '1' : ''],
  ];

  params = params.concat(getEventMeta({ type, event }));
  params = params.filter(([, value]) => value);

  // set() replaces an override; appending would retain the unsafe original URL.
  const query = new URLSearchParams();
  for (const [key, value] of params) {
    if (value == null || value === '') continue;
    query.set(key, ['dl', 'dr'].includes(key) || key.endsWith('_url') ? sanitizeUrl(value) : value);
  }
  sentEngagement = totalEngagement;
  return query;
}

/* -----------------------------------
 *
 * ActiveTime
 *
 * -------------------------------- */

function getActiveTime() {
  return activeMilliseconds + (activeSince === undefined ? 0 : Math.max(0, Date.now() - activeSince));
}

/* -----------------------------------
 *
 * ClickEvent
 *
 * -------------------------------- */

function onClickEvent(trackingId: string, event: Event) {
  if (!analyticsGranted()) return;
  const targetElement = isTargetElement(event.target as Element, clickTargets);
  const tagName = targetElement?.tagName?.toLowerCase();
  const elementType = tagName === 'a' ? 'link' : tagName;
  const hrefAttr = targetElement?.getAttribute('href') || void 0;
  const downloadAttr = targetElement?.getAttribute('download') || void 0;
  const fileUrl = downloadAttr || hrefAttr;

  const { isExternal, hostname, pathname } = getUrlData(fileUrl);
  const isInternalLink = elementType === 'link' && !isExternal;
  const fileExtension = pathname?.match(new RegExp(`\\.(${files.join('|')})$`, 'i'))?.[1]?.toLowerCase();

  const eventName = fileExtension ? eventKeys.fileDownload : eventKeys.click;
  const elementParam = `${param.eventParam}.${elementType}`;

  if (!targetElement || targetElement.closest('[data-analytics-ignore]')
    || (isInternalLink && !fileExtension) || (!isExternal && !fileExtension)) {
    return;
  }

  let eventParams: EventParams = [
    [`${elementParam}_id`, targetElement.id],
    [`${elementParam}_classes`, targetElement.className],
    [`${elementParam}_url`, sanitizeUrl(hrefAttr)],
    [`${elementParam}_domain`, hostname],
    [`${param.eventParam}.outbound`, `${isExternal}`],
  ];

  if (fileExtension) {
    eventParams = eventParams.concat([
      [`${param.eventParam}.file_name`, pathname],
      [`${param.eventParam}.file_extension`, fileExtension],
    ]);
  }

  track(trackingId, {
    type: eventName,
    event: eventParams,
  });
}

/* -----------------------------------
 *
 * BlurEvent
 *
 * -------------------------------- */

function onBlurEvent() {
  activeMilliseconds = getActiveTime();
  activeSince = undefined;
}

/* -----------------------------------
 *
 * FocusEvent
 *
 * -------------------------------- */

function onFocusEvent() {
  if (activeSince === undefined && document.visibilityState !== 'hidden') activeSince = Date.now();
}

/* -----------------------------------
 *
 * VisibilityEvent
 *
 * -------------------------------- */

function onVisibilityChange(trackingId: string) {
  if (document.visibilityState === 'hidden') {
    onBlurEvent();
    onUnloadEvent(trackingId);
    return;
  }
  if (document.visibilityState === 'visible') onFocusEvent();
}

/* -----------------------------------
 *
 * ScrollEvent
 *
 * -------------------------------- */

const onScrollEvent = debounce((trackingId: string) => {
  if (!analyticsGranted()) return;
  const percentage = getScrollPercentage();

  if (scrolled || percentage < 90) {
    return;
  }

  const eventParams: EventParams = [[`${param.eventParamNumber}.percent_scrolled`, 90]];

  track(trackingId, {
    type: eventKeys.scroll,
    event: eventParams,
  });

  scrolled = true;
});

/* -----------------------------------
 *
 * UnloadEvent
 *
 * -------------------------------- */

function onUnloadEvent(trackingId: string) {
  if (getActiveTime() <= sentEngagement) return;
  track(trackingId, {
    type: eventKeys.userEngagement,
  });
}

function formEvent(trackingId: string, event: Event) {
  if (!analyticsGranted()) return;
  const target = event.target instanceof Element ? event.target : null;
  const form = target?.closest('form');
  if (!(form instanceof HTMLFormElement) || form.closest('[data-analytics-ignore]')) return;
  const fields = { 'ep.form_id': form.id };
  if (!startedForms.has(form)) {
    startedForms.add(form);
    track(trackingId, { type: 'form_start', event: fields });
  }
  if (event.type === 'submit') track(trackingId, { type: 'form_submit', event: fields });
}

function bindNavigation(trackingId: string) {
  const onNavigation = () => {
    const next = sanitizeUrl(document.location.href);
    if (next === lastPage) return;
    previousPage = lastPage;
    track(trackingId);
  };
  for (const key of ['pushState', 'replaceState'] as const) {
    const original = history[key];
    history[key] = function (...args: Parameters<History[typeof key]>) {
      const result = original.apply(this, args);
      onNavigation();
      return result;
    };
  }
  window.addEventListener('popstate', onNavigation);
}

/* -----------------------------------
 *
 * BindEvent
 *
 * -------------------------------- */

function bindEvents(trackingId: string) {
  if (trackCalled) {
    return;
  }

  clickHandler = onClickEvent.bind(null, trackingId);
  scrollHandler = onScrollEvent.bind(null, trackingId);
  unloadHandler = onUnloadEvent.bind(null, trackingId);

  document.addEventListener('visibilitychange', onVisibilityChange.bind(null, trackingId));
  document.addEventListener('scroll', scrollHandler);
  document.addEventListener('click', clickHandler);

  window.addEventListener('blur', onBlurEvent);
  window.addEventListener('focus', onFocusEvent);
  window.addEventListener('pagehide', () => {
    onBlurEvent();
    unloadHandler(new Event('pagehide'));
  });
  window.addEventListener('pageshow', onFocusEvent);
  if (window.minimalAnalytics?.trackForms !== false) {
    document.addEventListener('focusin', formEvent.bind(null, trackingId), true);
    document.addEventListener('input', formEvent.bind(null, trackingId), true);
    document.addEventListener('submit', formEvent.bind(null, trackingId), true);
  }
  if (window.minimalAnalytics?.trackNavigation !== false) bindNavigation(trackingId);
}

/* -----------------------------------
 *
 * Track
 *
 * -------------------------------- */

function track(trackingId: string, props?: TrackOptions): void;
function track(props?: TrackOptions): void;
function track(first?: string | TrackOptions, second?: TrackOptions): void {
  if (!isBrowser || typeof document === 'undefined' || !analyticsGranted()) return;
  const [trackingId, { type, event, debug, keyEvent }] = getArguments([first, second]);

  if (!trackingId) {
    console.error('GA4: Tracking ID is missing or undefined');

    return;
  }

  if (type === eventKeys.pageView) {
    pageId = getRandomId();
    hitCount = 0;
    scrolled = false;
    lastPage = sanitizeUrl(document.location.href);
  }
  if (!trackCalled) onFocusEvent();
  const queryParams = getQueryParams(trackingId, { type, event, debug, keyEvent });
  const endpoint = window.minimalAnalytics?.analyticsEndpoint || analyticsEndpoint;

  send(`${endpoint}?${queryParams}`);

  bindEvents(trackingId);

  trackCalled = true;
  if (type === eventKeys.pageView && window.minimalAnalytics?.searchTracking) {
    const search = new URLSearchParams(document.location.search);
    const term = searchTerms.map(key => search.get(key)).find(Boolean);
    if (term) track(trackingId, { type: eventKeys.viewSearchResults, event: { 'ep.search_term': term.slice(0, 100) } });
  }
}

/* -----------------------------------
 *
 * Define
 *
 * -------------------------------- */

if (defineGlobal) {
  window.track = track;
}

/* -----------------------------------
 *
 * Init
 *
 * -------------------------------- */

if (autoTrack) {
  track();
}

/* -----------------------------------
 *
 * Export
 *
 * -------------------------------- */

export { track };
export type { EventParams, TrackOptions };
