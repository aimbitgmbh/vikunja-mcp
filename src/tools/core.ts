import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { VikunjaClient } from '../client.js';
import type { Config } from '../config.js';
import type { Label, Project, Task } from '../types.js';
import {
  compactLabel,
  compactProject,
  compactTask,
  normalizeHexColor,
  parseDate,
  progressToFraction,
} from './helpers.js';
import {
  DateSchema,
  DESTRUCTIVE,
  HexColorSchema,
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

const TaskListSchema = z.object({
  projectId: IdSchema.optional().describe('Restrict results to a project.'),
  viewId: IdSchema.optional().describe('Restrict results to a project view; requires projectId.'),
  status: z.enum(['open', 'done', 'all']).default('open'),
  search: z.string().min(1).optional(),
  filter: z.string().min(1).optional().describe('Advanced Vikunja filter expression.'),
  filterTimezone: z.string().min(1).optional(),
  sortBy: z.string().min(1).optional(),
  sortDirection: z.enum(['asc', 'desc']).default('asc'),
  page: PageSchema,
  perPage: PerPageSchema,
}).strict().superRefine((value, context) => {
  if (value.viewId !== undefined && value.projectId === undefined) {
    context.addIssue({ code: 'custom', path: ['projectId'], message: 'projectId is required with viewId.' });
  }
});

const TaskGetSchema = z.object({
  id: IdSchema,
  expand: z.array(z.enum([
    'subtasks', 'buckets', 'reactions', 'comments', 'comment_count', 'time_entries_count', 'is_unread',
  ])).optional(),
}).strict();

const TaskFields = {
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  done: z.boolean().optional(),
  dueDate: DateSchema.optional(),
  startDate: DateSchema.optional(),
  endDate: DateSchema.optional(),
  priority: z.number().int().min(0).max(5).optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  projectId: IdSchema.optional().describe('Move the task to another project.'),
  hexColor: HexColorSchema.optional(),
  isFavorite: z.boolean().optional(),
  repeatAfter: z.number().int().min(0).optional(),
  repeatMode: z.number().int().min(0).max(2).optional(),
};

const TaskCreateSchema = z.object({
  projectId: IdSchema,
  title: z.string().min(1),
  description: TaskFields.description,
  dueDate: TaskFields.dueDate,
  startDate: TaskFields.startDate,
  endDate: TaskFields.endDate,
  priority: TaskFields.priority,
  progressPercent: TaskFields.progressPercent,
  hexColor: TaskFields.hexColor,
  isFavorite: TaskFields.isFavorite,
  repeatAfter: TaskFields.repeatAfter,
  repeatMode: TaskFields.repeatMode,
}).strict();

const TaskUpdateSchema = z.object({ id: IdSchema, ...TaskFields }).strict();
const TaskIdSchema = z.object({ id: IdSchema }).strict();

const BulkTaskValuesSchema = z.object({ ...TaskFields }).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  'Provide at least one value to update.',
);
const TaskBulkUpdateSchema = z.object({
  taskIds: z.array(IdSchema).min(1).max(500),
  values: BulkTaskValuesSchema,
}).strict();

function taskBody(fields: z.output<typeof BulkTaskValuesSchema>): Record<string, unknown> {
  return withoutUndefined({
    title: fields.title,
    description: fields.description,
    done: fields.done,
    due_date: parseDate(fields.dueDate),
    start_date: parseDate(fields.startDate),
    end_date: parseDate(fields.endDate),
    priority: fields.priority,
    percent_done: progressToFraction(fields.progressPercent),
    project_id: fields.projectId,
    hex_color: normalizeHexColor(fields.hexColor),
    is_favorite: fields.isFavorite,
    repeat_after: fields.repeatAfter,
    repeat_mode: fields.repeatMode,
  });
}

function taskFilter(status: 'open' | 'done' | 'all', filter?: string): string | undefined {
  const statusExpression = status === 'open' ? 'done = false' : status === 'done' ? 'done = true' : undefined;
  return [statusExpression, filter].filter(Boolean).map((part) => `(${part})`).join(' && ') || undefined;
}

