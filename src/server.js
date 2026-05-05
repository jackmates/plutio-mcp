const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { loadConfig, assertBaseConfig } = require('./config');
const { PlutioClient } = require('./client');
const { createTools } = require('./tools');
const { buildTools: buildEscapeHatchTools } = require('./escape-hatch');
const { createClient360 } = require('./client-360');
const oauth = require('./oauth');
const {
  getBusinessSchema,
  findPeopleSchema,
  findProjectsSchema,
  listCustomFieldsSchema,
  listCommentsSchema,
  createCommentSchema,
  listTaskBoardsSchema,
  listTaskGroupsSchema,
  listTasksSchema,
  listTimeTracksSchema,
  createTaskSchema,
  createTaskSafeSchema,
  getTaskSchema,
  updateTaskSchema,
  updateTaskSafeSchema,
  createTasksBulkSchema,
  listCompaniesSchema,
  listStatusesSchema,
  listFilesSchema,
  listConversationsSchema,
  listWikiSchema,
  createWikiSchema,
  createWikiPageSchema,
  listProposalsSchema,
  listContractsSchema,
  createProposalSchema,
  updateProposalSchema,
  createContractSchema,
  updateContractSchema,
  createProposalBlockSchema,
  updateProposalBlockSchema,
  createContractBlockSchema,
  updateContractBlockSchema,
  listBlocksSchema,
  apiReferenceSchema,
  requestSchema,
  workspaceSchemaSchema,
  rateLimitStatusSchema,
  client360Schema
} = require('./schemas');

