import { getRandomId } from './utility';
import { readStorage, writeStorage } from './storage';

/* -----------------------------------
 *
 * Types
 *
 * -------------------------------- */

type ParamValue = string | number | boolean | undefined | null;
type EventParams = Record<string, ParamValue> | [string, ParamValue][];

/* -----------------------------------
 *
 * Variables
 *
 * -------------------------------- */

const clientKey = 'clientId';
const sessionKey = 'sessionId';
const counterKey = 'sessionCount';

/* -----------------------------------
 *
 * Document
 *
 * -------------------------------- */

function getDocument() {
  const { hostname, origin, pathname, search } = document.location;
  const title = document.title;
  const referrer = document.referrer;

  return { location: origin + pathname + search, hostname, pathname, referrer, title };
}

/* -----------------------------------
 *
 * ClientId
 *
 * -------------------------------- */

function getClientId(key = clientKey) {
  const clientId = getRandomId();
  const storedValue = readStorage(key);

  if (!storedValue) {
    writeStorage(key, clientId);

    return clientId;
  }

  return storedValue;
}

/* -----------------------------------
 *
 * SessionId
 *
 * -------------------------------- */

function getSessionId(key = sessionKey) {
  const sessionId = getRandomId();
  const storedValue = readStorage(key, 'session');

  if (!storedValue) {
    writeStorage(key, sessionId, 'session');

    return sessionId;
  }

  return storedValue;
}

/* -----------------------------------
 *
 * SessionCount
 *
 * -------------------------------- */

function getSessionCount(key = counterKey) {
  let sessionCount = '1';
  const storedValue = readStorage(key, 'session');

  if (storedValue) {
    sessionCount = `${+storedValue + 1}`;
  }

  writeStorage(key, sessionCount, 'session');

  return sessionCount;
}

/* -----------------------------------
 *
 * SessionState
 *
 * -------------------------------- */

function getSessionState(firstEvent: boolean) {
  const firstVisit = !readStorage(clientKey) ? '1' : void 0;
  const sessionStart = !readStorage(sessionKey, 'session') ? '1' : void 0;
  let sessionCount = readStorage(counterKey, 'session') || '1';

  if (firstEvent) {
    sessionCount = getSessionCount();
  }

  return { firstVisit, sessionStart, sessionCount };
}

/* -----------------------------------
 *
 * EventPrams
 *
 * -------------------------------- */

function getEventParams(event: EventParams): [string, string][] {
  const entries = Array.isArray(event) ? event : Object.entries(event);
  return entries
    .filter(([, value]) => value != null)
    .map(([key, value]) => [key, String(value)]);
}

/* -----------------------------------
 *
 * Export
 *
 * -------------------------------- */

export {
  EventParams,
  clientKey,
  sessionKey,
  counterKey,
  getDocument,
  getClientId,
  getSessionId,
  getSessionState,
  getEventParams,
};
