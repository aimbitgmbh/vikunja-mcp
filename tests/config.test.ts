import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig, normalizeVikunjaUrl } from '../src/config.js';

test('normalizes instance roots and legacy API URLs to API v2', () => {
  assert.equal(normalizeVikunjaUrl('https://vikunja.example.com/'), 'https://vikunja.example.com/api/v2');
  assert.equal(normalizeVikunjaUrl('https://vikunja.example.com/api/v1'), 'https://vikunja.example.com/api/v2');
  assert.equal(normalizeVikunjaUrl('https://vikunja.example.com/api/v2/'), 'https://vikunja.example.com/api/v2');
  assert.equal(normalizeVikunjaUrl('https://example.com/vikunja'), 'https://example.com/vikunja/api/v2');
});

test('uses safe connection and deletion defaults', () => {
  const config = loadConfig({
    VIKUNJA_URL: 'https://vikunja.example.com',
    VIKUNJA_API_TOKEN: 'test-token',
  });

  assert.equal(config.verifySsl, true);
  assert.equal(config.requestTimeoutMs, 30_000);
  assert.equal(config.enableTaskDelete, false);
  assert.equal(config.enableProjectDelete, false);
  assert.equal(config.enableLabelDelete, false);
  assert.equal(config.enableNotificationDeleteAll, false);
});

test('parses explicit booleans and rejects incomplete configuration', () => {
  const config = loadConfig({
    VIKUNJA_URL: 'http://localhost:3456/api/v1',
    VIKUNJA_API_TOKEN: 'test-token',
    VERIFY_SSL: 'false',
    ENABLE_TASK_DELETE: 'true',
  });

  assert.equal(config.apiUrl, 'http://localhost:3456/api/v2');
  assert.equal(config.verifySsl, false);
  assert.equal(config.enableTaskDelete, true);
  assert.throws(() => loadConfig({}), /VIKUNJA_URL.*VIKUNJA_API_TOKEN/);
});
