import type { Bucket, Label, Notification, Project, Task, User } from '../types.js';

export function positiveId(value: number, label = 'ID'): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer.`);
  return value;
}

export function encodeSegment(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function normalizeHexColor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const color = value.replace(/^#/, '');
  if (color !== '' && !/^[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error('Color must be a six-digit hex value, with or without #.');
  }
  return color;
}

export function parseDate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date.toISOString();
}

export function progressToFraction(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (value < 0 || value > 100) throw new Error('progressPercent must be between 0 and 100.');
  return value / 100;
}

export function progressToPercent(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 100);
}

function compactUser(user: User): Record<string, unknown> {
  return { id: user.id, username: user.username, name: user.name };
}

export function compactTask(task: Task): Record<string, unknown> {
  const taskReference = (related: Task): Record<string, unknown> => ({
    id: related.id,
    title: related.title,
    done: related.done,
    projectId: related.project_id,
  });
  const relatedTasks = task.related_tasks && Object.fromEntries(
    Object.entries(task.related_tasks).map(([kind, tasks]) => [kind, tasks.map(taskReference)]),
  );
  const subtasks = Array.isArray(task.subtasks)
    ? (task.subtasks as Task[]).map(taskReference)
    : undefined;
  const buckets = Array.isArray(task.buckets)
    ? (task.buckets as Bucket[]).map((bucket) => ({ id: bucket.id, title: bucket.title }))
    : undefined;

  return {
    id: task.id,
    identifier: task.identifier,
    title: task.title,
    description: task.description,
    projectId: task.project_id,
    done: task.done,
    progressPercent: progressToPercent(task.percent_done),
    priority: task.priority,
    dueDate: task.due_date,
    startDate: task.start_date,
    endDate: task.end_date,
    isFavorite: task.is_favorite,
    labels: task.labels?.map((label) => ({ id: label.id, title: label.title })),
    assignees: task.assignees?.map(compactUser),
    comments: task.comments?.map((comment) => ({
      id: comment.id,
      comment: comment.comment,
      author: comment.author && compactUser(comment.author),
      reactions: comment.reactions,
      created: comment.created,
      updated: comment.updated,
    })),
    relatedTasks,
    subtasks,
    buckets,
    reactions: task.reactions,
    commentCount: task.comment_count,
    timeEntriesCount: task.time_entries_count,
    isUnread: task.is_unread,
    created: task.created,
    updated: task.updated,
  };
}

export function compactProject(project: Project): Record<string, unknown> {
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    identifier: project.identifier,
    parentProjectId: project.parent_project_id,
    isArchived: project.is_archived,
    isFavorite: project.is_favorite,
    hexColor: project.hex_color,
    owner: project.owner ? compactUser(project.owner) : undefined,
    subscription: project.subscription,
    views: project.views,
    created: project.created,
    updated: project.updated,
  };
}

export function compactLabel(label: Label): Record<string, unknown> {
  return {
    id: label.id,
    title: label.title,
    description: label.description,
    hexColor: label.hex_color,
    created: label.created,
    updated: label.updated,
  };
}

export function compactNotification(notification: Notification): Record<string, unknown> {
  return {
    id: notification.id,
    name: notification.name,
    notification: notification.notification,
    read: notification.read,
    readAt: notification.read_at,
    created: notification.created,
  };
}

export function compactBucket(bucket: Bucket): Record<string, unknown> {
  return {
    id: bucket.id,
    title: bucket.title,
    limit: bucket.limit,
    position: bucket.position,
    count: bucket.count,
    tasks: bucket.tasks?.map(compactTask),
  };
}
