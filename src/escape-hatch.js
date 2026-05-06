/**
 * Escape-hatch tools.
 *
 * These four tools give an MCP client a way to navigate the Plutio API surface
 * even when the resource-specific tools don't cover the exact endpoint, plus
 * runtime visibility into rate limits and custom-field schema.
 *
 *  - plutio_api_reference        compact catalog of every tool this server exposes
 *  - plutio_request              raw passthrough to the Plutio API (gated by readonly mode)
 *  - plutio_workspace_schema     custom-field introspection, cached for 5 min
 *  - plutio_rate_limit_status    current bucket level
 *
 * The catalog is the single source of truth for plutio_api_reference. When you
 * add a new tool elsewhere in the codebase, append an entry here so agents can
 * discover it via plutio_api_reference.
 */

const TOOL_CATALOG = [
  // ─── Read ──────────────────────────────────────────────────────────────────
  { tool: 'plutio_healthcheck', mode: 'always', category: 'admin', apiPath: 'oauth/token', description: 'Verify config presence and that the Plutio token flow works.' },
  { tool: 'plutio_get_business', mode: 'read', category: 'admin', apiPath: 'businesses', description: 'Get the current Plutio business/workspace details.' },
  { tool: 'plutio_find_people', mode: 'read', category: 'crm', apiPath: 'people', description: 'Search people: contacts, clients, leads, team members.' },
  { tool: 'plutio_find_projects', mode: 'read', category: 'project-management', apiPath: 'projects', description: 'Search projects in a Plutio business.' },
  { tool: 'plutio_list_companies', mode: 'read', category: 'crm', apiPath: 'companies', description: 'List companies/organizations.' },
  { tool: 'plutio_list_statuses', mode: 'read', category: 'admin', apiPath: 'statuses', description: 'List statuses configured in the business.' },
  { tool: 'plutio_list_custom_fields', mode: 'read', category: 'admin', apiPath: 'custom-fields', description: 'List custom fields, optionally scoped by entity type.' },
  { tool: 'plutio_list_comments', mode: 'read', category: 'communication', apiPath: 'comments', description: 'List comments for a specific parent entity.' },
  { tool: 'plutio_list_files', mode: 'read', category: 'files', apiPath: 'files', description: 'List files, optionally scoped by entity type and entity id.' },
  { tool: 'plutio_list_conversations', mode: 'read', category: 'communication', apiPath: 'conversations', description: 'List conversations.' },
  { tool: 'plutio_list_wiki', mode: 'read', category: 'knowledge', apiPath: 'wiki', description: 'List wiki entries.' },
  { tool: 'plutio_list_blocks', mode: 'read', category: 'documents', apiPath: 'blocks', description: 'List blocks, optionally scoped by entity type and entity id.' },
  { tool: 'plutio_list_proposals', mode: 'read', category: 'documents', apiPath: 'proposals', description: 'List proposals.' },
  { tool: 'plutio_list_contracts', mode: 'read', category: 'documents', apiPath: 'contracts', description: 'List contracts.' },
  { tool: 'plutio_list_task_boards', mode: 'read', category: 'project-management', apiPath: 'task-boards', description: 'List task boards, optionally scoped by project.' },
  { tool: 'plutio_list_task_groups', mode: 'read', category: 'project-management', apiPath: 'task-groups', description: 'List task groups, optionally scoped by task board.' },
  { tool: 'plutio_list_tasks', mode: 'read', category: 'project-management', apiPath: 'tasks', description: 'List tasks with optional filters.' },
  { tool: 'plutio_list_time_tracks', mode: 'read', category: 'time-tracking', apiPath: 'time-tracks', description: 'List time tracks with optional filters.' },
  { tool: 'plutio_get_task', mode: 'read', category: 'project-management', apiPath: 'tasks/{id}', description: 'Fetch a single task by canonical task record _id.' },
  // ─── Compound ──────────────────────────────────────────────────────────────
  { tool: 'plutio_client_360', mode: 'read', category: 'crm', apiPath: '(compound)', description: 'Resolve person + their company + projects + invoices + subscriptions in one call.' },
  // ─── Escape hatches ────────────────────────────────────────────────────────
  { tool: 'plutio_api_reference', mode: 'always', category: 'admin', apiPath: '(meta)', description: 'Compact catalog of every tool this server exposes. Call first when unsure.' },
  { tool: 'plutio_request', mode: 'always', category: 'admin', apiPath: '(any)', description: 'Raw API passthrough. Method/path/query/body. GET-only in readonly mode.' },
  { tool: 'plutio_workspace_schema', mode: 'always', category: 'admin', apiPath: 'custom-fields', description: 'Inspect custom field definitions, grouped by entityType. Cached 5 min.' },
  { tool: 'plutio_rate_limit_status', mode: 'always', category: 'admin', apiPath: '(meta)', description: 'Show remaining requests in the current rate-limit window.' },
  // ─── Write ─────────────────────────────────────────────────────────────────
  { tool: 'plutio_create_comment', mode: 'write', category: 'communication', apiPath: 'comments', description: 'Create a plain-text comment for a specific parent entity.' },
  { tool: 'plutio_create_wiki', mode: 'write', category: 'knowledge', apiPath: 'wiki', description: 'Create a wiki, optionally attached to a parent entity.' },
  { tool: 'plutio_create_wiki_page', mode: 'write', category: 'knowledge', apiPath: 'wiki-pages', description: 'Create a wiki page and optionally populate its content block.' },
  { tool: 'plutio_create_proposal', mode: 'write', category: 'documents', apiPath: 'proposals', description: 'Create a proposal. Field name is `name`, not `title`.' },
  { tool: 'plutio_update_proposal', mode: 'write', category: 'documents', apiPath: 'proposals/{id}', description: 'Update a proposal by canonical _id.' },
  { tool: 'plutio_create_contract', mode: 'write', category: 'documents', apiPath: 'contracts', description: 'Create a contract. Field name is `name`, not `title`.' },
  { tool: 'plutio_update_contract', mode: 'write', category: 'documents', apiPath: 'contracts/{id}', description: 'Update a contract by canonical _id.' },
  { tool: 'plutio_create_proposal_block', mode: 'write', category: 'documents', apiPath: 'blocks', description: 'Create a validated content/html/signature block on a proposal.' },
  { tool: 'plutio_update_proposal_block', mode: 'write', category: 'documents', apiPath: 'blocks/{id}', description: 'Update a content/html/signature block on a proposal.' },
  { tool: 'plutio_create_contract_block', mode: 'write', category: 'documents', apiPath: 'blocks', description: 'Create a validated content/html/signature block on a contract.' },
  { tool: 'plutio_update_contract_block', mode: 'write', category: 'documents', apiPath: 'blocks/{id}', description: 'Update a content/html/signature block on a contract.' },
  { tool: 'plutio_create_task', mode: 'write', category: 'project-management', apiPath: 'tasks', description: 'Create a task.' },
  { tool: 'plutio_create_task_safe', mode: 'write', category: 'project-management', apiPath: 'tasks', description: 'Create a task with exact project/board/group resolution guardrails.' },
  { tool: 'plutio_update_task', mode: 'write', category: 'project-management', apiPath: 'tasks/{id}', description: 'Update a task by canonical _id.' },
  { tool: 'plutio_update_task_safe', mode: 'write', category: 'project-management', apiPath: 'tasks/{id}', description: 'Update a task by canonical _id with safe placement resolution.' },
  { tool: 'plutio_create_tasks_bulk', mode: 'write', category: 'project-management', apiPath: 'tasks', description: 'Create multiple tasks with per-item results.' },
  { tool: 'plutio_create_task_group', mode: 'write', category: 'project-management', apiPath: 'task-groups', description: 'Create a new task group (column) on a task board.' },
  { tool: 'plutio_update_task_group', mode: 'write', category: 'project-management', apiPath: 'task-groups', description: 'Update an existing task group (rename, recolor, etc).' },
  { tool: 'plutio_move_task_group', mode: 'write', category: 'project-management', apiPath: 'task-groups/move', description: 'Reorder a task group within a board (or move to another board).' },
  { tool: 'plutio_copy_task_group', mode: 'write', category: 'project-management', apiPath: 'task-groups/copy', description: 'Duplicate a task group to a destination board.' },
  { tool: 'plutio_archive_task_group', mode: 'write', category: 'project-management', apiPath: 'task-groups/archive', description: 'Archive or unarchive a task group.' },
  { tool: 'plutio_delete_task_group', mode: 'write', category: 'project-management', apiPath: 'task-groups', description: 'Permanently delete a task group. Cannot be undone.' }
];

