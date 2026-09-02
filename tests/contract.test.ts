import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { API_OPERATIONS } from '../src/tools/index.js';

interface OpenApiDocument {
  info: { version: string };
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, unknown>>;
}

test('every MCP API operation exists in the bundled Vikunja 2.6 contract', async () => {
  const raw = await readFile(new URL('../docs/api-spec.json', import.meta.url), 'utf8');
  const document = JSON.parse(raw) as OpenApiDocument;

  assert.equal(document.info.version, 'v2.6.0');
  assert.deepEqual(document.servers, [{ url: '/api/v2' }]);

  const missing = API_OPERATIONS.filter(([method, path]) => !document.paths[path]?.[method.toLowerCase()]);
  assert.deepEqual(missing, []);
});

test('the operation contract has no duplicate method/path pairs', () => {
  const keys = API_OPERATIONS.map(([method, path]) => `${method} ${path}`);
  assert.equal(new Set(keys).size, keys.length);
});
