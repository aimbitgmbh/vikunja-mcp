import { Agent, fetch } from 'undici';
import type { Config } from './config.js';
import type { Paginated, VikunjaProblem } from './types.js';

export type QueryValue = string | number | boolean | Array<string | number | boolean> | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  contentType?: string;
}

export class VikunjaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly details?: VikunjaProblem['errors'],
  ) {
    super(message);
    this.name = 'VikunjaApiError';
  }
}

function appendQuery(url: URL, query: Record<string, QueryValue> | undefined): void {
  if (!query) return;

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) url.searchParams.append(key, String(item));
  }
}

export class VikunjaClient {
  private readonly dispatcher?: Agent;

  constructor(private readonly config: Config) {
    if (!config.verifySsl) {
      this.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }
  }

  get apiUrl(): string {
    return this.config.apiUrl;
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    if (!path.startsWith('/')) throw new Error(`API path must start with '/': ${path}`);

    const url = new URL(`${this.config.apiUrl}${path}`);
    appendQuery(url, options.query);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiToken}`,
      Accept: 'application/json',
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = options.contentType ?? 'application/json';
    }

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
        dispatcher: this.dispatcher,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Vikunja request failed for ${method} ${url.pathname}: ${message}`);
    }

    if (!response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      let problem: VikunjaProblem = {};
      if (contentType.includes('json')) {
        try {
          problem = await response.json() as VikunjaProblem;
        } catch {
          // Preserve the status-based fallback below.
        }
      }

      const detail = problem.detail || problem.title || response.statusText || 'Unknown API error';
      const code = problem.code === undefined ? '' : `, code ${problem.code}`;
      throw new VikunjaApiError(
        `Vikunja API error (${response.status}${code}) for ${method} ${url.pathname}: ${detail}`,
        response.status,
        problem.code,
        problem.errors,
      );
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    return await response.json() as T;
  }

  get<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  list<T>(path: string, query?: Record<string, QueryValue>): Promise<Paginated<T>> {
    return this.get<Paginated<T>>(path, query).then((result) => {
      if (!result || !Array.isArray(result.items) || typeof result.total !== 'number') {
        throw new Error(`Invalid paginated response from GET ${path}.`);
      }
      return result;
    });
  }

  post<T>(path: string, body?: unknown, query?: Record<string, QueryValue>): Promise<T> {
    return this.request<T>('POST', path, { body, query });
  }

  put<T>(path: string, body?: unknown, query?: Record<string, QueryValue>): Promise<T> {
    return this.request<T>('PUT', path, { body, query });
  }

  patch<T>(path: string, body: unknown, query?: Record<string, QueryValue>): Promise<T> {
    return this.request<T>('PATCH', path, {
      body,
      query,
      contentType: 'application/merge-patch+json',
    });
  }

  delete(path: string): Promise<void> {
    return this.request<void>('DELETE', path);
  }

  async close(): Promise<void> {
    await this.dispatcher?.close();
  }
}