const PATH_RE = /^[A-Za-z0-9_\-./{}~]+$/;

function normalizeRequestPath(path) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('plutio_request: path is required');
  }
  if (!PATH_RE.test(path)) {
    throw new Error('plutio_request: path contains disallowed characters');
  }
  if (/^https?:/i.test(path) || /^\/\//.test(path)) {
    throw new Error('plutio_request: pass an API path, not a full URL');
  }
  // Strip leading slashes — client.request resolves against apiBase + '/'.
  return path.replace(/^\/+/, '');
}

function buildTools(client, config) {
  const writeable = config.mode !== 'readonly';
  const allowedMethods = writeable
    ? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    : ['GET'];
  const allowedMethodsSet = new Set(allowedMethods);

  let schemaCache = null;
  let schemaCacheExpiresAt = 0;
  const SCHEMA_TTL_MS = 5 * 60 * 1000;

  return {
    apiReference: async ({ category, mode } = {}) => {
      let entries = TOOL_CATALOG;
      if (category) {
        entries = entries.filter((entry) => entry.category === category);
      }
      if (mode) {
        entries = entries.filter((entry) => entry.mode === mode || entry.mode === 'always');
      }
      const filteredForRuntime = entries.filter((entry) => {
        if (entry.mode === 'write' && !writeable) return false;
        return true;
      });
      const categories = Array.from(new Set(TOOL_CATALOG.map((entry) => entry.category))).sort();
      return {
        baseUrl: config.apiBase,
        business: config.business,
        runtimeMode: writeable ? 'full' : 'readonly',
        rateLimit: client.getRateLimiter().status(),
        categories,
        toolCount: filteredForRuntime.length,
        tools: filteredForRuntime
      };
    },

    request: async ({ method = 'GET', path, query, body, business }) => {
      const upperMethod = String(method || 'GET').toUpperCase();
      if (!allowedMethodsSet.has(upperMethod)) {
        const reason = writeable
          ? `Method ${upperMethod} is not supported`
          : `Server is in readonly mode; only GET allowed (got ${upperMethod}). Set PLUTIO_MCP_MODE=full to enable writes.`;
        throw new Error(reason);
      }
      const normalizedPath = normalizeRequestPath(path);
      const result = await client.request(normalizedPath, {
        method: upperMethod,
        query,
        body,
        business
      });
      return {
        method: upperMethod,
        path: normalizedPath,
        result
      };
    },

    workspaceSchema: async ({ refresh, business } = {}) => {
      const now = Date.now();
      if (!refresh && schemaCache && schemaCacheExpiresAt > now) {
        return {
          ...schemaCache,
          cachedAt: new Date(schemaCacheExpiresAt - SCHEMA_TTL_MS).toISOString(),
          expiresAt: new Date(schemaCacheExpiresAt).toISOString(),
          cacheHit: true
        };
      }

      const fields = await client.request('custom-fields', {
        query: { limit: 1000 },
        business
      });

      const grouped = {};
      const flat = Array.isArray(fields) ? fields : [];
      for (const field of flat) {
        if (!field || typeof field !== 'object') continue;
        const entityType = field.entityType || '_unscoped';
        if (!grouped[entityType]) grouped[entityType] = {};
        const title = field.title || field.name || `(field-${field._id || 'unknown'})`;
        const options = {};
        for (const opt of field.options || []) {
          const label = opt.title || opt.name;
          if (label && opt._id) options[label] = opt._id;
        }
        grouped[entityType][title] = {
          _id: field._id,
          inputType: field.inputType,
          required: Boolean(field.isRequired),
          options: Object.keys(options).length ? options : undefined
        };
      }

      schemaCache = {
        entityCount: Object.keys(grouped).length,
        fieldCount: flat.length,
        entities: grouped
      };
      schemaCacheExpiresAt = now + SCHEMA_TTL_MS;

      return {
        ...schemaCache,
        cachedAt: new Date(now).toISOString(),
        expiresAt: new Date(schemaCacheExpiresAt).toISOString(),
        cacheHit: false
      };
    },

    rateLimitStatus: async () => {
      return client.getRateLimiter().status();
    }
  };
}

module.exports = {
  TOOL_CATALOG,
  buildTools
};
