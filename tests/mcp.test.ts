import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { VikunjaClient } from '../src/client.js';
import type { Config } from '../src/config.js';
import { createVikunjaServer } from '../src/server.js';
import { PUBLIC_TOOL_NAMES } from '../src/tools/index.js';

const config: Config = {
  apiUrl: 'https://vikunja.example.com/api/v2', apiToken: 'test-token',
  verifySsl: true, requestTimeoutMs: 1_000,
  enableProjectDelete: false, enableLabelDelete: false,
  enableTaskDelete: false, enableNotificationDeleteAll: false,
};

test('publishes the complete, unique tool catalog', async (context) => {
  const fakeClient = {
    get: async () => ({ version: 'v2.6.0' }),
  } as unknown as VikunjaClient;
  const { server } = createVikunjaServer(config, fakeClient);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  context.after(async () => {
    await client.close();
    await server.close();
  });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.listTools();
  const names = result.tools.map((tool) => tool.name);

  assert.equal(names.length, 51);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(names, [...PUBLIC_TOOL_NAMES]);
  for (const tool of result.tools) {
    assert(tool.description);
    assert.equal(tool.inputSchema.type, 'object');
    assert(tool.annotations);
    // Claude Desktop rejects the SDK's draft-07 output schemas (issue #3).
    assert.equal(tool.outputSchema, undefined, `${tool.name} must omit outputSchema`);
  }

  const info = await client.callTool({ name: 'vikunja_info', arguments: {} });
  assert.equal(info.isError, undefined);
  assert.deepEqual(info.structuredContent, {
    message: 'Connected to Vikunja v2.6.0.',
    data: { version: 'v2.6.0' },
  });
  assert.deepEqual(info.content, [{
    type: 'text',
    text: 'Connected to Vikunja v2.6.0.\n\n{\n  "version": "v2.6.0"\n}',
  }]);
});

test('returns paginated structured output and tool errors without outputSchema', async (context) => {
  const fakeClient = {
    list: async () => ({ items: [], page: 1, per_page: 50, total: 0, total_pages: 0 }),
    get: async () => { throw new Error('Permission denied'); },
  } as unknown as VikunjaClient;
  const { server } = createVikunjaServer(config, fakeClient);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  context.after(async () => {
    await client.close();
    await server.close();
  });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  await client.listTools();

  const tasks = await client.callTool({ name: 'tasks_list', arguments: {} });
  assert.equal(tasks.isError, undefined);
  assert.deepEqual(tasks.structuredContent, {
    message: 'Found 0 task(s).',
    items: [],
    pagination: { page: 1, perPage: 50, total: 0, totalPages: 0 },
  });
  assert.deepEqual(tasks.content, [{
    type: 'text',
    text: `Found 0 task(s).\n\n${JSON.stringify({
      items: [],
      pagination: { page: 1, perPage: 50, total: 0, totalPages: 0 },
    }, null, 2)}`,
  }]);

  const failed = await client.callTool({ name: 'vikunja_info', arguments: {} });
  assert.equal(failed.isError, true);
  assert.equal(failed.structuredContent, undefined);
  assert.deepEqual(failed.content, [{ type: 'text', text: 'Error: Permission denied' }]);

  const invalid = await client.callTool({ name: 'tasks_get', arguments: { id: -1 } });
  assert.equal(invalid.isError, true);
  assert.match(JSON.stringify(invalid.content), /Input validation error/);
});
