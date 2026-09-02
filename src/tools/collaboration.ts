import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { VikunjaClient } from '../client.js';
import type { TaskComment, TaskRelation, User } from '../types.js';
import { encodeSegment } from './helpers.js';
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
} from './common.js';

const CommentGetSchema = z.object({ taskId: IdSchema, commentId: IdSchema }).strict();
const CommentCreateSchema = z.object({ taskId: IdSchema, comment: z.string().min(1) }).strict();
const CommentUpdateSchema = z.object({
  taskId: IdSchema,
  commentId: IdSchema,
  comment: z.string().min(1),
}).strict();
const CommentsListSchema = z.object({
  taskId: IdSchema,
  search: z.string().min(1).optional(),
  page: PageSchema,
  perPage: PerPageSchema,
}).strict();

function compactComment(comment: TaskComment): Record<string, unknown> {
  return {
    id: comment.id,
    taskId: comment.task_id,
    comment: comment.comment,
    author: comment.author && {
      id: comment.author.id,
      username: comment.author.username,
      name: comment.author.name,
    },
    reactions: comment.reactions,
    created: comment.created,
    updated: comment.updated,
  };
}

export function registerCommentTools(server: McpServer, client: VikunjaClient): void {
  registerJsonTool(server, {
    name: 'task_comments_list', title: 'List task comments',
    description: 'List comments on a task with search and pagination.',
    inputSchema: CommentsListSchema, annotations: READ_ONLY,
  }, async (args) => {
    const result = await client.list<TaskComment>(`/tasks/${args.taskId}/comments`, {
      page: args.page, per_page: args.perPage, q: args.search, format: 'markdown',
    });
    return {
      message: `Found ${result.total} comment(s) on task ${args.taskId}.`,
      items: result.items.map(compactComment),
      pagination: pagination(result),
    };
  });

  registerJsonTool(server, {
    name: 'task_comments_get', title: 'Get a task comment', description: 'Get one comment from a task.',
    inputSchema: CommentGetSchema, annotations: READ_ONLY,
  }, async ({ taskId, commentId }) => {
    const comment = await client.get<TaskComment>(`/tasks/${taskId}/comments/${commentId}`, { format: 'markdown' });
    return { message: `Comment ${comment.id} on task ${taskId}.`, data: compactComment(comment) };
  });

  registerJsonTool(server, {
    name: 'task_comments_create', title: 'Create a task comment', description: 'Add a comment to a task.',
    inputSchema: CommentCreateSchema, annotations: WRITE,
  }, async ({ taskId, comment }) => {
    const result = await client.post<TaskComment>(`/tasks/${taskId}/comments`, { comment }, { format: 'markdown' });
    return { message: `Created comment ${result.id} on task ${taskId}.`, data: compactComment(result) };
  });

  registerJsonTool(server, {
    name: 'task_comments_update', title: 'Update a task comment', description: 'Update a comment authored by the caller.',
    inputSchema: CommentUpdateSchema, annotations: IDEMPOTENT_WRITE,
  }, async ({ taskId, commentId, comment }) => {
    const result = await client.patch<TaskComment>(`/tasks/${taskId}/comments/${commentId}`, { comment }, { format: 'markdown' });
    return { message: `Updated comment ${commentId} on task ${taskId}.`, data: compactComment(result) };
  });

  registerJsonTool(server, {
    name: 'task_comments_delete', title: 'Delete a task comment', description: 'Delete a comment authored by the caller.',
    inputSchema: CommentGetSchema, annotations: DESTRUCTIVE,
  }, async ({ taskId, commentId }) => {
    await client.delete(`/tasks/${taskId}/comments/${commentId}`);
    return { message: `Deleted comment ${commentId} from task ${taskId}.`, data: { taskId, commentId } };
  });
}

const AssigneeAddSchema = z.object({ taskId: IdSchema, userId: IdSchema }).strict();
const AssigneesReplaceSchema = z.object({
  taskId: IdSchema,
  userIds: z.array(IdSchema).max(500),
}).strict();
const AssigneesListSchema = z.object({
  taskId: IdSchema,
  search: z.string().min(1).optional(),
  page: PageSchema,
  perPage: PerPageSchema,
}).strict();

function compactUser(user: User): Record<string, unknown> {
  return { id: user.id, username: user.username, name: user.name };
}

