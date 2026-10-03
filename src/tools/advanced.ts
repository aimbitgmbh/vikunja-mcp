import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { VikunjaClient } from '../client.js';
import type { Config } from '../config.js';
import type { Bucket, Notification, ProjectView, SavedFilter, ServerInfo } from '../types.js';
import { compactBucket, compactNotification } from './helpers.js';
import {
  DESTRUCTIVE,
  IDEMPOTENT_WRITE,
  IdSchema,
  PageSchema,
  PerPageSchema,
  READ_ONLY,
  WRITE,
  pagination,
  registerJsonTool,
  requireChange,
  withoutUndefined,
} from './common.js';

const FilterCriteriaSchema = z.object({
  filter: z.string().optional(),
  search: z.string().optional(),
  filterIncludeNulls: z.boolean().optional(),
  filterTimezone: z.string().optional(),
  sortBy: z.array(z.string()).optional(),
  orderBy: z.array(z.enum(['asc', 'desc'])).optional(),
}).strict();
const SavedFilterGetSchema = z.object({ filterId: IdSchema }).strict();
const SavedFilterCreateSchema = z.object({
  title: z.string().min(1).max(250),
  description: z.string().optional(),
  isFavorite: z.boolean().optional(),
  criteria: FilterCriteriaSchema.optional(),
}).strict();
const SavedFilterUpdateSchema = z.object({
  filterId: IdSchema,
  title: z.string().min(1).max(250).optional(),
  description: z.string().optional(),
  isFavorite: z.boolean().optional(),
  criteria: FilterCriteriaSchema.optional(),
}).strict();

function criteriaBody(criteria: z.output<typeof FilterCriteriaSchema> | undefined): Record<string, unknown> | undefined {
  if (!criteria) return undefined;
  return withoutUndefined({
    filter: criteria.filter,
    s: criteria.search,
    filter_include_nulls: criteria.filterIncludeNulls,
    filter_timezone: criteria.filterTimezone,
    sort_by: criteria.sortBy,
    order_by: criteria.orderBy,
  });
}

function savedFilterBody(args: {
  title?: string;
  description?: string;
  isFavorite?: boolean;
  criteria?: z.output<typeof FilterCriteriaSchema>;
}): Record<string, unknown> {
  return withoutUndefined({
    title: args.title,
    description: args.description,
    is_favorite: args.isFavorite,
    filters: criteriaBody(args.criteria),
  });
}

function compactSavedFilter(filter: SavedFilter): Record<string, unknown> {
  return {
    id: filter.id,
    title: filter.title,
    description: filter.description,
    isFavorite: filter.is_favorite,
    criteria: filter.filters,
    owner: filter.owner && { id: filter.owner.id, username: filter.owner.username, name: filter.owner.name },
    created: filter.created,
    updated: filter.updated,
  };
}

export function registerSavedFilterTools(server: McpServer, client: VikunjaClient): void {
  registerJsonTool(server, {
    name: 'saved_filters_get', title: 'Get a saved filter', description: 'Get a saved task filter by ID.',
    inputSchema: SavedFilterGetSchema, annotations: READ_ONLY,
  }, async ({ filterId }) => {
    const filter = await client.get<SavedFilter>(`/filters/${filterId}`, { format: 'markdown' });
    return { message: `Saved filter ${filter.id}: ${filter.title}`, data: compactSavedFilter(filter) };
  });

  registerJsonTool(server, {
    name: 'saved_filters_create', title: 'Create a saved filter', description: 'Create a reusable task filter.',
    inputSchema: SavedFilterCreateSchema, annotations: WRITE,
  }, async (args) => {
    const filter = await client.post<SavedFilter>('/filters', savedFilterBody(args), { format: 'markdown' });
    return { message: `Created saved filter ${filter.id}: ${filter.title}`, data: compactSavedFilter(filter) };
  });

  registerJsonTool(server, {
    name: 'saved_filters_update', title: 'Update a saved filter', description: 'Partially update a saved task filter.',
    inputSchema: SavedFilterUpdateSchema, annotations: IDEMPOTENT_WRITE,
  }, async (args) => {
    const { filterId, ...fields } = args;
    requireChange(fields, []);
    const filter = await client.patch<SavedFilter>(`/filters/${filterId}`, savedFilterBody(fields), { format: 'markdown' });
    return { message: `Updated saved filter ${filter.id}: ${filter.title}`, data: compactSavedFilter(filter) };
  });

  registerJsonTool(server, {
    name: 'saved_filters_delete', title: 'Delete a saved filter', description: 'Permanently delete a saved task filter.',
    inputSchema: SavedFilterGetSchema, annotations: DESTRUCTIVE,
  }, async ({ filterId }) => {
    await client.delete(`/filters/${filterId}`);
    return { message: `Deleted saved filter ${filterId}.`, data: { filterId } };
  });
}

