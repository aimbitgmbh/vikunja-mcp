import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const IdSchema = z.number().int().positive();
export const PageSchema = z.number().int().min(1).default(1);
export const PerPageSchema = z.number().int().min(1).max(1000).default(50);
export const HexColorSchema = z.string().regex(/^#?[0-9a-fA-F]{6}$/).or(z.literal(''));
export const DateSchema = z.string().min(1);

const PaginationOutputSchema = z.object({
  page: z.number().int(),
  perPage: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const ToolOutputSchema = z.object({
  message: z.string(),
  data: z.unknown().optional(),
  items: z.array(z.unknown()).optional(),
  pagination: PaginationOutputSchema.optional(),
});

export interface ToolPayload {
  message: string;
  data?: unknown;
  items?: unknown[];
  pagination?: z.infer<typeof PaginationOutputSchema>;
}

export interface ToolSpec<S extends z.ZodTypeAny> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  annotations: ToolAnnotations;
}

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const IDEMPOTENT_WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
};

function textFor(payload: ToolPayload): string {
  const detail = payload.items === undefined
    ? payload.data
    : { items: payload.items, pagination: payload.pagination };
  return detail === undefined
    ? payload.message
    : `${payload.message}\n\n${JSON.stringify(detail, null, 2)}`;
}

export function registerJsonTool<S extends z.ZodTypeAny>(
  server: McpServer,
  spec: ToolSpec<S>,
  handler: (args: z.output<S>) => Promise<ToolPayload>,
): void {
  const callback = async (args: unknown): Promise<CallToolResult> => {
    try {
      const payload = await handler(args as z.output<S>);
      return {
        content: [{ type: 'text' as const, text: textFor(payload) }],
        structuredContent: { ...payload },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  };

  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.inputSchema,
      outputSchema: ToolOutputSchema,
      annotations: spec.annotations,
    },
    // The SDK's conditional callback type cannot resolve through a generic Zod schema.
    callback as never,
  );
}

export function pagination(result: {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}): ToolPayload['pagination'] {
  return {
    page: result.page,
    perPage: result.per_page,
    total: result.total,
    totalPages: result.total_pages,
  };
}

export function withoutUndefined(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

export function requireChange(values: Record<string, unknown>, ignoredKeys: string[] = ['id']): void {
  const hasChange = Object.entries(values)
    .some(([key, value]) => !ignoredKeys.includes(key) && value !== undefined);
  if (!hasChange) throw new Error('Provide at least one field to update.');
}
