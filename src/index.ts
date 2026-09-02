#!/usr/bin/env node
import { config as dotenvConfig } from 'dotenv';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createVikunjaServer, SERVER_VERSION } from './server.js';

export { VikunjaApiError, VikunjaClient } from './client.js';
export { loadConfig, normalizeVikunjaUrl } from './config.js';
export { createVikunjaServer } from './server.js';
export { API_OPERATIONS, PUBLIC_TOOL_NAMES } from './tools/index.js';
export type * from './types.js';

export async function main(): Promise<void> {
  if (!process.env.VIKUNJA_URL || !process.env.VIKUNJA_API_TOKEN) {
    dotenvConfig({ quiet: true });
  }

  const config = loadConfig();
  const { server } = createVikunjaServer(config);
  const transport = new StdioServerTransport();

  const shutDown = async (): Promise<void> => {
    await server.close();
  };
  process.once('SIGINT', () => void shutDown());
  process.once('SIGTERM', () => void shutDown());

  await server.connect(transport);
  console.error(`Vikunja MCP server ${SERVER_VERSION} connected over stdio (Vikunja API v2).`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Vikunja MCP server failed: ${message}`);
    process.exitCode = 1;
  });
}
