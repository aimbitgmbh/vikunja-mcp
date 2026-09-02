import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { VikunjaClient } from '../src/client.js';
import type { Config } from '../src/config.js';
import { createVikunjaServer } from '../src/server.js';

interface EvaluationCase {
  expected: string;
  prompt: string;
}

const cases: EvaluationCase[] = [
  { expected: 'tasks_list', prompt: 'Show my open Vikunja tasks in project 42, page 2.' },
  { expected: 'tasks_get', prompt: 'Fetch full details for Vikunja task ID 42.' },
  { expected: 'tasks_create', prompt: 'Create a Vikunja task titled Prepare launch in project ID 42.' },
  { expected: 'tasks_update', prompt: 'Change task ID 42 priority to 5 and its title to Urgent launch.' },
  { expected: 'tasks_complete', prompt: 'Mark Vikunja task ID 42 complete.' },
  { expected: 'tasks_delete', prompt: 'Permanently delete Vikunja task ID 42.' },
  { expected: 'tasks_bulk_update', prompt: 'Set priority 3 on task IDs 41, 42, and 43 in one operation.' },
  { expected: 'projects_list', prompt: 'List active Vikunja projects matching Website.' },
  { expected: 'projects_get', prompt: 'Get Vikunja project ID 42 with its details and views.' },
  { expected: 'projects_create', prompt: 'Create a new Vikunja project named Website relaunch.' },
  { expected: 'projects_update', prompt: 'Change the description of Vikunja project ID 42 to Public roadmap.' },
  { expected: 'projects_archive', prompt: 'Archive Vikunja project ID 42 without deleting it.' },
  { expected: 'projects_delete', prompt: 'Permanently delete Vikunja project ID 42.' },
  { expected: 'projects_duplicate', prompt: 'Duplicate Vikunja project ID 42, including its contents.' },
  { expected: 'labels_list', prompt: 'List Vikunja labels matching urgent.' },
  { expected: 'labels_get', prompt: 'Get details for Vikunja label ID 42.' },
  { expected: 'labels_create', prompt: 'Create a red Vikunja label named urgent.' },
  { expected: 'labels_update', prompt: 'Rename Vikunja label ID 42 to critical.' },
  { expected: 'labels_delete', prompt: 'Permanently delete Vikunja label ID 42.' },
  { expected: 'task_labels_add', prompt: 'Attach label ID 7 to task ID 42.' },
  { expected: 'task_labels_remove', prompt: 'Detach label ID 7 from task ID 42, without deleting either.' },
  { expected: 'task_labels_replace', prompt: 'Replace every label on task ID 42 with label IDs 7 and 8.' },
  { expected: 'task_comments_list', prompt: 'List all comments on Vikunja task ID 42.' },
  { expected: 'task_comments_get', prompt: 'Get comment ID 9 from Vikunja task ID 42.' },
  { expected: 'task_comments_create', prompt: 'Add the comment Looks good to Vikunja task ID 42.' },
  { expected: 'task_comments_update', prompt: 'Edit comment ID 9 on task ID 42 to say Approved.' },
  { expected: 'task_comments_delete', prompt: 'Delete comment ID 9 from task ID 42.' },
  { expected: 'task_assignees_list', prompt: 'List the users assigned to Vikunja task ID 42.' },
  { expected: 'task_assignees_add', prompt: 'Assign user ID 7 to Vikunja task ID 42.' },
  { expected: 'task_assignees_replace', prompt: 'Replace all assignees on task ID 42 with user IDs 7 and 8.' },
  { expected: 'task_assignees_remove', prompt: 'Unassign user ID 7 from Vikunja task ID 42.' },
  { expected: 'task_relations_create', prompt: 'Make Vikunja task ID 41 block task ID 42.' },
  { expected: 'task_relations_delete', prompt: 'Remove the blocking relation from task ID 41 to task ID 42.' },
  { expected: 'saved_filters_get', prompt: 'Get Vikunja saved filter ID 42.' },
  { expected: 'saved_filters_create', prompt: 'Create a Vikunja saved filter named Overdue work for overdue tasks.' },
  { expected: 'saved_filters_update', prompt: 'Rename Vikunja saved filter ID 42 to Due soon.' },
  { expected: 'saved_filters_delete', prompt: 'Delete Vikunja saved filter ID 42.' },
  { expected: 'notifications_list', prompt: 'List my Vikunja notifications.' },
  { expected: 'notifications_mark_read', prompt: 'Mark Vikunja notification ID 42 as read.' },
  { expected: 'notifications_mark_all_read', prompt: 'Mark all of my Vikunja notifications as read.' },
  { expected: 'notifications_delete_all', prompt: 'Permanently delete every Vikunja notification.' },
  { expected: 'project_views_list', prompt: 'List all views in Vikunja project ID 42.' },
  { expected: 'project_views_get', prompt: 'Get view ID 7 from Vikunja project ID 42.' },
  { expected: 'project_views_create', prompt: 'Create a kanban view named Delivery in Vikunja project ID 42.' },
  { expected: 'project_views_update', prompt: 'Rename view ID 7 in Vikunja project ID 42 to Planning.' },
  { expected: 'project_views_delete', prompt: 'Delete view ID 7 from Vikunja project ID 42.' },
  { expected: 'view_buckets_list', prompt: 'List kanban buckets for view ID 7 in Vikunja project ID 42.' },
  { expected: 'view_buckets_create', prompt: 'Create a kanban bucket named Review in view ID 7 of project ID 42.' },
  { expected: 'view_buckets_update', prompt: 'Rename bucket ID 9 in view ID 7 of project ID 42 to QA.' },
  { expected: 'view_buckets_delete', prompt: 'Delete bucket ID 9 from view ID 7 in project ID 42.' },
  { expected: 'vikunja_info', prompt: 'Which Vikunja server version am I connected to?' },
];

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function toolCatalog(): Promise<{ client: Client; tools: Awaited<ReturnType<Client['listTools']>>['tools']; close: () => Promise<void> }> {
  const config: Config = {
    apiUrl: 'https://vikunja.example.com/api/v2', apiToken: 'unused',
    verifySsl: true, requestTimeoutMs: 1_000,
    enableProjectDelete: false, enableLabelDelete: false,
    enableTaskDelete: false, enableNotificationDeleteAll: false,
  };
  const fakeClient = {} as VikunjaClient;
  const { server } = createVikunjaServer(config, fakeClient);
  const client = new Client({ name: 'qwen-eval', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  return { client, tools, close: async () => { await client.close(); await server.close(); } };
}

async function main(): Promise<void> {
  const baseUrl = required('LLM_BASE_URL').replace(/\/+$/, '');
  const apiKey = required('LLM_API_KEY');
  const model = required('LLM_MODEL');
  const limit = process.env.QWEN_EVAL_LIMIT ? Number(process.env.QWEN_EVAL_LIMIT) : cases.length;
  assert(Number.isInteger(limit) && limit > 0 && limit <= cases.length, 'QWEN_EVAL_LIMIT must select 1-51 cases.');
  const catalog = await toolCatalog();

  try {
    const tools = catalog.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));
    let passed = 0;
    for (const [index, evaluation] of cases.slice(0, limit).entries()) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 256,
          parallel_tool_calls: false,
          messages: [
            { role: 'system', content: 'Choose exactly one supplied tool that performs the user request. Return a tool call, not prose.' },
            { role: 'user', content: evaluation.prompt },
          ],
          tools,
          tool_choice: 'auto',
        }),
      });
      if (!response.ok) throw new Error(`LLM request failed with HTTP ${response.status}.`);
      const body = await response.json() as {
        choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
      };
      const selected = body.choices?.[0]?.message?.tool_calls?.[0]?.function?.name;
      const ok = selected === evaluation.expected;
      if (ok) passed += 1;
      console.log(`${index + 1}/${limit} ${ok ? 'PASS' : 'FAIL'} expected=${evaluation.expected} selected=${selected ?? 'none'}`);
    }

    console.log(`Qwen MCP tool-selection result: ${passed}/${limit} passed with model ${model}.`);
    if (passed !== limit) process.exitCode = 1;
  } finally {
    await catalog.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
