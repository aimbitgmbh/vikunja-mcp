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

test('publishes the complete, unique 1.0.0 tool catalog', async (context) => {
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
    assert(tool.outputSchema);
  }

  const info = await client.callTool({ name: 'vikunja_info', arguments: {} });
  assert.equal(info.isError, undefined);
  assert.deepEqual(info.structuredContent, {
    message: 'Connected to Vikunja v2.6.0.',
    data: { version: 'v2.6.0' },
  });
});