export function registerTaskTools(server: McpServer, client: VikunjaClient, config: Config): void {
  registerJsonTool(server, {
    name: 'tasks_list', title: 'List tasks',
    description: 'List and search tasks globally, in a project, or in a project view. Returns API-v2 pagination.',
    inputSchema: TaskListSchema, annotations: READ_ONLY,
  }, async (args) => {
    const path = args.viewId
      ? `/projects/${args.projectId}/views/${args.viewId}/tasks`
      : args.projectId ? `/projects/${args.projectId}/tasks` : '/tasks';
    const result = await client.list<Task>(path, {
      page: args.page,
      per_page: args.perPage,
      q: args.search,
      filter: taskFilter(args.status, args.filter),
      filter_timezone: args.filterTimezone,
      sort_by: args.sortBy ? [args.sortBy] : undefined,
      order_by: args.sortBy ? [args.sortDirection] : undefined,
      format: 'markdown',
    });
    return {
      message: `Found ${result.total} task(s).`,
      items: result.items.map(compactTask),
      pagination: pagination(result),
    };
  });

  registerJsonTool(server, {
    name: 'tasks_get', title: 'Get a task',
    description: 'Get one task by numeric ID, optionally expanding comments, subtasks, buckets, or reactions.',
    inputSchema: TaskGetSchema, annotations: READ_ONLY,
  }, async (args) => {
    const task = await client.get<Task>(`/tasks/${args.id}`, { expand: args.expand, format: 'markdown' });
    return { message: `Task ${task.id}: ${task.title}`, data: compactTask(task) };
  });

  registerJsonTool(server, {
    name: 'tasks_create', title: 'Create a task',
    description: 'Create a task in a project. Use projects_list first when the project ID is unknown.',
    inputSchema: TaskCreateSchema, annotations: WRITE,
  }, async (args) => {
    const { projectId, ...fields } = args;
    const task = await client.post<Task>(`/projects/${projectId}/tasks`, {
      ...taskBody(fields), title: args.title,
    }, { format: 'markdown' });
    return { message: `Created task ${task.id}: ${task.title}`, data: compactTask(task) };
  });

  registerJsonTool(server, {
    name: 'tasks_update', title: 'Update a task',
    description: 'Partially update a task. progressPercent uses human percentages from 0 to 100.',
    inputSchema: TaskUpdateSchema, annotations: IDEMPOTENT_WRITE,
  }, async (args) => {
    const { id, ...fields } = args;
    requireChange(fields);
    const task = await client.patch<Task>(`/tasks/${id}`, taskBody(fields), { format: 'markdown' });
    return { message: `Updated task ${task.id}: ${task.title}`, data: compactTask(task) };
  });

  registerJsonTool(server, {
    name: 'tasks_complete', title: 'Complete a task',
    description: 'Mark a task complete and set progress to 100 percent. Recurring tasks may reopen per Vikunja rules.',
    inputSchema: TaskIdSchema, annotations: IDEMPOTENT_WRITE,
  }, async ({ id }) => {
    const task = await client.patch<Task>(`/tasks/${id}`, { done: true, percent_done: 1 }, { format: 'markdown' });
    return { message: `Completed task ${task.id}: ${task.title}`, data: compactTask(task) };
  });

  registerJsonTool(server, {
    name: 'tasks_delete', title: 'Delete a task',
    description: 'Delete a task only when ENABLE_TASK_DELETE=true; safe mode completes it instead.',
    inputSchema: TaskIdSchema, annotations: DESTRUCTIVE,
  }, async ({ id }) => {
    const before = await client.get<Task>(`/tasks/${id}`, { format: 'markdown' });
    if (!config.enableTaskDelete) {
      const task = await client.patch<Task>(`/tasks/${id}`, { done: true, percent_done: 1 }, { format: 'markdown' });
      return { message: 'Task deletion is disabled; the task was completed instead.', data: compactTask(task) };
    }
    await client.delete(`/tasks/${id}`);
    return { message: `Deleted task ${id}: ${before.title}`, data: { id } };
  });

  registerJsonTool(server, {
    name: 'tasks_bulk_update', title: 'Bulk update tasks',
    description: 'Atomically apply the same values to multiple tasks. All task IDs must be writable.',
    inputSchema: TaskBulkUpdateSchema, annotations: IDEMPOTENT_WRITE,
  }, async (args) => {
    const values = taskBody(args.values);
    const result = await client.put<{ tasks?: Task[] }>('/tasks/bulk', {
      task_ids: args.taskIds,
      fields: Object.keys(values),
      values,
    }, { format: 'markdown' });
    const tasks = result.tasks ?? [];
    return { message: `Updated ${tasks.length} task(s).`, items: tasks.map(compactTask) };
  });
}