function toTextContent(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

function registerTool(server, name, description, schema, handler) {
  server.tool(name, description, schema.shape, async (args) => {
    const result = await handler(schema.parse(args || {}));
    return toTextContent(result);
  });
}

function buildMcpServer(config, client, tools, extras) {
  const server = new McpServer({
    name: 'plutio-mcp',
    version: '0.3.0'
  });

  const escapeHatchTools = [
    [
      'plutio_api_reference',
      'Compact catalog of every tool this server exposes — name, category, API path, mode. Call this FIRST when unsure which Plutio tool to use.',
      apiReferenceSchema,
      extras.escape.apiReference
    ],
    [
      'plutio_request',
      'Escape hatch — raw passthrough to the Plutio API. Method/path/query/body. Use when the resource-specific tools do not cover what you need. GET-only when PLUTIO_MCP_MODE=readonly.',
      requestSchema,
      extras.escape.request
    ],
    [
      'plutio_workspace_schema',
      'Inspect custom-field definitions for the current Plutio business, grouped by entityType. Returns { entityType: { fieldTitle: { _id, inputType, options } } }. Cached for 5 minutes; pass refresh:true to force a re-fetch.',
      workspaceSchemaSchema,
      extras.escape.workspaceSchema
    ],
    [
      'plutio_rate_limit_status',
      'Show remaining requests in the current rate-limit window (token-bucket capped at PLUTIO_MAX_REQUESTS_PER_HOUR, default 1000/hour).',
      rateLimitStatusSchema,
      extras.escape.rateLimitStatus
    ]
  ];

  const compoundTools = [
    [
      'plutio_client_360',
      'Compound lookup — resolves a person by id/email/name, then fetches their company, projects, invoices (with paid/unpaid totals), and recurring subscriptions in one call. Replaces the 4-6 round-trip "tell me everything about <client>" workflow.',
      client360Schema,
      extras.client360
    ]
  ];

  const readTools = [
    ['plutio_get_business', 'Get the current Plutio business/workspace details.', getBusinessSchema, tools.getBusiness],
    ['plutio_find_people', 'Search people in a Plutio business.', findPeopleSchema, tools.findPeople],
    ['plutio_find_projects', 'Search projects in a Plutio business.', findProjectsSchema, tools.findProjects],
    ['plutio_list_companies', 'List companies in a Plutio business.', listCompaniesSchema, tools.listCompanies],
    ['plutio_list_statuses', 'List statuses in a Plutio business.', listStatusesSchema, tools.listStatuses],
    ['plutio_list_custom_fields', 'List custom fields, optionally scoped by entity type.', listCustomFieldsSchema, tools.listCustomFields],
    ['plutio_list_comments', 'List comments for a specific parent entity.', listCommentsSchema, tools.listComments],
    ['plutio_list_files', 'List files, optionally scoped by entity type and entity id.', listFilesSchema, tools.listFiles],
    ['plutio_list_conversations', 'List conversations in a Plutio business.', listConversationsSchema, tools.listConversations],
    ['plutio_list_wiki', 'List wiki entries in a Plutio business.', listWikiSchema, tools.listWiki],
    ['plutio_list_blocks', 'List blocks, optionally scoped by entity type and entity id.', listBlocksSchema, tools.listBlocks],
    ['plutio_list_proposals', 'List proposals in a Plutio business.', listProposalsSchema, tools.listProposals],
    ['plutio_list_contracts', 'List contracts in a Plutio business.', listContractsSchema, tools.listContracts],
    ['plutio_list_task_boards', 'List task boards, optionally scoped by project.', listTaskBoardsSchema, tools.listTaskBoards],
    ['plutio_list_task_groups', 'List task groups, optionally scoped by task board.', listTaskGroupsSchema, tools.listTaskGroups],
    ['plutio_list_tasks', 'List tasks with optional filters.', listTasksSchema, tools.listTasks],
    ['plutio_list_time_tracks', 'List time tracks with optional filters.', listTimeTracksSchema, tools.listTimeTracks],
    ['plutio_get_task', 'Fetch a single task by canonical task record _id.', getTaskSchema, tools.getTask]
  ];

  const writeTools = [
    ['plutio_create_comment', 'Create a plain-text comment for a specific parent entity.', createCommentSchema, tools.createComment],
    ['plutio_create_wiki', 'Create a wiki in Plutio, optionally attached to a parent entity such as a project.', createWikiSchema, tools.createWiki],
    ['plutio_create_wiki_page', 'Create a wiki page in Plutio and optionally populate its generated content block with text.', createWikiPageSchema, tools.createWikiPage],
    ['plutio_create_proposal', 'Create a proposal in Plutio. Uses the validated create payload field name `name`, not `title`.', createProposalSchema, tools.createProposal],
    ['plutio_update_proposal', 'Update an existing proposal in Plutio using canonical proposal record _id.', updateProposalSchema, tools.updateProposal],
    ['plutio_create_contract', 'Create a contract in Plutio. Uses the validated create payload field name `name`, not `title`.', createContractSchema, tools.createContract],
    ['plutio_update_contract', 'Update an existing contract in Plutio using canonical contract record _id.', updateContractSchema, tools.updateContract],
    ['plutio_create_proposal_block', 'Create a validated safe block on a proposal. Current MCP support intentionally limits writes to content/html/signature block types.', createProposalBlockSchema, tools.createProposalBlock],
    ['plutio_update_proposal_block', 'Update a validated safe proposal block. For embedded images, use HTML inside content/html blocks rather than claiming unresolved image-upload support.', updateProposalBlockSchema, tools.updateProposalBlock],
    ['plutio_create_contract_block', 'Create a validated safe block on a contract. Current MCP support intentionally limits writes to content/html/signature block types.', createContractBlockSchema, tools.createContractBlock],
    ['plutio_update_contract_block', 'Update a validated safe contract block. For embedded images, use HTML inside content/html blocks rather than claiming unresolved image-upload support.', updateContractBlockSchema, tools.updateContractBlock],
    ['plutio_create_task', 'Create a task in Plutio.', createTaskSchema, tools.createTask],
    ['plutio_create_task_safe', 'Create a task in Plutio with exact project/board/group resolution guardrails.', createTaskSafeSchema, tools.createTaskSafe],
    ['plutio_update_task', 'Update an existing task in Plutio using canonical task record _id.', updateTaskSchema, tools.updateTask],
    ['plutio_update_task_safe', 'Update an existing task in Plutio using canonical task record _id plus safe placement resolution.', updateTaskSafeSchema, tools.updateTaskSafe],
    ['plutio_create_tasks_bulk', 'Create multiple tasks in Plutio with per-item results.', createTasksBulkSchema, tools.createTasksBulk]
  ];

  for (const [name, description, schema, handler] of escapeHatchTools) {
    registerTool(server, name, description, schema, handler);
  }

  for (const [name, description, schema, handler] of compoundTools) {
    registerTool(server, name, description, schema, handler);
  }

  for (const [name, description, schema, handler] of readTools) {
    registerTool(server, name, description, schema, handler);
  }

  if (config.mode !== 'readonly') {
    for (const [name, description, schema, handler] of writeTools) {
      registerTool(server, name, description, schema, handler);
    }
  }

  server.tool('plutio_healthcheck', 'Verify config presence and that the Plutio token flow works.', {}, async () => {
    const accessToken = await client.getAccessToken();
    return toTextContent({
      ok: true,
      business: config.business,
      apiBase: config.apiBase,
      accessTokenReceived: Boolean(accessToken)
    });
  });

  return server;
}

function createAppContext() {
  const config = loadConfig();
  assertBaseConfig(config);
  const client = new PlutioClient(config);
  const tools = createTools(client);
  const extras = {
    escape: buildEscapeHatchTools(client, config),
    client360: createClient360(client)
  };
  const server = buildMcpServer(config, client, tools, extras);
  return { config, client, tools, extras, server };
}

async function startHttpServer() {
  const { config, client, server } = createAppContext();
  const port = Number(process.env.PORT || process.env.PLUTIO_MCP_PORT || 3000);
  const host = process.env.HOST || process.env.PLUTIO_MCP_HOST || '0.0.0.0';
  const path = process.env.MCP_PATH || '/mcp';

  // sessionId -> StreamableHTTPServerTransport
  const mcpTransports = new Map();

  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const baseUrl = oauth.publicBaseUrl(req);

      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'plutio-mcp', business: config.business, mode: config.mode, version: '0.3.0', oauth: config.oauthEnabled }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/ready') {
        // Probe Plutio's OAuth endpoint as a real readiness signal.
        try {
          await client.getAccessToken();
          const rl = client.getRateLimiter().status();
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, business: config.business, mode: config.mode, rateLimit: rl }));
        } catch (error) {
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: error.message || String(error) }));
        }
        return;
      }

      // ─── OAuth endpoints (always reachable, never bearer-gated) ──────────
      if (req.method === 'GET' && url.pathname === '/.well-known/oauth-authorization-server') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(oauth.getAuthorizationServerMetadata(baseUrl)));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(oauth.getProtectedResourceMetadata(baseUrl)));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/oauth/register') {
        await oauth.handleRegister(req, res);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/oauth/authorize') {
        await oauth.handleAuthorize(req, res, url, { passcode: config.authPasscode });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/oauth/token') {
        await oauth.handleToken(req, res);
        return;
      }

      if (url.pathname !== path) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      // Bearer-token gate on the MCP endpoint itself. Returning 401 with a
      // RFC-compliant WWW-Authenticate is what triggers MCP clients (Claude
      // desktop / Cowork / etc.) to discover and run the OAuth flow.
      if (config.oauthEnabled && !oauth.isAuthorized(req)) {
        oauth.unauthorizedResponse(res, baseUrl);
        return;
      }

      // Reuse one StreamableHTTPServerTransport per session so that the
      // initialize / tools/list / tools/call sequence within a session shares
      // state. Without this, every request gets a fresh transport (with a
      // fresh session id) and any post-initialize call fails with
      // "Bad Request: Server not initialized" — which is what was causing
      // Cowork's tool list to come back empty.
      const incomingSession = req.headers['mcp-session-id'];
      let transport;
      if (typeof incomingSession === 'string' && mcpTransports.has(incomingSession)) {
        transport = mcpTransports.get(incomingSession);
      } else {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            mcpTransports.set(id, transport);
          }
        });
        transport.onclose = () => {
          if (transport.sessionId) mcpTransports.delete(transport.sessionId);
        };
        await server.connect(transport);
      }

      await transport.handleRequest(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
      }
      res.end(JSON.stringify({ error: error.message || String(error) }));
    }
  });

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, resolve);
  });

  console.log(`plutio-mcp http listening on http://${host}:${port}${path}`);
  return { httpServer, port, host, path };
}

module.exports = {
  toTextContent,
  registerTool,
  buildMcpServer,
  createAppContext,
  startHttpServer
};
