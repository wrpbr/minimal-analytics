import { getRandomId, readStorage, writeStorage } from '@minimal-analytics/shared';

type Session = { id: string; count: number; last: number; views: number; engaged: boolean };
const clientKey = 'minimalAnalytics:clientId';

function client() {
  const stored = readStorage(clientKey);
  if (stored) return { id: stored, firstVisit: false };
  // Reuse the existing Google identifier without copying a session cookie.
  let cookie: string | undefined;
  try {
    cookie = document.cookie.match(/(?:^|;\s*)_ga=GA\d+\.\d+\.(\d+\.\d+)(?:;|$)/)?.[1];
  } catch {
    // Sandboxed documents can also deny cookie access.
  }
  const legacy = readStorage('clientId');
  const legacyId = legacy && /^\d{1,16}$/.test(legacy) ? legacy : '';
  const id = cookie || legacyId
    || `${getRandomId(10)}.${Math.floor(Date.now() / 1000)}`;
  writeStorage(clientKey, id);
  return { id, firstVisit: !cookie && !legacyId };
}

function getTrackingState(trackingId: string, pageView: boolean, engagement: number, keyEvent = false) {
  const now = Date.now();
  const key = `minimalAnalytics:session:${trackingId}`;
  const timeout = window.minimalAnalytics?.sessionTimeout ?? 1800;
  const timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout * 1000 : 1800000;
  let previous: Session | undefined;
  try {
    const parsed: unknown = JSON.parse(readStorage(key) || 'null');
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Partial<Session>;
      if (typeof record.id === 'string' && /^\d{10,16}$/.test(record.id)
        && Number.isSafeInteger(record.count) && (record.count ?? 0) > 0
        && typeof record.last === 'number' && Number.isFinite(record.last)
        && typeof record.views === 'number' && Number.isSafeInteger(record.views) && record.views >= 0
        && typeof record.engaged === 'boolean') previous = record as Session;
    }
  } catch {
    // Invalid storage is replaced by a new session.
  }
  const isNew = !previous || now - previous.last >= timeoutMs || now < previous.last;
  const state: Session = isNew
    ? { id: `${Math.floor(now / 1000)}`, count: (previous?.count ?? 0) + 1, last: now, views: 0, engaged: false }
    : { ...previous!, last: now };
  if (pageView) state.views += 1;
  state.engaged ||= state.views >= 2 || (!isNew && engagement >= 10000) || keyEvent;
  writeStorage(key, JSON.stringify(state));
  return { ...client(), session: state, sessionStart: isNew };
}

export { getTrackingState };
