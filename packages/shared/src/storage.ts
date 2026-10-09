const memory = new Map<string, string>();
type StorageScope = 'local' | 'session';

function readStorage(key: string, scope: StorageScope = 'local'): string | null {
  // A failed write can leave an older disk value. Prefer the newer memory value.
  const fallback = memory.get(`${scope}:${key}`);
  if (fallback !== undefined) return fallback;
  try {
    const storage = scope === 'local' ? window.localStorage : window.sessionStorage;
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string, scope: StorageScope = 'local'): void {
  try {
    const storage = scope === 'local' ? window.localStorage : window.sessionStorage;
    storage.setItem(key, value);
    memory.delete(`${scope}:${key}`);
  } catch {
    memory.set(`${scope}:${key}`, value);
  }
}

export { readStorage, writeStorage };
export type { StorageScope };