const NotificationsListSchema = z.object({
  search: z.string().min(1).optional(),
  page: PageSchema,
  perPage: PerPageSchema,
}).strict();
const NotificationMarkSchema = z.object({ notificationId: IdSchema, read: z.boolean().default(true) }).strict();
const EmptySchema = z.object({}).strict();

export function registerNotificationTools(server: McpServer, client: VikunjaClient, config: Config): void {
  registerJsonTool(server, {
    name: 'notifications_list', title: 'List notifications', description: 'List the current user’s notifications with pagination.',
    inputSchema: NotificationsListSchema, annotations: READ_ONLY,
  }, async (args) => {
    const result = await client.list<Notification>('/notifications', {
      page: args.page, per_page: args.perPage, q: args.search,
    });
    return {
      message: `Found ${result.total} notification(s).`,
      items: result.items.map(compactNotification),
      pagination: pagination(result),
    };
  });

  registerJsonTool(server, {
    name: 'notifications_mark_read', title: 'Mark a notification read or unread',
    description: 'Set one notification’s read state.',
    inputSchema: NotificationMarkSchema, annotations: IDEMPOTENT_WRITE,
  }, async ({ notificationId, read }) => {
    const notification = await client.put<Notification>(`/notifications/${notificationId}`, { read });
    return { message: `Marked notification ${notificationId} ${read ? 'read' : 'unread'}.`, data: compactNotification(notification) };
  });

  registerJsonTool(server, {
    name: 'notifications_mark_all_read', title: 'Mark all notifications read',
    description: 'Mark every notification belonging to the current user as read.',
    inputSchema: EmptySchema, annotations: IDEMPOTENT_WRITE,
  }, async () => {
    const result = await client.post<{ message?: string }>('/notifications');
    return { message: 'Marked all notifications as read.', data: result };
  });

  registerJsonTool(server, {
    name: 'notifications_delete_all', title: 'Delete all notifications',
    description: 'Delete every notification only when ENABLE_NOTIFICATION_DELETE_ALL=true.',
    inputSchema: EmptySchema, annotations: DESTRUCTIVE,
  }, async () => {
    if (!config.enableNotificationDeleteAll) {
      throw new Error('Deleting all notifications is disabled by ENABLE_NOTIFICATION_DELETE_ALL.');
    }
    await client.delete('/notifications');
    return { message: 'Deleted all notifications.', data: { deletedAll: true } };
  });
}

const ViewListSchema = z.object({
  projectId: IdSchema,
  search: z.string().min(1).optional(),
  page: PageSchema,
  perPage: PerPageSchema,
}).strict();
const ViewGetSchema = z.object({ projectId: IdSchema, viewId: IdSchema }).strict();
const ViewFields = {
  title: z.string().min(1).max(250).optional(),
  viewKind: z.enum(['list', 'gantt', 'table', 'kanban']).optional(),
  position: z.number().min(0).optional(),
  filter: z.string().optional(),
  bucketConfigurationMode: z.enum(['none', 'manual', 'filter']).optional(),
  defaultBucketId: IdSchema.optional(),
  doneBucketId: IdSchema.optional(),
};
const ViewCreateSchema = z.object({
  projectId: IdSchema,
  title: z.string().min(1).max(250),
  viewKind: z.enum(['list', 'gantt', 'table', 'kanban']),
  position: ViewFields.position,
  filter: ViewFields.filter,
  bucketConfigurationMode: ViewFields.bucketConfigurationMode,
}).strict();
const ViewUpdateSchema = z.object({ projectId: IdSchema, viewId: IdSchema, ...ViewFields }).strict();

function viewBody(fields: Omit<z.output<typeof ViewUpdateSchema>, 'projectId' | 'viewId'>): Record<string, unknown> {
  return withoutUndefined({
    title: fields.title,
    view_kind: fields.viewKind,
    position: fields.position,
    filter: fields.filter === undefined ? undefined : { filter: fields.filter },
    bucket_configuration_mode: fields.bucketConfigurationMode,
    default_bucket_id: fields.defaultBucketId,
    done_bucket_id: fields.doneBucketId,
  });
}

