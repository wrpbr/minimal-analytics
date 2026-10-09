import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const socketPath = process.env.MINIMAL_SOCKET_PATH
  || dirname(require.resolve('socket/package.json'));
type Artifact = { type: string; name: string; namespace?: string; version: string; alerts: { type: string }[] };
type Result = { success: boolean; status?: number; data: Artifact };
type Request = { components: { purl: string }[] };
type Stream = (body: Request, options?: unknown) => AsyncIterable<Result>;
interface Sdk {
  batchPackageStream: Stream;
}
interface SocketUtilities {
  getPublicApiToken(): string;
  setupSdk(options: { apiToken: string }): Promise<{ ok: boolean; data: Sdk }>;
  getAlertsMapFromPurls(purls: string[], options: unknown): Promise<Map<string, unknown>>;
  logAlertsMap(alerts: Map<string, unknown>, options: unknown): void;
}
// The CLI version is pinned. This uses its public access token and risk policy.
const utilities = require(join(socketPath, 'dist/utils.js')) as SocketUtilities;
const apiToken = utilities.getPublicApiToken();
const setup = await utilities.setupSdk({ apiToken });
if (!setup.ok) throw new Error('Socket SDK setup failed');
const prototype = Object.getPrototypeOf(setup.data) as Sdk;
const original = prototype.batchPackageStream;
prototype.batchPackageStream = async function* (body) {
  const expected = new Set(body.components.map(({ purl }) => purl));
  const complete = new Map<string, Result>();
  const deadline = Date.now() + 300000;
  let pending = [...expected];
  while (pending.length) {
    const retry: string[] = [];
    const seen = new Set<string>();
    for await (const result of original.call(this, { components: pending.map(purl => ({ purl })) }, {
      queryParams: { alerts: 'true', compact: 'false', poll: 'true', timeoutSec: '30' },
    })) {
      if (!result.success || !Array.isArray(result.data?.alerts)) throw new Error('Socket analysis unavailable');
      const artifact = result.data;
      if (artifact.type !== 'npm') throw new Error('Unexpected Socket package type');
      const name = artifact.namespace && !artifact.name.startsWith('@')
        ? `@${artifact.namespace.replace(/^@/, '')}/${artifact.name}` : artifact.name;
      let key = `pkg:npm/${name}@${artifact.version}`;
      if (!expected.has(key)) {
        // Some API responses omit the namespace. Resolve only a unique match.
        const matches = pending.filter(purl => purl.replace(/^pkg:npm\/@[^/]+\//, 'pkg:npm/') === key);
        if (matches.length !== 1) throw new Error(`Unverifiable Socket identity: ${key}`);
        key = matches[0];
        result.data = { ...artifact, name: key.slice(8, key.lastIndexOf('@')), namespace: undefined };
      }
      if (!pending.includes(key) || seen.has(key)) throw new Error(`Unexpected Socket response: ${key}`);
      seen.add(key);
      const coverage = artifact.alerts.filter(alert => /pending|notfound|missing|unscanned/i.test(alert.type));
      if (coverage.some(alert => !/pending/i.test(alert.type))) throw new Error(`Socket has no analysis: ${key}`);
      if (coverage.length) retry.push(key);
      else complete.set(key, result);
    }
    if (seen.size !== pending.length) throw new Error('Incomplete Socket analysis');
    if (retry.length) {
      if (Date.now() >= deadline) throw new Error('Socket analysis timed out');
      console.log(`Socket: waiting for ${retry.length} package analyses`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    pending = retry;
  }
  if (complete.size !== expected.size) throw new Error('Incomplete Socket analysis');
  yield* complete.values();
};

const lock = await readFile('pnpm-lock.yaml', 'utf8');
if (!/^lockfileVersion: '9\.0'$/m.test(lock)) throw new Error('Unsupported lockfile version');
const block = lock.split('\npackages:\n')[1]?.split('\nsnapshots:\n')[0];
if (!block) throw new Error('Lockfile packages are missing');
const packages = [...block.matchAll(/^  (?:'([^']+)'|([^:\s]+)):\s*$/gm)].map(match => match[1] || match[2]);
if (!packages.length || packages.some(pkg => !/^(?:@[^/]+\/)?[^@]+@\d+\.\d+\.\d+(?:[-+][^/]+)?$/.test(pkg))) {
  throw new Error('Lockfile has invalid package identities');
}
const purls = packages.map(pkg => `pkg:npm/${pkg}`);
const alerts = await utilities.getAlertsMapFromPurls(purls, {
  apiToken, nothrow: false, filter: { actions: ['error', 'monitor', 'warn'] },
});
if (alerts.size) {
  utilities.logAlertsMap(alerts, { output: process.stderr });
  throw new Error('Socket dependency policy rejected the install');
}
console.log(`Socket: complete analysis of ${purls.length} exact dependency versions`);