const ProjectListSchema = z.object({
  status: z.enum(['active', 'archived', 'all']).default('active'),
  search: z.string().min(1).optional(),
  page: PageSchema,
  perPage: PerPageSchema,
}).strict();
const ProjectGetSchema = z.object({ id: IdSchema }).strict();
const ProjectFields = {
  title: z.string().min(1).max(250).optional(),
  description: z.string().optional(),
  parentProjectId: z.number().int().min(0).optional(),
  identifier: z.string().max(10).optional(),
  hexColor: HexColorSchema.optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
};
const ProjectCreateSchema = z.object({
  title: z.string().min(1).max(250),
  description: ProjectFields.description,
  parentProjectId: ProjectFields.parentProjectId,
  identifier: ProjectFields.identifier,
  hexColor: ProjectFields.hexColor,
  isFavorite: ProjectFields.isFavorite,
}).strict();
const ProjectUpdateSchema = z.object({ id: IdSchema, ...ProjectFields }).strict();
const ProjectDuplicateSchema = z.object({
  id: IdSchema,
  parentProjectId: z.number().int().min(0).optional(),
  duplicateShares: z.boolean().default(false),
}).strict();

function projectBody(fields: Omit<z.output<typeof ProjectUpdateSchema>, 'id'>): Record<string, unknown> {
  return withoutUndefined({
    title: fields.title,
    description: fields.description,
    parent_project_id: fields.parentProjectId,
    identifier: fields.identifier,
    hex_color: normalizeHexColor(fields.hexColor),
    is_favorite: fields.isFavorite,
    is_archived: fields.isArchived,
  });
}

export function registerProjectTools(server: McpServer, client: VikunjaClient, config: Config): void {
  registerJsonTool(server, {
    name: 'projects_list', title: 'List projects',
    description: 'List active, archived, or all accessible projects with API-v2 pagination and search.',
    inputSchema: ProjectListSchema, annotations: READ_ONLY,
  }, async (args) => {
    const result = await client.list<Project>('/projects', {
      page: args.page, per_page: args.perPage, q: args.search,
      is_archived: args.status === 'active' ? undefined : true,
      format: 'markdown',
    });
    const items = result.items.filter((project) =>
      args.status === 'all' || (args.status === 'archived' ? project.is_archived : !project.is_archived));
    const message = args.status === 'archived'
      ? `Found ${items.length} archived project(s) on this page from ${result.total} active and archived project(s).`
      : `Found ${result.total} project(s).`;
    return {
      message,
      items: items.map(compactProject),
      pagination: pagination(result),
    };
  });

  registerJsonTool(server, {
    name: 'projects_get', title: 'Get a project',
    description: 'Get project details, views, permissions, and current subscription status by numeric ID.',
    inputSchema: ProjectGetSchema, annotations: READ_ONLY,
  }, async ({ id }) => {
    const project = await client.get<Project>(`/projects/${id}`, { format: 'markdown' });
    return { message: `Project ${project.id}: ${project.title}`, data: compactProject(project) };
  });

  registerJsonTool(server, {
    name: 'projects_create', title: 'Create a project',
    description: 'Create a top-level or child project.',
    inputSchema: ProjectCreateSchema, annotations: WRITE,
  }, async (args) => {
    const project = await client.post<Project>('/projects', projectBody(args), { format: 'markdown' });
    return { message: `Created project ${project.id}: ${project.title}`, data: compactProject(project) };
  });

  registerJsonTool(server, {
    name: 'projects_update', title: 'Update a project',
    description: 'Partially update project metadata, hierarchy, favorite state, or archive state.',
    inputSchema: ProjectUpdateSchema, annotations: IDEMPOTENT_WRITE,
  }, async (args) => {
    const { id, ...fields } = args;
    requireChange(fields);
    const project = await client.patch<Project>(`/projects/${id}`, projectBody(fields), { format: 'markdown' });
    return { message: `Updated project ${project.id}: ${project.title}`, data: compactProject(project) };
  });

  registerJsonTool(server, {
    name: 'projects_archive', title: 'Archive a project',
    description: 'Archive a project without deleting it.',
    inputSchema: ProjectGetSchema, annotations: IDEMPOTENT_WRITE,
  }, async ({ id }) => {
    const project = await client.patch<Project>(`/projects/${id}`, { is_archived: true }, { format: 'markdown' });
    return { message: `Archived project ${project.id}: ${project.title}`, data: compactProject(project) };
  });

  registerJsonTool(server, {
    name: 'projects_delete', title: 'Delete a project',
    description: 'Delete a project only when ENABLE_PROJECT_DELETE=true; safe mode archives it instead.',
    inputSchema: ProjectGetSchema, annotations: DESTRUCTIVE,
  }, async ({ id }) => {
    const before = await client.get<Project>(`/projects/${id}`, { format: 'markdown' });
    if (!config.enableProjectDelete) {
      const project = await client.patch<Project>(`/projects/${id}`, { is_archived: true }, { format: 'markdown' });
      return { message: 'Project deletion is disabled; the project was archived instead.', data: compactProject(project) };
    }
    await client.delete(`/projects/${id}`);
    return { message: `Deleted project ${id}: ${before.title}`, data: { id } };
  });

  registerJsonTool(server, {
    name: 'projects_duplicate', title: 'Duplicate a project',
    description: 'Deep-copy a project and optionally its shares under a chosen parent.',
    inputSchema: ProjectDuplicateSchema, annotations: WRITE,
  }, async (args) => {
    const result = await client.post<{ duplicated_project?: Project }>(`/projects/${args.id}/duplicate`, withoutUndefined({
      parent_project_id: args.parentProjectId,
      duplicate_shares: args.duplicateShares,
    }));
    return {
      message: result.duplicated_project
        ? `Duplicated project as ${result.duplicated_project.id}: ${result.duplicated_project.title}`
        : `Duplicated project ${args.id}.`,
      data: result.duplicated_project ? compactProject(result.duplicated_project) : result,
    };
  });
}

