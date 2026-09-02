import { z } from 'zod';

const BooleanEnv = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === undefined ? undefined : value === 'true');

const EnvironmentSchema = z.object({
  VIKUNJA_URL: z.string().min(1),
  VIKUNJA_API_TOKEN: z.string().min(1),
  VERIFY_SSL: BooleanEnv,
  VIKUNJA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).optional(),
  ENABLE_PROJECT_DELETE: BooleanEnv,
  ENABLE_LABEL_DELETE: BooleanEnv,
  ENABLE_TASK_DELETE: BooleanEnv,
  ENABLE_NOTIFICATION_DELETE_ALL: BooleanEnv,
});

export interface Config {
  apiUrl: string;
  apiToken: string;
  verifySsl: boolean;
  requestTimeoutMs: number;
  enableProjectDelete: boolean;
  enableLabelDelete: boolean;
  enableTaskDelete: boolean;
  enableNotificationDeleteAll: boolean;
}

/** Accept an instance root or an old/new API URL and always target API v2. */
export function normalizeVikunjaUrl(rawUrl: string): string {
  const url = new URL(rawUrl);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('VIKUNJA_URL must use http or https.');
  }
  if (url.username || url.password) {
    throw new Error('VIKUNJA_URL must not contain credentials.');
  }

  url.hash = '';
  url.search = '';
  const withoutTrailingSlash = url.pathname.replace(/\/+$/, '');
  const instancePath = withoutTrailingSlash.replace(/\/api\/v(?:1|2)$/i, '');
  url.pathname = `${instancePath}/api/v2`.replace(/\/{2,}/g, '/');

  return url.toString().replace(/\/$/, '');
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(
      `Configuration error: missing or invalid ${fields.join(', ')}. ` +
      'Set VIKUNJA_URL and VIKUNJA_API_TOKEN; see .env.example.'
    );
  }

  return {
    apiUrl: normalizeVikunjaUrl(parsed.data.VIKUNJA_URL),
    apiToken: parsed.data.VIKUNJA_API_TOKEN,
    verifySsl: parsed.data.VERIFY_SSL ?? true,
    requestTimeoutMs: parsed.data.VIKUNJA_REQUEST_TIMEOUT_MS ?? 30_000,
    enableProjectDelete: parsed.data.ENABLE_PROJECT_DELETE ?? false,
    enableLabelDelete: parsed.data.ENABLE_LABEL_DELETE ?? false,
    enableTaskDelete: parsed.data.ENABLE_TASK_DELETE ?? false,
    enableNotificationDeleteAll: parsed.data.ENABLE_NOTIFICATION_DELETE_ALL ?? false,
  };
}