function compactView(view: ProjectView): Record<string, unknown> {
  return {
    id: view.id,
    projectId: view.project_id,
    title: view.title,
    viewKind: view.view_kind,
    position: view.position,
    filter: view.filter,
    bucketConfigurationMode: view.bucket_configuration_mode,
    defaultBucketId: view.default_bucket_id,
    doneBucketId: view.done_bucket_id,
    created: view.created,
    updated: view.updated,
  };
}

export function registerViewTools(server: McpServer, client: VikunjaClient): void {
  registerJsonTool(server, {
    name: 'project_views_list', title: 'List project views', description: 'List the list, table, gantt, and kanban views in a project.',
    inputSchema: ViewListSchema, annotations: READ_ONLY,
  }, async (args) => {
    const result = await client.list<ProjectView>(`/projects/${args.projectId}/views`, {
      page: args.page, per_page: args.perPage, q: args.search,
    });
    return {
      message: `Found ${result.total} view(s) in project ${args.projectId}.`,
      items: result.items.map(compactView),
      pagination: pagination(result),
    };
  });

  registerJsonTool(server, {
    name: 'project_views_get', title: 'Get a project view', description: 'Get one project view by project and view ID.',
    inputSchema: ViewGetSchema, annotations: READ_ONLY,
  }, async ({ projectId, viewId }) => {
    const view = await client.get<ProjectView>(`/projects/${projectId}/views/${viewId}`);
    return { message: `View ${view.id}: ${view.title}`, data: compactView(view) };
  });

  registerJsonTool(server, {
    name: 'project_views_create', title: 'Create a project view', description: 'Create a list, table, gantt, or kanban view in a project.',
    inputSchema: ViewCreateSchema, annotations: WRITE,
  }, async (args) => {
    const { projectId, ...fields } = args;
    const mode = fields.bucketConfigurationMode ?? (fields.viewKind === 'kanban' ? 'manual' : 'none');
    const view = await client.post<ProjectView>(`/projects/${projectId}/views`, viewBody({
      ...fields, bucketConfigurationMode: mode,
    }));
    return { message: `Created view ${view.id}: ${view.title}`, data: compactView(view) };
  });

  registerJsonTool(server, {
    name: 'project_views_update', title: 'Update a project view', description: 'Partially update a project view.',
    inputSchema: ViewUpdateSchema, annotations: IDEMPOTENT_WRITE,
  }, async (args) => {
    const { projectId, viewId, ...fields } = args;
    requireChange(fields, []);
    const view = await client.patch<ProjectView>(`/projects/${projectId}/views/${viewId}`, viewBody(fields));
    return { message: `Updated view ${view.id}: ${view.title}`, data: compactView(view) };
  });

  registerJsonTool(server, {
    name: 'project_views_delete', title: 'Delete a project view', description: 'Delete a project view; the project must retain a usable view.',
    inputSchema: ViewGetSchema, annotations: DESTRUCTIVE,
  }, async ({ projectId, viewId }) => {
    await client.delete(`/projects/${projectId}/views/${viewId}`);
    return { message: `Deleted view ${viewId} from project ${projectId}.`, data: { projectId, viewId } };
  });
}

const BucketListSchema = z.object({
  projectId: IdSchema,
  viewId: IdSchema,
  search: z.string().min(1).optional(),
  page: PageSchema,
  perPage: PerPageSchema,
}).strict();
const BucketGetSchema = z.object({ projectId: IdSchema, viewId: IdSchema, bucketId: IdSchema }).strict();
const BucketCreateSchema = z.object({
  projectId: IdSchema,
  viewId: IdSchema,
  title: z.string().min(1).max(250),
  limit: z.number().int().min(0).optional(),
  position: z.number().min(0).optional(),
}).strict();
const BucketUpdateSchema = z.object({
  projectId: IdSchema,
  viewId: IdSchema,
  bucketId: IdSchema,
  title: z.string().min(1).max(250).optional(),
  limit: z.number().int().min(0).optional(),
  position: z.number().min(0).optional(),
}).strict();
const BucketMoveTaskSchema = z.object({
  projectId: IdSchema,
  viewId: IdSchema,
  bucketId: IdSchema,
  taskId: IdSchema,
}).strict();

