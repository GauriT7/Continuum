import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Count every API route file recursively, but ignore underscore-prefixed
// directories/files used for shared helpers (for example api/_lib).
const apiRoot = join(process.cwd(), 'api');
const entrypointExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);

function collectRoutes(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('_')) return [];
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return collectRoutes(fullPath);
    const extension = entry.name.slice(entry.name.lastIndexOf('.'));
    return entry.isFile() && entrypointExtensions.has(extension)
      ? [relative(apiRoot, fullPath).split(sep).join('/')]
      : [];
  });
}

const entrypoints = collectRoutes(apiRoot);

test('Vercel Hobby function budget stays at or below 10 entrypoints', () => {
  assert.ok(
    entrypoints.length <= 10,
    [
      `Found ${entrypoints.length} API entrypoints; the Continuum Hobby budget is 10.`,
      'Vercel Hobby permits at most 12 functions per deployment.',
      'Consolidate routes before adding more API entrypoints.',
      `Current entrypoints: ${entrypoints.join(', ')}`,
    ].join(' '),
  );
});
