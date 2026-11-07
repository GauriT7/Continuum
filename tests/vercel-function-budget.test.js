import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// Vercel's Vite-style project convention treats root-level files in api/
// as individual Serverless Function entrypoints. Underscore-prefixed
// directories (for example api/_lib) are shared code, not route entrypoints.
const apiRoot = join(process.cwd(), 'api');
const entrypointExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);
const entrypoints = readdirSync(apiRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => !name.startsWith('_'))
  .filter((name) => entrypointExtensions.has(name.slice(name.lastIndexOf('.'))));

test('Vercel Hobby function budget stays at or below 10 entrypoints', () => {
  assert.ok(
    entrypoints.length <= 10,
    [
      `Found ${entrypoints.length} root API entrypoints; the Continuum Hobby budget is 10.`,
      'Vercel Hobby permits at most 12 functions per deployment.',
      'Consolidate routes before adding more API entrypoints.',
      `Current entrypoints: ${entrypoints.join(', ')}`,
    ].join(' '),
  );
});
