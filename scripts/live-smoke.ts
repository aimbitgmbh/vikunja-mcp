import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { VikunjaClient } from '../src/client.js';
import { loadConfig } from '../src/config.js';
import { createVikunjaServer } from '../src/server.js';

interface StructuredResult {
  message?: string;
  data?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
}

async function main(): Promise<void> {
  const base = loadConfig();
  const config = {
    ...base,
    enableTaskDelete: true,
    enableProjectDelete: true,
    enableLabelDelete: true,
  };
  const api = new VikunjaClient(config);
  const { server } = createVikunjaServer(config, api);
  const mcp = new Client({ name: 'vikunja-live-smoke', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);

  const prefix = `mcp-v1-smoke-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
  const cleanup: Array<() => Promise<unknown>> = [];
  const call = async (name: string, arguments_: Record<string, unknown>): Promise<StructuredResult> => {
    const result = await mcp.callTool({ name, arguments: arguments_ }) as CallToolResult;
    if (result.isError) {
      const text = result.content.find((item) => item.type === 'text');
      throw new Error(`${name} failed: ${text?.type === 'text' ? text.text : 'unknown MCP error'}`);
    }
    console.log(`PASS ${name}`);
    return result.structuredContent as StructuredResult;
  };

  try {
    const info = await call('vikunja_info', {});
    assert.match(String(info.data?.version), /^v?2\.6\./);
    await call('projects_list', { search: prefix, status: 'all' });

    const project = await call('projects_create', { title: prefix, description: 'Temporary MCP 1.0.0 live smoke project' });
    const projectId = Number(project.data?.id);
    assert(projectId > 0);
    cleanup.push(() => api.delete(`/projects/${projectId}`).catch(() => undefined));
    await call('projects_get', { id: projectId });
    await call('projects_update', { id: projectId, description: 'Updated by MCP live smoke' });

    const taskOne = await call('tasks_create', { projectId, title: `${prefix}-task-one`, priority: 1 });
    const taskOneId = Number(taskOne.data?.id);
    assert(taskOneId > 0);
    await call('tasks_get', { id: taskOneId, expand: ['comments'] });
    await call('tasks_update', { id: taskOneId, progressPercent: 25, priority: 2 });
    await call('tasks_list', { projectId, status: 'all', search: prefix });

    const taskTwo = await call('tasks_create', { projectId, title: `${prefix}-task-two` });
    const taskTwoId = Number(taskTwo.data?.id);
    assert(taskTwoId > 0);
    await call('tasks_bulk_update', { taskIds: [taskOneId, taskTwoId], values: { priority: 3 } });

    const label = await call('labels_create', { title: prefix, hexColor: 'd946ef' });
    const labelId = Number(label.data?.id);
    assert(labelId > 0);
    cleanup.push(() => api.delete(`/labels/${labelId}`).catch(() => undefined));
    await call('labels_get', { id: labelId });
    await call('labels_update', { id: labelId, description: 'Updated by MCP live smoke' });
    await call('labels_list', { search: prefix });
    await call('task_labels_add', { taskId: taskOneId, labelId });
    await call('task_labels_replace', { taskId: taskOneId, labelIds: [labelId] });
    await call('task_labels_remove', { taskId: taskOneId, labelId });

    const comment = await call('task_comments_create', { taskId: taskOneId, comment: `${prefix} comment` });
    const commentId = Number(comment.data?.id);
    assert(commentId > 0);
    await call('task_comments_list', { taskId: taskOneId });
    await call('task_comments_get', { taskId: taskOneId, commentId });
    await call('task_comments_update', { taskId: taskOneId, commentId, comment: `${prefix} updated comment` });
    await call('task_comments_delete', { taskId: taskOneId, commentId });

    const user = await api.get<{ id: number }>('/user');
    await call('task_assignees_add', { taskId: taskOneId, userId: user.id });
    await call('task_assignees_list', { taskId: taskOneId });
    await call('task_assignees_replace', { taskId: taskOneId, userIds: [user.id] });
    await call('task_assignees_remove', { taskId: taskOneId, userId: user.id });

    await call('task_relations_create', { taskId: taskOneId, otherTaskId: taskTwoId, relationKind: 'blocking' });
    await call('task_relations_delete', { taskId: taskOneId, otherTaskId: taskTwoId, relationKind: 'blocking' });
    const filter = await call('saved_filters_create', {
      title: prefix,
      criteria: { filter: 'done = false', sortBy: ['priority'], orderBy: ['desc'] },
    });
    const filterId = Number(filter.data?.id);
    assert(filterId > 0);
    cleanup.push(() => api.delete(`/filters/${filterId}`).catch(() => undefined));
    await call('saved_filters_get', { filterId });
    await call('saved_filters_update', { filterId, description: 'Updated by MCP live smoke' });
    await call('saved_filters_delete', { filterId });
    cleanup.pop();

    await call('notifications_list', { perPage: 5 });
    const views = await call('project_views_list', { projectId });
    assert((views.items?.length ?? 0) > 0);
    const view = await call('project_views_create', {
      projectId, title: `${prefix}-kanban`, viewKind: 'kanban', bucketConfigurationMode: 'manual',
    });
    const viewId = Number(view.data?.id);
    assert(viewId > 0);
    await call('project_views_get', { projectId, viewId });
    await call('project_views_update', { projectId, viewId, title: `${prefix}-board` });

    const bucketOne = await call('view_buckets_create', { projectId, viewId, title: `${prefix}-one` });
    const bucketOneId = Number(bucketOne.data?.id);
    assert(bucketOneId > 0);
    const bucketTwo = await call('view_buckets_create', { projectId, viewId, title: `${prefix}-two` });
    const bucketTwoId = Number(bucketTwo.data?.id);
    assert(bucketTwoId > 0);
    await call('view_buckets_list', { projectId, viewId });
    await call('view_buckets_update', { projectId, viewId, bucketId: bucketOneId, title: `${prefix}-updated` });
    await call('view_buckets_delete', { projectId, viewId, bucketId: bucketTwoId });
    await call('project_views_delete', { projectId, viewId });

    await call('tasks_complete', { id: taskOneId });
    await call('tasks_delete', { id: taskTwoId });

    const duplicate = await call('projects_duplicate', { id: projectId });
    const duplicatedProjectId = Number(duplicate.data?.id);
    assert(duplicatedProjectId > 0);
    cleanup.push(() => api.delete(`/projects/${duplicatedProjectId}`).catch(() => undefined));
    await call('projects_delete', { id: duplicatedProjectId });
    cleanup.pop();

    await call('projects_archive', { id: projectId });
    await call('projects_update', { id: projectId, isArchived: false });
    await call('labels_delete', { id: labelId });
    cleanup.pop();
    await call('projects_delete', { id: projectId });
    cleanup.pop();

    console.log(`Live MCP CRUD smoke test completed for ${prefix}.`);
  } finally {
    for (const remove of cleanup.reverse()) await remove();
    await mcp.close();
    await server.close();
    await api.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
