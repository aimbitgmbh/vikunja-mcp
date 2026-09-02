export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue | undefined }

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  $schema?: string;
}

export interface User {
  id: number;
  username: string;
  name?: string;
  email?: string;
  created?: string;
  updated?: string;
}

export interface Subscription {
  id: number;
  entity: 'task' | 'project' | string;
  entity_id: number;
  created: string;
  user?: User;
}

export interface ProjectView {
  id: number;
  title: string;
  project_id: number;
  view_kind: 'list' | 'gantt' | 'table' | 'kanban' | string;
  filter?: TaskCollection;
  position?: number;
  bucket_configuration_mode?: 'none' | 'manual' | 'filter';
  default_bucket_id?: number;
  done_bucket_id?: number;
  created?: string;
  updated?: string;
}

export interface Project {
  id: number;
  title: string;
  description?: string;
  identifier?: string;
  owner?: User;
  parent_project_id?: number | null;
  created?: string;
  updated?: string;
  is_archived?: boolean;
  is_favorite?: boolean;
  hex_color?: string;
  position?: number;
  views?: ProjectView[];
  subscription?: Subscription | null;
  max_permission?: number | null;
}

export interface Label {
  id: number;
  title: string;
  description?: string;
  hex_color?: string;
  created_by?: User;
  created?: string;
  updated?: string;
}

export interface TaskComment {
  id: number;
  comment: string;
  author?: User;
  task_id?: number;
  created?: string;
  updated?: string;
  reactions?: Record<string, User[]>;
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  done: boolean;
  done_at?: string;
  due_date?: string;
  start_date?: string;
  end_date?: string;
  priority: number;
  /** Vikunja stores task progress as a fraction from 0 to 1. */
  percent_done?: number;
  project_id: number;
  created?: string;
  updated?: string;
  created_by?: User;
  assignees?: User[];
  labels?: Label[];
  comments?: TaskComment[];
  related_tasks?: Record<string, Task[]>;
  bucket_id?: number;
  position?: number;
  hex_color?: string;
  repeat_after?: number;
  repeat_mode?: number;
  is_favorite?: boolean;
  identifier?: string;
  index?: number;
  subscription?: Subscription | null;
  [key: string]: unknown;
}

export interface TaskRelation {
  task_id?: number;
  other_task_id: number;
  relation_kind: string;
  created_by?: User;
  created?: string;
}

export interface TaskCollection {
  filter?: string;
  filter_timezone?: string;
  filter_include_nulls?: boolean;
  sort_by?: string[];
  order_by?: string[];
  [key: string]: unknown;
}

export interface SavedFilter {
  id: number;
  title: string;
  description?: string;
  filters?: TaskCollection;
  is_favorite?: boolean;
  owner?: User;
  created?: string;
  updated?: string;
}

export interface Notification {
  id: number;
  name?: string;
  notification?: unknown;
  read: boolean;
  read_at?: string;
  created: string;
}

export interface Bucket {
  id: number;
  title: string;
  project_view_id?: number;
  limit?: number;
  position?: number;
  count?: number;
  tasks?: Task[];
  created?: string;
  updated?: string;
}

export interface ServerInfo {
  version: string;
  frontend_url?: string;
  motd?: string;
  max_file_size?: number;
  max_items_per_page?: number;
  task_attachments_enabled?: boolean;
  task_comments_enabled?: boolean;
  email_reminders_enabled?: boolean;
  user_deletion_enabled?: boolean;
  totp_enabled?: boolean;
  webhooks_enabled?: boolean;
  [key: string]: unknown;
}

export interface VikunjaProblem {
  status?: number;
  code?: number;
  title?: string;
  detail?: string;
  errors?: Array<{ location?: string; message?: string; value?: unknown }> | null;
}
