import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import packageJson from '../package.json';
import { VikunjaClient } from './client.js';
import type { Config } from './config.js';
import { registerAllTools } from './tools/index.js';

export const SERVER_VERSION = packageJson.version;

export interface VikunjaServer {
  server: McpServer;
  client: VikunjaClient;
}

export function createVikunjaServer(
  config: Config,
  client = new VikunjaClient(config),
): VikunjaServer {
  const server = new McpServer(
    {
      name: 'vikunja-mcp',
      version: SERVER_VERSION,
    },
    {
      capabilities: { tools: {} },
      instructions: [
        'Use list tools to find numeric Vikunja IDs before calling tools that require them.',
        'Treat create, update, archive, assignment, relation, and deletion tools as external side effects.',
        'Deletion tools may be disabled by server configuration; never invent IDs.',
      ].join(' '),
    },
  );

  registerAllTools(server, client, config);
  return { server, client };
}
