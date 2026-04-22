const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { loadConfig, assertBaseConfig } = require('./config');
const { PlutioClient } = require('./client');
const { createTools } = require('./tools');
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
  listBlocksSchema
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

function buildMcpServer(config, client, tools) {
  const server = new McpServer({
    name: 'plutio-mcp',
    version: '0.1.0'
  });

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
  const server = buildMcpServer(config, client, tools);
  return { config, client, tools, server };
}

async function startHttpServer() {
  const { config, server } = createAppContext();
  const port = Number(process.env.PORT || process.env.PLUTIO_MCP_PORT || 3000);
  const host = process.env.HOST || process.env.PLUTIO_MCP_HOST || '0.0.0.0';
  const path = process.env.MCP_PATH || '/mcp';

  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'plutio-mcp', business: config.business, mode: config.mode }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/ready') {
        await server.server.listTools();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname !== path) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID()
      });

      res.on('close', () => {
        transport.close().catch(() => {});
      });

      await server.connect(transport);
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
