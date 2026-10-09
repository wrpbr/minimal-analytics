function send(url: string): void {
  try {
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url)) return;
  } catch {
    // A blocked beacon can still use the regular HTTP transport.
  }
  try {
    if (typeof window.fetch === 'function') {
      void window.fetch(url, { method: 'POST', keepalive: true, mode: 'no-cors', credentials: 'omit' }).catch(() => {});
    }
  } catch {
    // Analytics must not interrupt navigation or form submission.
  }
}

export { send };