const LabelListSchema = z.object({
  search: z.string().min(1).optional(),
  page: PageSchema,
  perPage: PerPageSchema,
}).strict();
const LabelGetSchema = z.object({ id: IdSchema }).strict();
const LabelCreateSchema = z.object({
  title: z.string().min(1).max(250),
  description: z.string().optional(),
  hexColor: HexColorSchema.optional(),
}).strict();
const LabelUpdateSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(250).optional(),
  description: z.string().optional(),
  hexColor: HexColorSchema.optional(),
}).strict();
const TaskLabelSchema = z.object({ taskId: IdSchema, labelId: IdSchema }).strict();
const TaskLabelsReplaceSchema = z.object({ taskId: IdSchema, labelIds: z.array(IdSchema).max(500) }).strict();

function labelBody(fields: { title?: string; description?: string; hexColor?: string }): Record<string, unknown> {
  return withoutUndefined({
    title: fields.title,
    description: fields.description,
    hex_color: normalizeHexColor(fields.hexColor),
  });
}

export function registerLabelTools(server: McpServer, client: VikunjaClient, config: Config): void {
  registerJsonTool(server, {
    name: 'labels_list', title: 'List labels',
    description: 'List visible labels with server-side search and pagination.',
    inputSchema: LabelListSchema, annotations: READ_ONLY,
  }, async (args) => {
    const result = await client.list<Label>('/labels', {
      page: args.page, per_page: args.perPage, q: args.search, format: 'markdown',
    });
    return {
      message: `Found ${result.total} label(s).`,
      items: result.items.map(compactLabel),
      pagination: pagination(result),
    };
  });

  registerJsonTool(server, {
    name: 'labels_get', title: 'Get a label', description: 'Get one label by numeric ID.',
    inputSchema: LabelGetSchema, annotations: READ_ONLY,
  }, async ({ id }) => {
    const label = await client.get<Label>(`/labels/${id}`, { format: 'markdown' });
    return { message: `Label ${label.id}: ${label.title}`, data: compactLabel(label) };
  });

  registerJsonTool(server, {
    name: 'labels_create', title: 'Create a label', description: 'Create a reusable task label.',
    inputSchema: LabelCreateSchema, annotations: WRITE,
  }, async (args) => {
    const label = await client.post<Label>('/labels', labelBody(args), { format: 'markdown' });
    return { message: `Created label ${label.id}: ${label.title}`, data: compactLabel(label) };
  });

  registerJsonTool(server, {
    name: 'labels_update', title: 'Update a label', description: 'Partially update a label owned by the caller.',
    inputSchema: LabelUpdateSchema, annotations: IDEMPOTENT_WRITE,
  }, async (args) => {
    const { id, ...fields } = args;
    requireChange(fields);
    const label = await client.patch<Label>(`/labels/${id}`, labelBody(fields), { format: 'markdown' });
    return { message: `Updated label ${label.id}: ${label.title}`, data: compactLabel(label) };
  });

  registerJsonTool(server, {
    name: 'labels_delete', title: 'Delete a label',
    description: 'Permanently delete a label only when ENABLE_LABEL_DELETE=true.',
    inputSchema: LabelGetSchema, annotations: DESTRUCTIVE,
  }, async ({ id }) => {
    if (!config.enableLabelDelete) throw new Error('Label deletion is disabled by ENABLE_LABEL_DELETE.');
    const before = await client.get<Label>(`/labels/${id}`);
    await client.delete(`/labels/${id}`);
    return { message: `Deleted label ${id}: ${before.title}`, data: { id } };
  });

  registerJsonTool(server, {
    name: 'task_labels_add', title: 'Add a task label', description: 'Attach an existing label to a task.',
    inputSchema: TaskLabelSchema, annotations: WRITE,
  }, async ({ taskId, labelId }) => {
    await client.post(`/tasks/${taskId}/labels`, { label_id: labelId });
    return { message: `Added label ${labelId} to task ${taskId}.`, data: { taskId, labelId } };
  });

  registerJsonTool(server, {
    name: 'task_labels_remove', title: 'Remove a task label', description: 'Detach a label from a task without deleting the label.',
    inputSchema: TaskLabelSchema, annotations: DESTRUCTIVE,
  }, async ({ taskId, labelId }) => {
    await client.delete(`/tasks/${taskId}/labels/${labelId}`);
    return { message: `Removed label ${labelId} from task ${taskId}.`, data: { taskId, labelId } };
  });

  registerJsonTool(server, {
    name: 'task_labels_replace', title: 'Replace task labels',
    description: 'Replace the complete label set on a task; an empty list removes all labels.',
    inputSchema: TaskLabelsReplaceSchema, annotations: IDEMPOTENT_WRITE,
  }, async ({ taskId, labelIds }) => {
    const result = await client.put<{ labels?: Label[] }>(`/tasks/${taskId}/labels/bulk`, {
      labels: labelIds.map((id) => ({ id })),
    });
    const labels = result.labels ?? [];
    return { message: `Task ${taskId} now has ${labels.length} label(s).`, items: labels.map(compactLabel) };
  });
}

