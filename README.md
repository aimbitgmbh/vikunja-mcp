# Vikunja MCP Server – MCP for Vikunja Task Management

[![npm version](https://img.shields.io/npm/v/@aimbitgmbh/vikunja-mcp)](https://www.npmjs.com/package/@aimbitgmbh/vikunja-mcp)
[![CI](https://github.com/aimbitgmbh/vikunja-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/aimbitgmbh/vikunja-mcp/actions/workflows/ci.yml)
[![Vikunja 2.6+](https://img.shields.io/badge/Vikunja-2.6%2B-196aff)](https://vikunja.io/)
[![Node.js 20.18+](https://img.shields.io/badge/Node.js-%E2%89%A520.18.1-43853d)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An MCP server for Vikunja task management and project management. It connects AI assistants and other Model Context Protocol clients to Vikunja 2.6+ through the stable `/api/v2` API.

Version 1.0.0 is tested with **Qwen 3.8 27B** for reliable MCP tool selection. The server remains model-independent and works with any standards-compliant MCP client.

## Features

- 51 focused MCP tools with consistent plural resource names
- Tasks, projects, labels, comments, assignees, relations, and bulk updates
- Saved filters, notifications, project views, and kanban buckets
- Server-side search, filtering, sorting, expansion, and pagination
- Structured JSON results plus readable text for broad client compatibility
- Destructive task, project, label, and notification deletion disabled by default
- Vikunja API v2 contract validation and TypeScript input validation

## Requirements

- Node.js 20.18.1 or newer
- Vikunja 2.6.0 or newer
- A Vikunja API token with the permissions needed for the tools you use

Create a token in Vikunja under **Settings → API Tokens**. Prefer the narrowest permissions that cover your workflow.

## Install and configure

The package can run directly through `npx`:

```json
{
  "mcpServers": {
    "vikunja": {
      "command": "npx",
      "args": ["-y", "@aimbitgmbh/vikunja-mcp@1.0.1"],
      "env": {
        "VIKUNJA_URL": "https://vikunja.example.com",
        "VIKUNJA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

`VIKUNJA_URL` may be the instance root, `/api/v1`, or `/api/v2`; the server normalizes it to `/api/v2`.

To install it globally instead:

```bash
npm install --global @aimbitgmbh/vikunja-mcp@1.0.1
vikunja-mcp
```

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `VIKUNJA_URL` | Yes | — | Vikunja instance URL |
| `VIKUNJA_API_TOKEN` | Yes | — | Vikunja API token |
| `VERIFY_SSL` | No | `true` | Verify the TLS certificate |
| `VIKUNJA_REQUEST_TIMEOUT_MS` | No | `30000` | HTTP timeout in milliseconds |
| `ENABLE_TASK_DELETE` | No | `false` | Allow permanent task deletion |
| `ENABLE_PROJECT_DELETE` | No | `false` | Allow permanent project deletion |
| `ENABLE_LABEL_DELETE` | No | `false` | Allow permanent label deletion |
| `ENABLE_NOTIFICATION_DELETE_ALL` | No | `false` | Allow deletion of all notifications |

Use `VERIFY_SSL=false` only for a trusted development instance with a self-signed certificate.

## Available MCP tools

The API uses predictable `{resource}_{action}` names:

- Tasks: `tasks_list`, `tasks_get`, `tasks_create`, `tasks_update`, `tasks_complete`, `tasks_delete`, `tasks_bulk_update`
- Projects: `projects_list`, `projects_get`, `projects_create`, `projects_update`, `projects_archive`, `projects_delete`, `projects_duplicate`
- Labels: `labels_list`, `labels_get`, `labels_create`, `labels_update`, `labels_delete`, `task_labels_add`, `task_labels_remove`, `task_labels_replace`
- Collaboration: `task_comments_*`, `task_assignees_*`, and `task_relations_*`
- Advanced: `saved_filters_*`, `notifications_*`, `project_views_*`, and `view_buckets_*`
- Server: `vikunja_info`

List tools return pagination metadata. Update tools are partial updates, so clients only need to send changed fields. Progress is exposed as `progressPercent` from 0 to 100 and converted to Vikunja's fractional representation.

## Safety

Permanent deletions return an MCP error until their matching `ENABLE_*_DELETE` flag is explicitly set to `true`. Archiving a project and completing a task remain available as safer alternatives. Relation removal and detaching labels or assignees do not delete the related objects themselves.

## Upgrading from 0.1.x

Version 1.0.0 targets Vikunja API v2 and intentionally removes API v1 compatibility. Tool names are now consistent, including:

| Before | 1.0.0 |
| --- | --- |
| `task_get`, `task_create`, `task_update` | `tasks_get`, `tasks_create`, `tasks_update` |
| `project_get`, `project_create` | `projects_get`, `projects_create` |
| `comments_*`, `assignees_*`, `relations_*` | `task_comments_*`, `task_assignees_*`, `task_relations_*` |
| `filter_*`, `views_*`, `buckets_*` | `saved_filters_*`, `project_views_*`, `view_buckets_*` |

Update stored prompts or automations that refer to old tool names. Passing a former `/api/v1` URL remains accepted, but requests are sent to `/api/v2`.

Vikunja 2.6 does not expose subscription endpoints through its API-token permission registry, so 1.0.0 does not advertise subscription write tools that would fail for the documented API-token setup. Current subscription state remains visible in task and project detail results.

## Development

```bash
npm ci
cp .env.example .env
npm run check
npm run build
```

Additional opt-in checks:

- `npm run test:live` runs a CRUD smoke test against a configured Vikunja instance and removes only records it created.
- `npm run test:qwen` evaluates tool selection through an OpenAI-compatible endpoint using `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`.

The sanitized [Vikunja 2.6 API contract](docs/api-spec.json) is included for reproducible endpoint checks.

## Links

- [npm package](https://www.npmjs.com/package/@aimbitgmbh/vikunja-mcp)
- [GitHub repository](https://github.com/aimbitgmbh/vikunja-mcp)
- [Issue tracker](https://github.com/aimbitgmbh/vikunja-mcp/issues)
- [Vikunja](https://vikunja.io/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

MIT © [aimbit GmbH](https://aimbit.de)
