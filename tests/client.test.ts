import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';
import { VikunjaApiError, VikunjaClient } from '../src/client.js';
import type { Config } from '../src/config.js';

interface SeenRequest {
  method?: string;
  url?: string;
  authorization?: string;
  contentType?: string;
  body: string;
}

async function collect(request: IncomingMessage): Promise<string> {
  let value = '';
  for await (const chunk of request) value += chunk;
  return value;
}

test('sends API v2 requests, query values, auth, and merge patches', async (context) => {
  const seen: SeenRequest[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    seen.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      contentType: request.headers['content-type'],
      body: await collect(request),
    });
    response.setHeader('content-type', 'application/json');
    if (request.method === 'GET') {
      response.end(JSON.stringify({ items: [{ id: 7 }], total: 1, page: 2, per_page: 5, total_pages: 1 }));
    } else {
      response.end(JSON.stringify({ id: 7, title: 'Updated' }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const address = server.address();
  assert(address && typeof address === 'object');

  const config: Config = {
    apiUrl: `http://127.0.0.1:${address.port}/api/v2`, apiToken: 'secret-test-token',
    verifySsl: true, requestTimeoutMs: 2_000,
    enableProjectDelete: false, enableLabelDelete: false,
    enableTaskDelete: false, enableNotificationDeleteAll: false,
  };
  const client = new VikunjaClient(config);

  const result = await client.list<{ id: number }>('/tasks', { page: 2, per_page: 5, expand: ['comments', 'subtasks'] });
  await client.patch('/tasks/7', { title: 'Updated' });

  assert.equal(result.items[0]?.id, 7);
  assert.equal(seen[0]?.url, '/api/v2/tasks?page=2&per_page=5&expand=comments&expand=subtasks');
  assert.equal(seen[0]?.authorization, 'Bearer secret-test-token');
  assert.equal(seen[1]?.contentType, 'application/merge-patch+json');
  assert.deepEqual(JSON.parse(seen[1]?.body ?? ''), { title: 'Updated' });
});

test('returns sanitized, structured API errors', async (context) => {
  const server = createServer((_request, response) => {
    response.statusCode = 403;
    response.setHeader('content-type', 'application/problem+json');
    response.end(JSON.stringify({ code: 4004, detail: 'Permission denied' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const address = server.address();
  assert(address && typeof address === 'object');

  const client = new VikunjaClient({
    apiUrl: `http://127.0.0.1:${address.port}/api/v2`, apiToken: 'must-not-leak',
    verifySsl: true, requestTimeoutMs: 2_000,
    enableProjectDelete: false, enableLabelDelete: false,
    enableTaskDelete: false, enableNotificationDeleteAll: false,
  });

  await assert.rejects(
    client.get('/projects'),
    (error: unknown) => error instanceof VikunjaApiError
      && error.status === 403
      && error.code === 4004
      && !error.message.includes('must-not-leak'),
  );
});
