import { readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_APPS = ['apps/api', 'apps/web', 'apps/marketing'];
const BUILD_TOOL_APP = 'apps/mobile';

function unquote(value) {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Read only the lockfile's importer dependency versions and snapshot edges.
 * No registry lookups or installed modules are required. Unknown edges fail
 * closed instead of silently treating an incomplete graph as safe.
 */
export function parsePnpmDependencyGraph(lockfile) {
  const importers = new Map();
  const snapshots = new Map();
  let section = '';
  let importer = null;
  let importerKind = '';
  let dependencyName = '';
  let snapshot = null;
  let snapshotKind = '';

  for (const line of lockfile.split(/\r?\n/)) {
    if (line === 'importers:' || line === 'packages:' || line === 'snapshots:') {
      section = line.slice(0, -1);
      importer = null;
      snapshot = null;
      continue;
    }

    if (section === 'importers') {
      let match = /^  (\S[^:]*):$/.exec(line);
      if (match) {
        importer = match[1];
        importers.set(importer, { dependencies: new Map(), optionalDependencies: new Map() });
        importerKind = '';
        continue;
      }
      match = /^    (dependencies|optionalDependencies|devDependencies):$/.exec(line);
      if (match) {
        importerKind = match[1];
        continue;
      }
      match = /^      (.+):$/.exec(line);
      if (match) {
        dependencyName = unquote(match[1]);
        continue;
      }
      match = /^        version: (.+)$/.exec(line);
      if (match && importer && importerKind !== 'devDependencies') {
        const version = unquote(match[1]);
        importers.get(importer)[importerKind].set(dependencyName, version);
      }
    } else if (section === 'snapshots') {
      let match = /^  (\S.*):(?: \{\})?$/.exec(line);
      if (match) {
        snapshot = unquote(match[1]);
        snapshots.set(snapshot, []);
        snapshotKind = '';
        continue;
      }
      match = /^    (dependencies|optionalDependencies|transitivePeerDependencies):$/.exec(line);
      if (match) {
        snapshotKind = match[1];
        continue;
      }
      match = /^      (.+): (.+)$/.exec(line);
      if (match && snapshot && (snapshotKind === 'dependencies' || snapshotKind === 'optionalDependencies')) {
        snapshots.get(snapshot).push([unquote(match[1]), unquote(match[2])]);
      }
    }
  }

  if (!importers.size || !snapshots.size) {
    throw new Error('Cannot inspect production dependencies: missing lockfile importers or snapshots.');
  }
  return { importers, snapshots };
}

export function traceProductionDependency(graph, root, packageName) {
  if (!graph.importers.has(root)) {
    throw new Error(`Production dependency importer missing: ${root}`);
  }
  const initial = graph.importers.get(root);
  const queue = [...initial.dependencies, ...initial.optionalDependencies].map(
    ([name, version]) => ({ name, version, importer: root, path: [root, name] }),
  );
  const visited = new Set();
  const visitedWorkspaceImporters = new Set();

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.version.startsWith('link:')) {
      const linkedImporter = posix.normalize(posix.join(
        current.importer, current.version.slice('link:'.length),
      ));
      const linked = graph.importers.get(linkedImporter);
      if (!linked) {
        throw new Error(`Unresolved workspace link ${current.importer} -> ${linkedImporter}`);
      }
      // Linked workspaces may depend on one another (or themselves).
      // Traverse each importer once to keep CI finite without skipping unique edges.
      if (visitedWorkspaceImporters.has(linkedImporter)) continue;
      visitedWorkspaceImporters.add(linkedImporter);
      for (const [name, version] of [...linked.dependencies, ...linked.optionalDependencies]) {
        queue.push({
          name, version, importer: linkedImporter, path: [...current.path, name],
        });
      }
      continue;
    }
    if (current.version.startsWith('workspace:')) {
      throw new Error(`Unresolved workspace dependency ${current.name}@${current.version}`);
    }

    const key = `${current.name}@${current.version}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (current.name === packageName) return { path: current.path, version: current.version };

    const dependencies = graph.snapshots.get(key);
    if (!dependencies) {
      throw new Error(`Missing lockfile snapshot for ${key} reachable from ${root}`);
    }
    for (const [name, version] of dependencies) {
      queue.push({ name, version, importer: current.importer, path: [...current.path, name] });
    }
  }
  return null;
}

export function verifyServerDependencyBoundary(lockfile) {
  const graph = parsePnpmDependencyGraph(lockfile);
  const violations = SERVER_APPS.flatMap((root) => {
    const trace = traceProductionDependency(graph, root, 'braces');
    return trace ? [{ app: root, ...trace }] : [];
  });
  const mobile = traceProductionDependency(graph, BUILD_TOOL_APP, 'braces');
  return { violations, mobile, serverApps: SERVER_APPS };
}

function main() {
  const lockfile = readFileSync(resolve('pnpm-lock.yaml'), 'utf8');
  const report = verifyServerDependencyBoundary(lockfile);
  for (const app of report.serverApps) {
    const violation = report.violations.find((entry) => entry.app === app);
    console.log(violation
      ? `FAIL ${app}: ${violation.path.join(' > ')}@${violation.version}`
      : `PASS ${app}: no braces in production dependency closure`);
  }
  if (report.mobile) {
    console.log(`KNOWN MOBILE BUILD-TOOL EXPOSURE: ${report.mobile.path.join(' > ')}@${report.mobile.version}`);
    console.log('This check does not waive the independent full-workspace vulnerability audit.');
  } else {
    console.log('Mobile production dependency closure does not include braces.');
  }
  if (report.violations.length) {
    console.error('Blocking release: braces entered a server production dependency graph.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
