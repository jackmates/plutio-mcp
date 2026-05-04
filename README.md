# plutio-mcp

A business-agnostic MCP server for Plutio.

## Design goals

- reusable across different Plutio businesses
- no hardcoded workspace IDs, people IDs, or routing rules
- safe progression from read-heavy tooling to carefully-confirmed writes
- easy to layer private workflow policies on top without contaminating the shared core

## Current status

This is now a working **stdio MCP server** scaffold.

Implemented so far:
- config loading from env
- OAuth client-credentials token retrieval, with 60-second safety window and concurrent-call deduplication
- token-bucket rate limiter (default 1000 req/hour) wired into every Plutio request
- generic Plutio request wrapper
- stdio + Streamable HTTP MCP transports
- task-result normalization that treats Plutio task `_id` as the canonical identity and exposes `legacyTaskNumber` as a secondary field
- a safer task helper layer for exact placement resolution across project / board / group

### Tool catalog

**Escape hatches** (always available, regardless of mode)
  - `plutio_api_reference` — compact catalog of every tool, filterable by category/mode
  - `plutio_request` — raw Plutio API passthrough; GET-only in `readonly` mode
  - `plutio_workspace_schema` — custom-field introspection grouped by entityType (5-min cache)
  - `plutio_rate_limit_status` — current rate-limit headroom

**Compound**
  - `plutio_client_360` — person + company + projects + invoices + subscriptions in one call

**Read tools**
  - `plutio_healthcheck`, `plutio_get_business`
  - `plutio_find_people`, `plutio_find_projects`
  - `plutio_list_companies`, `plutio_list_statuses`, `plutio_list_custom_fields`
  - `plutio_list_comments`, `plutio_list_files`, `plutio_list_conversations`
  - `plutio_list_wiki`, `plutio_list_blocks`
  - `plutio_list_proposals`, `plutio_list_contracts`
  - `plutio_list_task_boards`, `plutio_list_task_groups`, `plutio_list_tasks`, `plutio_list_time_tracks`
  - `plutio_get_task`

**Write tools** (only registered when `PLUTIO_MCP_MODE=full`)
  - `plutio_create_comment`
  - `plutio_create_wiki`, `plutio_create_wiki_page`
  - `plutio_create_proposal`, `plutio_update_proposal`
  - `plutio_create_contract`, `plutio_update_contract`
  - `plutio_create_proposal_block`, `plutio_update_proposal_block`
  - `plutio_create_contract_block`, `plutio_update_contract_block`
  - `plutio_create_task`, `plutio_create_task_safe`
  - `plutio_update_task`, `plutio_update_task_safe`
  - `plutio_create_tasks_bulk`

> Use `plutio_api_reference` from any MCP client to get the live, filterable version of this list.

## Environment

See [`.env.example`](.env.example) for the full list with comments.

Required:
- `PLUTIO_CLIENT_ID`
- `PLUTIO_CLIENT_SECRET`
- `PLUTIO_BUSINESS`

Optional:
- `PLUTIO_MCP_MODE` (`readonly` | `full`, default `readonly`)
- `PLUTIO_API_BASE` (defaults to `https://api.plutio.com/v1.11`)
- `PLUTIO_USER_AGENT`
- `PLUTIO_MAX_REQUESTS_PER_HOUR` (default `1000`)

## Run

### Local stdio mode

```bash
cd plutio-mcp
node src/index.js
```

### Local HTTP mode

```bash
cd plutio-mcp
PORT=3000 npm run start:http
```

This exposes:
- MCP endpoint: `http://localhost:3000/mcp`
- health check: `http://localhost:3000/health`
- readiness check: `http://localhost:3000/ready`

Print tool names:

```bash
cd plutio-mcp
npm run print-tools
```

Quick auth smoke test:

```bash
cd plutio-mcp
PLUTIO_CLIENT_ID=... \
PLUTIO_CLIENT_SECRET=... \
PLUTIO_BUSINESS=... \
npm run self-test
```

## Example MCP client config

### Stdio client config

```json
{
  "mcpServers": {
    "plutio": {
      "command": "node",
      "args": ["/absolute/path/to/plutio-mcp/src/index.js"],
      "env": {
        "PLUTIO_CLIENT_ID": "...",
        "PLUTIO_CLIENT_SECRET": "...",
        "PLUTIO_BUSINESS": "your-business-slug"
      }
    }
  }
}
```

### Remote HTTP deployment shape

For team/shared hosting, run the server in HTTP mode and expose `/mcp` behind your platform or reverse proxy.

Example service URL:

```text
https://plutio-mcp.example.com/mcp
```

## Coolify deployment

This repository can now be deployed as a Coolify Docker service.

### Recommended first deployment model

- single shared MATES workspace
- internal/private service only
- secrets managed as Coolify environment variables
- optionally place it behind Coolify auth / private networking

### Required Coolify env vars

- `PLUTIO_CLIENT_ID`
- `PLUTIO_CLIENT_SECRET`
- `PLUTIO_BUSINESS`

### Optional env vars

- `PLUTIO_API_BASE` (default `https://api.plutio.com/v1.11`)
- `PLUTIO_USER_AGENT`
- `PLUTIO_MCP_MODE` (`readonly` or `full`, default `readonly`)
- `PORT` (default `3000`)
- `MCP_PATH` (default `/mcp`)
- `HOST` (default `0.0.0.0`)

### Docker details

- Dockerfile included
- default container port: `3000`
- health endpoint: `/health`
- readiness endpoint: `/ready`
- MCP endpoint: `/mcp`

### Coolify setup notes

Use:
- **Build Pack / Dockerfile:** Dockerfile
- **Port:** `3000`
- **Healthcheck path:** `/health`

