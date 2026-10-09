# GA4 — wrpbr fork

A small tracker for page views, forms, navigation, engagement, outbound clicks, file downloads and custom events. This fork is based on `@minimal-analytics/ga4` 1.8.7. It sends events to the GA4 browser collection endpoint without downloading the Google tag.

This endpoint is an internal browser protocol. Google can change it without notice. This package does not replace advertising features, cross-domain linking, Google Signals or the full Consent Mode v2 implementation. A successful browser request does not prove that every GA4 report is correct.

## Download

Download `browser.js`, `index.js`, `index.cjs`, `index.d.ts` and `SHA256SUMS` from the [2.0.0-wrp.1 release](https://github.com/wrpbr/minimal-analytics/releases/tag/v2.0.0-wrp.1). Verify the checksums. Keep the MIT `LICENSE` with the files.

Host the browser file on your domain. Pin the release. Do not use an upstream npm package or an unversioned CDN URL to obtain these fixes. The fork is not published to npm.

For a bundler, copy `index.js` and `index.d.ts` into a vendor directory in your application. Import `track` from that file. The bundle has no runtime package dependencies.

```ts
import { track } from './vendor/minimal-analytics/index.js';

// Call this only after your application has obtained an analytics grant.
window.minimalAnalytics = { analyticsStorage: 'granted' };
track('G-XXXXXXXXXX');
```

For a plain script:

```html
<script>
  window.minimalAnalytics = {
    trackingId: 'G-XXXXXXXXXX',
    analyticsStorage: 'granted', // Set after the user's analytics grant.
    defineGlobal: true,
    autoTrack: true
  };
</script>
<script defer src="/vendor/minimal-analytics/browser.js"></script>
```

The browser file uses an IIFE. It does not call AMD `define`. The exported namespace is `minimalAnalyticsGA4`. With `defineGlobal`, it also sets `window.track`.

## Consent and privacy

Collection is denied by default. Before a grant, the tracker sends no events and writes no identifiers. Set `analyticsStorage` to `denied` to stop new events.

If you omit `analyticsStorage`, the tracker reads the last `analytics_storage` grant or denial in queued `gtag('consent', 'default' | 'update', ...)` commands. An explicit `analyticsStorage` setting takes precedence. This only gates analytics collection. It does not implement an entire consent manager or Google's consent modeling.

Advertising storage stays denied in the collection flags. No cookieless pings are sent when analytics collection is denied. The tracker uses local storage for its own identifiers. Your consent manager remains responsible for removing persisted identifiers when your policy requires deletion.

Page and referrer URLs keep their path and the following campaign query fields:

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`.
- `gclid`, `dclid`, `gbraid`, `wbraid`.

All other query fields, URL credentials and fragments are removed. A `dl` override replaces the original URL and goes through the same filter. Non-HTTP URLs are omitted.

Document titles and search terms are not collected by default. Form values and visible link text are not collected automatically. Fields named `pin`, `auth_token`, `token`, `phone`, `email`, `password`, `cpf`, `cnpj`, `otp` and their Portuguese equivalents are rejected.

You remain responsible for data in URL paths, element IDs, CSS classes, campaign values and custom event values. Use static IDs. Do not put personal data in these fields. Put `data-analytics-ignore` on a form, link or containing region to exclude automatic form and click events.

## Sessions

Tabs and reloads on the same origin share a session through local storage. Only a new session increments the count. A session expires after 30 minutes without a collected event. Set `sessionTimeout` in seconds to match your property setting.

The session ID is a timestamp in seconds. The session becomes engaged after two page views, ten seconds of visible activity, or an event explicitly marked with `keyEvent: true`.

An existing `_ga` cookie preserves the client ID. The tracker does not import Google's session cookie or historical session count. A migration can therefore start a new session and count sequence.

If storage is blocked, identifiers remain stable in memory for that page. A reload can then appear as a new visitor. Simultaneous writes from tabs have no transaction guarantee. Identifier reuse does not implement cross-domain linking.

## Automatic events

The first `track()` call sends a page view and binds handlers once.

- History `pushState`, `replaceState` and `popstate` send a page view when the filtered URL changes. Hash-only changes do not create a page view.
- The first interaction with a form sends `form_start`. A native submit event sends `form_submit`. This is a submit attempt, not proof of server acceptance.
- A scroll event is sent once per page at 90 percent of scrollable content.
- External links send `click`. Recognized file paths send `file_download`.
- Hiding the page or firing `pagehide` sends only unsent visible engagement time. Time in a hidden page is excluded.

Set `trackNavigation: false` if your router already sends page views. Set `trackForms: false` if your application already sends form events. Applications that submit through a button or fetch without a native submit event must send their own event.

Set `searchTracking: true` only when search terms are safe to collect. It sends a separate `view_search_results` event with the value of `q`, `s`, `search`, `query` or `keyword`. It does not rename unrelated events. Set `collectTitle: true` only when page titles contain no private data.

## Custom events

```ts
track('G-XXXXXXXXXX', {
  type: 'checkout_complete',
  event: {
    event_category: 'conversion',
    value: 25,
    currency: 'BRL'
  },
  keyEvent: true
});
```

Numbers get the `epn.` prefix. Other values get `ep.`. Existing prefixes are accepted. `0` and `false` are preserved. `null` and `undefined` are omitted. Parameters cannot replace the client, session or protocol fields.

Configure the event as a key event in your GA4 property. The local `keyEvent` flag affects engagement and the collection hint. It does not change the property's configuration or guarantee a conversion report.

You can also set `window.minimalAnalytics.trackingId` and call `track({ type: 'custom_event' })`. Use one measurement ID per page for automatic events.

## Transport and validation

The tracker tries `sendBeacon`. If it is absent, throws or rejects the queue, it tries `fetch` with `keepalive`. Errors do not interrupt the application. Delivery is best effort. There is no durable queue, retry worker or custom data store.

Set `analyticsEndpoint` to use an existing collector proxy. The default is `https://www.google-analytics.com/g/collect`.

Before deployment, validate sessions, users, page views, source and medium, form events and key events in a separate GA4 property. Check geographic and real-time reports. Compare a representative period with your existing tracking. The automated tests validate request construction and browser behavior; they do not send live events to Google.

## Credits

Original project and MIT copyright: [James Hill](https://github.com/jahilldev/minimal-analytics). The upstream project credits [David Künnen](https://github.com/DavidKuennen) and [Dariusz Więckiewicz](https://github.com/idarek) for the earlier lightweight trackers.
