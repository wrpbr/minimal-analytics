# minimal-analytics — wrpbr fork

[![CI](https://github.com/wrpbr/minimal-analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/wrpbr/minimal-analytics/actions/workflows/ci.yml)

A small browser tracker for basic Google Analytics 4 events. This fork repairs session handling, form tracking, navigation, transport failures and URL filtering. It keeps the original MIT license and Git history from [jahilldev/minimal-analytics](https://github.com/jahilldev/minimal-analytics).

Use the [GA4 setup guide](packages/ga4/README.md) to download a pinned release and host the script yourself. The build provides browser, ESM and CommonJS files. It limits the browser file to 8 KiB with gzip.

Version 2 requires an analytics consent grant. It removes private query fields from URLs. Read the migration notes before you replace an existing tracker.

This is an unofficial client for Google's browser collection endpoint. It does not provide full Google tag, advertising, Consent Mode v2 or report parity. Validate your events and reports in a test GA4 property before production use. Do not load both trackers on the same page.

## Development

Use Node 26.9.0 and the pnpm version pinned in `package.json`. Run build and tests in a disposable container.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm verify
```

CI audits every locked dependency with Socket before installation. It rejects an incomplete analysis or a policy alert. The pinned Socket CLI is the bootstrap tool. CI then checks types, lint, browser behavior and compressed size. It uploads the tested files and SHA-256 checksums.

The old Yarn lockfiles and build tools have been replaced by pnpm, TypeScript 7, Oxlint, esbuild and Vitest. The legacy tests remain in Git history. The current tests run against the built browser file, with all network transports intercepted.

See [CHANGELOG.md](CHANGELOG.md) for the fixes and their limits. The unfinished Heap package is retained as historical source. It is private and is not built or released.
