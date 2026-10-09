# Changes

## 2.0.0-wrp.1

Fork of upstream 1.8.7, commit `ee335ed3833451b6c28047b486e0e48b9f5e3e3c`.

- Repair shared session storage, session counts, timeout, engagement state, page IDs and hit counts. These address the browser defects described in [upstream issue 52](https://github.com/jahilldev/minimal-analytics/issues/52).
- Keep page-local identifiers if storage or cookies are blocked. This covers the browser case in [issue 44](https://github.com/jahilldev/minimal-analytics/issues/44). Workers remain outside the supported browser environment.
- Use fetch with keepalive when beacon is unavailable or refuses a request, as described in [issue 56](https://github.com/jahilldev/minimal-analytics/issues/56).
- Allow one filtered page URL override. This addresses duplicate URL parameters from the override path in [issue 43](https://github.com/jahilldev/minimal-analytics/issues/43). Non-HTTP application URLs remain unsupported.
- Provide an IIFE browser artifact that does not trigger AMD loader registration, relevant to [issue 39](https://github.com/jahilldev/minimal-analytics/issues/39).
- Normalize custom event fields and support an explicit key-event hint. These address client-side parameter handling relevant to [issue 60](https://github.com/jahilldev/minimal-analytics/issues/60). Property-level key-event reporting still requires live verification.
- Add form events and history navigation tracking. Send search events separately and only when enabled.
- Flush visible engagement on visibility changes and `pagehide`. Prevent duplicate flushes.
- Require an analytics grant. Remove private query fields, URL credentials and fragments. Disable title and search-term collection by default.
- Replace the old vulnerable build dependency graph. Pin the new toolchain, audit locked dependencies with Socket and enforce an 8 KiB browser gzip budget.

The tests intercept every analytics request. Live acceptance and report parity in GA4 are separate integration checks.
