import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Vite emits root-absolute assets for nested public SPA routes', () => {
  const config = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(config, /base:\s*['"]\/['"]/);
  assert.doesNotMatch(config, /base:\s*['"]\.\/['"]/);
});