### Team-safe mode

By default, the service now starts in `readonly` mode.

If you want the safer team-facing behavior explicitly, you can still set:

```text
PLUTIO_MCP_MODE=readonly
```

In `readonly` mode, the service exposes only safe read tools and hides write tools entirely.

### Important security note

In `full` mode, this server exposes both read and write Plutio tools. You must opt into that explicitly with:

```text
PLUTIO_MCP_MODE=full
```
Before broad team rollout, consider one or more of:

- restricting network access to trusted internal users only
- placing auth in front of the service
- using `PLUTIO_MCP_MODE=readonly` for the team-facing deployment
- reserving `full` mode for admin/internal power use
- adding request logging/auditing

## Notes on task identity and safe writes

- Treat task `_id` as the canonical task identifier for MCP/API work.
- Treat `taskId` as a legacy/UI-facing number only.
- `plutio_update_task` now expects `taskRecordId` as the canonical identifier, while still accepting `taskId` as a temporary legacy alias.
- `plutio_create_task_safe` and `plutio_update_task_safe` resolve project / board / group carefully before writing.
- `plutio_create_comment` creates comments with the validated Plutio payload shape: `entityType`, `entityId`, and `bodyPlain`.
- `plutio_create_wiki` is validated with `POST /v1.11/wiki` using at least `title`; adding `entityType: "project"` + `entityId` attaches the wiki to a project.
- wiki update via `PUT /v1.11/wiki` is now validated for:
  - `_id`
  - `shareSettings.isShared`
  - `privateShareSettings`
- validated example visibility payload:
  - `{ "_id": "WIKI_ID", "shareSettings": { "isShared": true }, "privateShareSettings": { "type": "roles", "roles": ["team", "co-owner"] } }`
- live reads also show role combinations such as `["co-owner"]`, `["team", "co-owner"]`, and `["client", "co-owner"]`.
- `plutio_create_wiki_page` is validated with `POST /v1.11/wiki-entities` using `wikiId`, `parentId`, `title`, and `type: "page"`; when text is supplied, the helper updates the generated `content` block via `PUT /v1.11/blocks` with `hasText`, `textPlain`, and `textHTML`.
- proposal/contract read support now includes:
  - `plutio_list_proposals`
  - `plutio_list_contracts`
- proposal/contract write support now includes:
  - `plutio_create_proposal`
  - `plutio_update_proposal`
  - `plutio_create_contract`
  - `plutio_update_contract`
- validated live document findings folded into the MCP surface:
  - proposal/contract create uses `name`, not `title`
  - proposal default blocks observed on fresh create: `intro`, `content`, `signature`
  - contract default blocks observed on fresh create: `content`, `signature`
  - contract `intro` is not a safe writable assumption
  - currently exposed safe document-block write helpers intentionally limit block creation/update to validated types: `content`, `html`, and `signature`
  - for proposal/contract rendering, embedded images are often represented as HTML inside content-style blocks, so this MCP surface prefers HTML/text block updates over unresolved direct image-upload claims
- live wiki records expose meaningful style metadata through `designOptions`, including values such as `fontFamily`, `bgColor`, `layout`, `maxWidth`, padding, border radius, and section color settings.
- style reads are therefore validated at the model level, but style writes are still **not yet fully validated**.
- Wiki page image/file attachment is still **not yet fully validated**.
  - Direct disposable multipart `POST /v1.11/files` scoped to `entityType=wiki-page` + `entityId=...` failed with HTTP `400` / `Handle is required`.
  - Follow-up docs + live reads show file `handle` is the file storage/share slug used in uploads URLs, and image embeds appear to be block-based rather than page-scoped file records.
  - The docs’ Files schema only explicitly allows file `entityType` values `person`, `project`, and `task`.
  - The docs’ Blocks schema includes an `image` block with `attachment.{_id,handle,title,size,mimeType,extension,url}`.
  - A smallest disposable `POST /v1.11/blocks` image-block probe using an existing Plutio image file still failed with HTTP `400` / `Cannot read properties of null (reading 'designOptions')`, so the writable wiki image-block contract remains unresolved.
- **New 2026-04-13 re-probe:** direct fresh-image upload is also **not yet validated for tasks**.
  - Disposable task used: record `_id` `wgAavigG3AMxiPtit` in `Zzz test`.
  - Tested multipart `POST /v1.11/files` with all of:
    - `entityType`, `entityId`, `file`
    - `entityType`, `entityId`, `title`, `file`
    - `entityType`, `entityId`, `title`, `handle`, `file`
  - All task variants failed with HTTP `400` / `Handle is required`.
  - Scoped follow-up read `GET /v1.11/files?entityType=task&entityId=wgAavigG3AMxiPtit` returned `[]`.
  - Matching failures on both task and wiki-page routes strongly suggest the missing piece is the underlying file-ingest / handle-minting contract, not just wiki-page entity scoping.
  - Therefore no new MCP write tool should claim end-to-end image upload support yet for either tasks or wiki pages.
- Safe placement resolution matches projects by exact `name` and boards/groups by exact `title`.

## Planned next steps

1. trim response shaping further so safe tools can return lighter placement summaries by default
2. add explicit helper(s) for exact assignable-person resolution on top of raw people search
3. add optional dry-run or confirmation-oriented wrappers for writes
4. optionally create a separate private policy/profile layer for MATES-specific defaults

## Notes from investigation

The implementation work so far established that:
- OAuth token requests must be form-encoded
- the Plutio business selector belongs in the `business` header
- docs navigation labels do not always match literal endpoint paths
- several high-value read endpoints and task-create payloads have been validated against a live Plutio workspace

Those findings informed this server, but the code itself intentionally avoids hardcoding workspace-specific assumptions.