export function registerAssigneeTools(server: McpServer, client: VikunjaClient): void {
  registerJsonTool(server, {
    name: 'task_assignees_list', title: 'List task assignees', description: 'List users assigned to a task.',
    inputSchema: AssigneesListSchema, annotations: READ_ONLY,
  }, async (args) => {
    const result = await client.list<User>(`/tasks/${args.taskId}/assignees`, {
      page: args.page, per_page: args.perPage, q: args.search,
    });
    return {
      message: `Found ${result.total} assignee(s) on task ${args.taskId}.`,
      items: result.items.map(compactUser),
      pagination: pagination(result),
    };
  });

  registerJsonTool(server, {
    name: 'task_assignees_add', title: 'Add a task assignee', description: 'Assign one user to a task.',
    inputSchema: AssigneeAddSchema, annotations: WRITE,
  }, async ({ taskId, userId }) => {
    await client.post(`/tasks/${taskId}/assignees`, { user_id: userId });
    return { message: `Assigned user ${userId} to task ${taskId}.`, data: { taskId, userId } };
  });

  registerJsonTool(server, {
    name: 'task_assignees_replace', title: 'Replace task assignees',
    description: 'Replace all task assignees; an empty list unassigns everyone.',
    inputSchema: AssigneesReplaceSchema, annotations: IDEMPOTENT_WRITE,
  }, async ({ taskId, userIds }) => {
    const result = await client.put<{ assignees?: User[] }>(`/tasks/${taskId}/assignees/bulk`, {
      assignees: userIds.map((id) => ({ id })),
    });
    const assignees = result.assignees ?? [];
    return { message: `Task ${taskId} now has ${assignees.length} assignee(s).`, items: assignees.map(compactUser) };
  });

  registerJsonTool(server, {
    name: 'task_assignees_remove', title: 'Remove a task assignee', description: 'Unassign one user from a task.',
    inputSchema: AssigneeAddSchema, annotations: DESTRUCTIVE,
  }, async ({ taskId, userId }) => {
    await client.delete(`/tasks/${taskId}/assignees/${userId}`);
    return { message: `Unassigned user ${userId} from task ${taskId}.`, data: { taskId, userId } };
  });
}

const RelationKindSchema = z.enum([
  'subtask', 'parenttask', 'related', 'duplicateof', 'duplicates', 'blocking', 'blocked',
  'precedes', 'follows', 'copiedfrom', 'copiedto',
]);
const RelationSchema = z.object({
  taskId: IdSchema,
  otherTaskId: IdSchema,
  relationKind: RelationKindSchema,
}).strict();

export function registerRelationTools(server: McpServer, client: VikunjaClient): void {
  registerJsonTool(server, {
    name: 'task_relations_create', title: 'Create a task relation',
    description: 'Create a typed relation between two tasks, such as blocking, subtask, or related.',
    inputSchema: RelationSchema, annotations: WRITE,
  }, async ({ taskId, otherTaskId, relationKind }) => {
    const relation = await client.post<TaskRelation>(`/tasks/${taskId}/relations`, {
      other_task_id: otherTaskId,
      relation_kind: relationKind,
    });
    return { message: `Created ${relationKind} relation from task ${taskId} to ${otherTaskId}.`, data: relation };
  });

  registerJsonTool(server, {
    name: 'task_relations_delete', title: 'Delete a task relation', description: 'Remove a typed relation between two tasks.',
    inputSchema: RelationSchema, annotations: DESTRUCTIVE,
  }, async ({ taskId, otherTaskId, relationKind }) => {
    await client.delete(`/tasks/${taskId}/relations/${encodeSegment(relationKind)}/${otherTaskId}`);
    return {
      message: `Deleted ${relationKind} relation from task ${taskId} to ${otherTaskId}.`,
      data: { taskId, otherTaskId, relationKind },
    };
  });
}

export function registerCollaborationTools(server: McpServer, client: VikunjaClient): void {
  registerCommentTools(server, client);
  registerAssigneeTools(server, client);
  registerRelationTools(server, client);
}

export const COLLABORATION_API_OPERATIONS = [
  ['GET', '/tasks/{task}/comments'], ['GET', '/tasks/{task}/comments/{commentid}'],
  ['POST', '/tasks/{task}/comments'], ['PATCH', '/tasks/{task}/comments/{commentid}'],
  ['DELETE', '/tasks/{task}/comments/{commentid}'],
  ['GET', '/tasks/{projecttask}/assignees'], ['POST', '/tasks/{projecttask}/assignees'],
  ['PUT', '/tasks/{projecttask}/assignees/bulk'], ['DELETE', '/tasks/{projecttask}/assignees/{user}'],
  ['POST', '/tasks/{task}/relations'], ['DELETE', '/tasks/{task}/relations/{relationKind}/{otherTask}'],
] as const;
