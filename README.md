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
- OAuth client-credentials token retrieval
- generic Plutio request wrapper
- stdio MCP transport
- task-result normalization that treats Plutio task `_id` as the canonical identity and exposes `legacyTaskNumber` as a secondary field
- a safer task helper layer for exact placement resolution across project / board / group
- MCP tools for:
  - `plutio_healthcheck`
  - `plutio_get_business`
  - `plutio_find_people`
  - `plutio_find_projects`
  - `plutio_list_companies`
  - `plutio_list_statuses`
  - `plutio_list_custom_fields`
  - `plutio_list_comments`
  - `plutio_create_comment`
  - `plutio_list_files`
  - `plutio_list_conversations`
  - `plutio_list_wiki`
  - `plutio_create_wiki`
  - `plutio_create_wiki_page`
  - `plutio_list_blocks`
  - `plutio_list_task_boards`
  - `plutio_list_task_groups`
  - `plutio_list_tasks`
  - `plutio_list_time_tracks`
  - `plutio_get_task`
  - `plutio_create_task`
  - `plutio_create_task_safe`
  - `plutio_update_task`
  - `plutio_update_task_safe`
  - `plutio_create_tasks_bulk`

## Environment

Required:
- `PLUTIO_CLIENT_ID`
- `PLUTIO_CLIENT_SECRET`
- `PLUTIO_BUSINESS`

Optional:
- `PLUTIO_API_BASE` (defaults to `https://api.plutio.com/v1.11`)
- `PLUTIO_USER_AGENT`

## Run

```bash
cd plutio-mcp
node src/index.js
```

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
- live wiki records expose meaningful style metadata through `designOptions`, including values such as `fontFamily`, `bgColor`, `layout`, `maxWidth`, padding, border radius, and section color settings.
- style reads are therefore validated at the model level, but style writes are still **not yet fully validated**.
- Wiki page image/file attachment is still **not yet fully validated**.
  - Direct disposable multipart `POST /v1.11/files` scoped to `entityType=wiki-page` + `entityId=...` failed with HTTP `400` / `Handle is required`.
  - Follow-up docs + live reads show file `handle` is the file storage/share slug used in uploads URLs, and image embeds appear to be block-based rather than page-scoped file records.
  - The docs’ Files schema only explicitly allows file `entityType` values `person`, `project`, and `task`.
  - The docs’ Blocks schema includes an `image` block with `attachment.{_id,handle,title,size,mimeType,extension,url}`.
  - A smallest disposable `POST /v1.11/blocks` image-block probe using an existing Plutio image file still failed with HTTP `400` / `Cannot read properties of null (reading 'designOptions')`, so the writable wiki image-block contract remains unresolved.
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
