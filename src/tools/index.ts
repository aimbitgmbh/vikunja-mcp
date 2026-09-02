import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { VikunjaClient } from '../client.js';
import type { Config } from '../config.js';
import { ADVANCED_API_OPERATIONS, registerAdvancedTools } from './advanced.js';
import { COLLABORATION_API_OPERATIONS, registerCollaborationTools } from './collaboration.js';
import { CORE_API_OPERATIONS, registerCoreTools } from './core.js';

export const PUBLIC_TOOL_NAMES = [
  'tasks_list',
  'tasks_get',
  'tasks_create',
  'tasks_update',
  'tasks_complete',
  'tasks_delete',
  'tasks_bulk_update',
  'projects_list',
  'projects_get',
  'projects_create',
  'projects_update',
  'projects_archive',
  'projects_delete',
  'projects_duplicate',
  'labels_list',
  'labels_get',
  'labels_create',
  'labels_update',
  'labels_delete',
  'task_labels_add',
  'task_labels_remove',
  'task_labels_replace',
  'task_comments_list',
  'task_comments_get',
  'task_comments_create',
  'task_comments_update',
  'task_comments_delete',
  'task_assignees_list',
  'task_assignees_add',
  'task_assignees_replace',
  'task_assignees_remove',
  'task_relations_create',
  'task_relations_delete',
  'saved_filters_get',
  'saved_filters_create',
  'saved_filters_update',
  'saved_filters_delete',
  'notifications_list',
  'notifications_mark_read',
  'notifications_mark_all_read',
  'notifications_delete_all',
  'project_views_list',
  'project_views_get',
  'project_views_create',
  'project_views_update',
  'project_views_delete',
  'view_buckets_list',
  'view_buckets_create',
  'view_buckets_update',
  'view_buckets_delete',
  'vikunja_info',
] as const;

export const API_OPERATIONS = [
  ...CORE_API_OPERATIONS,
  ...COLLABORATION_API_OPERATIONS,
  ...ADVANCED_API_OPERATIONS,
] as const;

export function registerAllTools(server: McpServer, client: VikunjaClient, config: Config): void {
  registerCoreTools(server, client, config);
  registerCollaborationTools(server, client);
  registerAdvancedTools(server, client, config);
}

export {
  registerAdvancedTools,
  registerCollaborationTools,
  registerCoreTools,
};
