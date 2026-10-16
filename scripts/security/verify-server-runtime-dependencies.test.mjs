import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parsePnpmDependencyGraph,
  traceProductionDependency,
  verifyServerDependencyBoundary,
} from './verify-server-runtime-dependencies.mjs';

const safeLockfile = `lockfileVersion: '9.0'
importers:

  apps/api:
    dependencies:
      '@beauty-erp/database':
        specifier: workspace:*
        version: link:../../packages/database
      server:
        specifier: 1.0.0
        version: 1.0.0

  apps/web:
    dependencies:
      next:
        specifier: 16.3.8
        version: 16.3.8

  apps/marketing:
    dependencies:
      next:
        specifier: 16.3.8
        version: 16.3.8

  apps/mobile:
    dependencies:
      expo:
        specifier: 57.0.16
        version: 57.0.16

  packages/database:
    dependencies:
      pg:
        specifier: 8.0.0
        version: 8.0.0

packages:
  braces@3.0.3:
    resolution: {integrity: example}

snapshots:

  server@1.0.0: {}
  next@16.3.8: {}
  pg@8.0.0: {}
  expo@57.0.16:
    dependencies:
      micromatch: 4.0.8
  micromatch@4.0.8:
    dependencies:
      braces: 3.0.3
  braces@3.0.3: {}
`;

test('passes safe API, web and marketing closures while reporting the mobile path', () => {
  const report = verifyServerDependencyBoundary(safeLockfile);
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.mobile?.path, [
    'apps/mobile', 'expo', 'micromatch', 'braces',
  ]);
  assert.equal(report.mobile?.version, '3.0.3');
});

test('detects braces introduced transitively into a server runtime', () => {
  const lockfile = safeLockfile.replace(
    '  server@1.0.0: {}',
    `  server@1.0.0:
    dependencies:
      micromatch: 4.0.8`,
  );
  const report = verifyServerDependencyBoundary(lockfile);
  assert.equal(report.violations.length, 1);
  assert.equal(report.violations[0].app, 'apps/api');
  assert.deepEqual(report.violations[0].path, [
    'apps/api', 'server', 'micromatch', 'braces',
  ]);
});

test('follows linked workspace package dependencies', () => {
  const lockfile = safeLockfile.replace(
    '  pg@8.0.0: {}',
    `  pg@8.0.0:
    optionalDependencies:
      micromatch: 4.0.8`,
  );
  const trace = traceProductionDependency(
    parsePnpmDependencyGraph(lockfile), 'apps/api', 'braces',
  );
  assert.deepEqual(trace?.path, [
    'apps/api', '@beauty-erp/database', 'pg', 'micromatch', 'braces',
  ]);
});

test('fails closed for missing snapshots', () => {
  const lockfile = safeLockfile.replace('  server@1.0.0: {}', '');
  assert.throws(
    () => verifyServerDependencyBoundary(lockfile),
    /Missing lockfile snapshot for server@1.0.0/,
  );
});

test('ignores dev-only dependencies in the production graph', () => {
  const lockfile = safeLockfile.replace(
    '  apps/web:\n    dependencies:',
    `  apps/web:
    devDependencies:
      micromatch:
        specifier: 4.0.8
        version: 4.0.8
    dependencies:`,
  );
  const report = verifyServerDependencyBoundary(lockfile);
  assert.deepEqual(report.violations, []);
});

test('handles cyclic workspace links without losing reachable dependencies', () => {
  const cyclicLockfile = safeLockfile.replace(
    '  packages/database:\n    dependencies:\n      pg:',
    `  packages/database:
    dependencies:
      '@beauty-erp/api':
        specifier: workspace:*
        version: link:../../apps/api
      pg:`,
  );
  const baseGraph = parsePnpmDependencyGraph(cyclicLockfile);
  assert.equal(traceProductionDependency(baseGraph, 'apps/api', 'braces'), null);

  const vulnerableLockfile = cyclicLockfile.replace(
    '  pg@8.0.0: {}',
    `  pg@8.0.0:
    dependencies:
      micromatch: 4.0.8`,
  );
  const trace = traceProductionDependency(
    parsePnpmDependencyGraph(vulnerableLockfile), 'apps/api', 'braces',
  );
  assert.deepEqual(trace?.path, [
    'apps/api', '@beauty-erp/database', 'pg', 'micromatch', 'braces',
  ]);
});

test('fails closed on unresolved linked workspace importer', () => {
  const broken = safeLockfile.replace(
    'version: link:../../packages/database',
    'version: link:../../packages/nonexistent',
  );
  assert.throws(
    () => verifyServerDependencyBoundary(broken),
    /Unresolved workspace link/,
  );
});

test('reports unpatched node-forge when present in mobile Expo tooling', () => {
  const lockfile = safeLockfile.replace(
    '  expo@57.0.16:\n    dependencies:\n      micromatch: 4.0.8',
    `  expo@57.0.16:
    dependencies:
      micromatch: 4.0.8
      node-forge: 1.4.0
  node-forge@1.4.0: {}`,
  );
  const report = verifyServerDependencyBoundary(lockfile);
  assert.deepEqual(report.violations, []);
  assert.deepEqual(
    report.mobileExposures.map((item) => item.packageName).sort(),
    ['braces', 'node-forge'],
  );
  const forge = report.mobileExposures.find((item) => item.packageName === 'node-forge');
  assert.deepEqual(forge?.path, ['apps/mobile', 'expo', 'node-forge']);
  assert.equal(forge?.version, '1.4.0');
});

test('blocks node-forge introduced transitively into an API production dependency', () => {
  const lockfile = safeLockfile.replace(
    '  server@1.0.0: {}',
    `  server@1.0.0:
    dependencies:
      node-forge: 1.4.0
  node-forge@1.4.0: {}`,
  );
  const report = verifyServerDependencyBoundary(lockfile);
  assert.deepEqual(report.violations.map((entry) => entry.packageName), ['node-forge']);
  assert.deepEqual(report.violations[0].path, ['apps/api', 'server', 'node-forge']);
});