export function registerBucketTools(server: McpServer, client: VikunjaClient): void {
  registerJsonTool(server, {
    name: 'view_buckets_list', title: 'List kanban buckets', description: 'List buckets in a manual kanban view.',
    inputSchema: BucketListSchema, annotations: READ_ONLY,
  }, async (args) => {
    const result = await client.list<Bucket>(`/projects/${args.projectId}/views/${args.viewId}/buckets`, {
      page: args.page, per_page: args.perPage, q: args.search,
    });
    return {
      message: `Found ${result.total} bucket(s) in view ${args.viewId}.`,
      items: result.items.map(compactBucket),
      pagination: pagination(result),
    };
  });

  registerJsonTool(server, {
    name: 'view_buckets_create', title: 'Create a kanban bucket', description: 'Create a bucket in a manual kanban view.',
    inputSchema: BucketCreateSchema, annotations: WRITE,
  }, async ({ projectId, viewId, ...fields }) => {
    const bucket = await client.post<Bucket>(`/projects/${projectId}/views/${viewId}/buckets`, withoutUndefined(fields));
    return { message: `Created bucket ${bucket.id}: ${bucket.title}`, data: compactBucket(bucket) };
  });

  registerJsonTool(server, {
    name: 'view_buckets_update', title: 'Update a kanban bucket', description: 'Rename, reposition, or change the WIP limit of a bucket.',
    inputSchema: BucketUpdateSchema, annotations: IDEMPOTENT_WRITE,
  }, async ({ projectId, viewId, bucketId, ...fields }) => {
    requireChange(fields, []);
    const bucket = await client.put<Bucket>(`/projects/${projectId}/views/${viewId}/buckets/${bucketId}`, withoutUndefined(fields));
    return { message: `Updated bucket ${bucket.id}: ${bucket.title}`, data: compactBucket(bucket) };
  });

  registerJsonTool(server, {
    name: 'view_buckets_delete', title: 'Delete a kanban bucket', description: 'Delete a bucket; Vikunja prevents deletion of the final bucket.',
    inputSchema: BucketGetSchema, annotations: DESTRUCTIVE,
  }, async ({ projectId, viewId, bucketId }) => {
    await client.delete(`/projects/${projectId}/views/${viewId}/buckets/${bucketId}`);
    return { message: `Deleted bucket ${bucketId} from view ${viewId}.`, data: { projectId, viewId, bucketId } };
  });

  registerJsonTool(server, {
    name: 'view_buckets_move_task', title: 'Move a task to a kanban bucket',
    description: 'Move a task into a bucket of a manual kanban view.',
    inputSchema: BucketMoveTaskSchema, annotations: IDEMPOTENT_WRITE,
  }, async ({ projectId, viewId, bucketId, taskId }) => {
    await client.put(`/projects/${projectId}/views/${viewId}/buckets/${bucketId}/tasks`, { task_id: taskId });
    return { message: `Moved task ${taskId} to bucket ${bucketId} in view ${viewId}.`, data: { projectId, viewId, bucketId, taskId } };
  });
}

export function registerInfoTool(server: McpServer, client: VikunjaClient): void {
  registerJsonTool(server, {
    name: 'vikunja_info', title: 'Get Vikunja server information',
    description: 'Get the connected Vikunja version and enabled server capabilities.',
    inputSchema: z.object({}).strict(), annotations: READ_ONLY,
  }, async () => {
    const info = await client.get<ServerInfo>('/info');
    return { message: `Connected to Vikunja ${info.version}.`, data: info };
  });
}

export function registerAdvancedTools(server: McpServer, client: VikunjaClient, config: Config): void {
  registerSavedFilterTools(server, client);
  registerNotificationTools(server, client, config);
  registerViewTools(server, client);
  registerBucketTools(server, client);
  registerInfoTool(server, client);
}

export const ADVANCED_API_OPERATIONS = [
  ['GET', '/filters/{filter}'], ['POST', '/filters'], ['PATCH', '/filters/{filter}'], ['DELETE', '/filters/{filter}'],
  ['GET', '/notifications'], ['PUT', '/notifications/{notificationid}'], ['POST', '/notifications'], ['DELETE', '/notifications'],
  ['GET', '/projects/{project}/views'], ['GET', '/projects/{project}/views/{view}'],
  ['POST', '/projects/{project}/views'], ['PATCH', '/projects/{project}/views/{view}'],
  ['DELETE', '/projects/{project}/views/{view}'],
  ['GET', '/projects/{project}/views/{view}/buckets'], ['POST', '/projects/{project}/views/{view}/buckets'],
  ['PUT', '/projects/{project}/views/{view}/buckets/{bucket}'], ['DELETE', '/projects/{project}/views/{view}/buckets/{bucket}'],
  ['PUT', '/projects/{project}/views/{view}/buckets/{bucket}/tasks'],
  ['GET', '/info'],
] as const;