export function registerCoreTools(server: McpServer, client: VikunjaClient, config: Config): void {
  registerTaskTools(server, client, config);
  registerProjectTools(server, client, config);
  registerLabelTools(server, client, config);
}

export const CORE_API_OPERATIONS = [
  ['GET', '/tasks'], ['GET', '/projects/{project}/tasks'], ['GET', '/projects/{project}/views/{view}/tasks'],
  ['GET', '/tasks/{projecttask}'], ['POST', '/projects/{project}/tasks'], ['PATCH', '/tasks/{projecttask}'],
  ['DELETE', '/tasks/{projecttask}'], ['PUT', '/tasks/bulk'],
  ['GET', '/projects'], ['GET', '/projects/{id}'], ['POST', '/projects'], ['PATCH', '/projects/{id}'],
  ['DELETE', '/projects/{id}'], ['POST', '/projects/{projectid}/duplicate'],
  ['GET', '/labels'], ['GET', '/labels/{id}'], ['POST', '/labels'], ['PATCH', '/labels/{id}'],
  ['DELETE', '/labels/{id}'], ['POST', '/tasks/{projecttask}/labels'],
  ['DELETE', '/tasks/{projecttask}/labels/{label}'], ['PUT', '/tasks/{projecttask}/labels/bulk'],
] as const;
