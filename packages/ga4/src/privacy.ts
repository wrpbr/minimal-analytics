const campaignKeys = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'gclid', 'dclid', 'gbraid', 'wbraid',
]);
const privateKey = /(?:^|[._])(?:pin|auth_token|token|phone|telefone|email|password|senha|cpf|cnpj|otp|user_name)(?:$|[._])/i;

function sanitizeUrl(value: string | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value, document.location.href);
    if (!/^https?:$/.test(url.protocol)) return '';
    url.hash = '';
    url.username = '';
    url.password = '';
    const allowed = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
      if (campaignKeys.has(key.toLowerCase())) allowed.append(key, value);
    }
    url.search = allowed.toString();
    return url.href;
  } catch {
    return '';
  }
}

function permittedParameter(key: string): boolean {
  return !privateKey.test(key);
}

function analyticsGranted(): boolean {
  const explicit = window.minimalAnalytics?.analyticsStorage;
  if (explicit) return explicit === 'granted';
  let granted = false;
  // Existing gtag consent commands can grant or revoke analytics collection.
  for (const entry of window.dataLayer ?? []) {
    const command = entry as { [key: number]: unknown };
    if (command?.[0] !== 'consent' || !['default', 'update'].includes(String(command[1]))) continue;
    const consent = command[2] as { analytics_storage?: unknown } | undefined;
    if (consent?.analytics_storage === 'granted') granted = true;
    if (consent?.analytics_storage === 'denied') granted = false;
  }
  return granted;
}

export { sanitizeUrl, permittedParameter, analyticsGranted };
