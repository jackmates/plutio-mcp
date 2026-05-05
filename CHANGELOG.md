# Changelog

All notable changes to this project will be documented here.

## [0.3.0] - 2026-05-04

### Added

- **OAuth 2.1 authorization on the MCP endpoint.** Required for spec-compliant clients like Claude desktop / Cowork that drive remote MCP servers. Includes:
  - `/.well-known/oauth-authorization-server` (RFC 8414) — issuer + endpoint discovery
  - `/.well-known/oauth-protected-resource` (RFC 9728) — resource metadata
  - `POST /oauth/register` — RFC 7591 dynamic client registration
  - `GET  /oauth/authorize` — `authorization_code` grant with PKCE (S256 required)
  - `POST /oauth/token` — code-for-token exchange
  - `WWW-Authenticate: Bearer resource_metadata=...` on 401 from `/mcp` so MCP clients auto-discover the auth flow
- **Optional consent-page passcode** (`MCP_AUTH_PASSCODE`). When set, the `/authorize` step renders a tiny HTML form requiring the user to enter the passcode before a code is issued. When unset, registered clients are auto-approved.
- New env vars: `MCP_OAUTH_ENABLED` (default `true`), `MCP_AUTH_PASSCODE` (optional).

### Changed

- `/mcp` now returns `401 Unauthorized` (with the discovery hint) when no bearer token is present and `MCP_OAUTH_ENABLED` is true. Existing local stdio usage and the in-process `createAppContext()` flow are unaffected.
- `/health` reports `oauth: true|false`.
- Server name version reported via MCP advertised as `0.3.0`.

### Migration

- If you previously fronted this server with HTTP Basic Auth at the proxy layer (Coolify, Cloudflare, etc.) and want to keep that, set `MCP_OAUTH_ENABLED=false` to disable the in-app gate.
- If you want OAuth (recommended for remote MCP clients), make sure no proxy-level auth is in front of the server, or it'll block the OAuth flow's discovery endpoints.

## [0.2.0] - 2026-05-04

### Added

- **`plutio_api_reference`** — compact catalog of every tool the server exposes (name, category, API path, mode). Agents call this first when unsure which tool to use.
- **`plutio_request`** — raw API passthrough. Method/path/query/body. GET-only when `PLUTIO_MCP_MODE=readonly`. Lets clients hit endpoints the resource-specific tools don't yet wrap.
- **`plutio_workspace_schema`** — introspects custom fields, returns them grouped by entityType as `{ entityType: { fieldTitle: { _id, inputType, options } } }`. 5-minute in-memory cache; pass `refresh: true` to force a re-fetch.
- **`plutio_rate_limit_status`** — reports remaining requests in the current rate-limit window.
- **`plutio_client_360`** — compound lookup. Resolve a person by id/email/name, then fan out to fetch their company, projects, invoices (with paid/unpaid totals), and recurring subscriptions in one call.
- Token-bucket rate limiter (`src/rate-limiter.js`) wired into every Plutio API request. Capped at `PLUTIO_MAX_REQUESTS_PER_HOUR` (default 1000). Callers queue transparently when the bucket is empty.
- LICENSE file (MIT).
- `.env.example` documenting every supported env var.

### Changed

- OAuth refresh now uses a 60-second safety window before token expiry (was 30s) and de-duplicates concurrent refreshes via an inflight promise so a burst of requests cannot dog-pile the token endpoint.
- `/health` response now includes `version`.
- `/ready` no longer 500s. It now exercises the OAuth token flow as a real readiness signal and reports rate-limit headroom on success; returns 503 with the error message when the token flow fails.
- Server name version reported via MCP advertised as `0.2.0`.

### Fixed

- `/ready` endpoint previously called `server.server.listTools()` which is not a method on the current MCP SDK surface, returning `500 server.server.listTools is not a function` for every readiness probe.

### Notes

- All existing tools (`plutio_find_people`, `plutio_create_contract`, `plutio_create_task_safe`, etc.) are unchanged; this release is purely additive plus the readiness fix. No migration needed.
- `PLUTIO_BUSINESS` is still required — the README's old "auto-detected from token" claim is not implemented and should not be relied on.

## [0.1.0] - earlier

- Initial stdio MCP server with read tools and the contract / proposal / task write paths (incl. the safer `*_safe` placement helpers).
- Coolify-ready HTTP transport, readonly-by-default mode.
