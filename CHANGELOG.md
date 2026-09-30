# Changelog

## 1.0.1 — 2026-09-30

- Fixed tool calls in Claude Desktop by omitting the optional `outputSchema`, which the MCP SDK emits as unsupported JSON Schema draft-07 ([#3](https://github.com/aimbitgmbh/vikunja-mcp/issues/3)). Structured results and text output are preserved.
- Updated Undici to 7.30.0 and refreshed the locked dependencies to address known security vulnerabilities.

## 1.0.0 — 2026-09-02

First stable release.

- Migrated every request from Vikunja API v1 to the Vikunja 2.6 API v2 contract.
- Replaced the `/tasks/all` integration with API-v2 task collection routes and pagination envelopes.
- Added 51 consistently named MCP tools with structured output and model-friendly descriptions.
- Added project views, kanban buckets, saved filters, bulk task updates, notifications, and collaboration workflows.
- Added safe-by-default deletion controls, request timeouts, proper TLS configuration, and sanitized API errors.
- Added contract, client, configuration, MCP catalog, live CRUD, and Qwen 3.8 27B tool-selection tests.
- Raised the minimum runtime to Node.js 20.18.1.

### Breaking changes

- Vikunja API v1 is no longer supported.
- Several MCP tool names changed to consistent plural resource names; see the migration table in the README.
- Subscription write tools are not exposed because Vikunja 2.6 subscription routes are unavailable to API tokens.
