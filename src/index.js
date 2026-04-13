const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
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

async function startServer() {
  const config = loadConfig();
  assertBaseConfig(config);

  const client = new PlutioClient(config);
  const tools = createTools(client);

  const server = new McpServer({
    name: 'plutio-mcp',
    version: '0.1.0'
  });

  registerTool(
    server,
    'plutio_get_business',
    'Get the current Plutio business/workspace details.',
    getBusinessSchema,
    tools.getBusiness
  );

  registerTool(
    server,
    'plutio_find_people',
    'Search people in a Plutio business.',
    findPeopleSchema,
    tools.findPeople
  );

  registerTool(
    server,
    'plutio_find_projects',
    'Search projects in a Plutio business.',
    findProjectsSchema,
    tools.findProjects
  );

  registerTool(
    server,
    'plutio_list_companies',
    'List companies in a Plutio business.',
    listCompaniesSchema,
    tools.listCompanies
  );

  registerTool(
    server,
    'plutio_list_statuses',
    'List statuses in a Plutio business.',
    listStatusesSchema,
    tools.listStatuses
  );

  registerTool(
    server,
    'plutio_list_custom_fields',
    'List custom fields, optionally scoped by entity type.',
    listCustomFieldsSchema,
    tools.listCustomFields
  );

  registerTool(
    server,
    'plutio_list_comments',
    'List comments for a specific parent entity.',
    listCommentsSchema,
    tools.listComments
  );

  registerTool(
    server,
    'plutio_create_comment',
    'Create a plain-text comment for a specific parent entity.',
    createCommentSchema,
    tools.createComment
  );

  registerTool(
    server,
    'plutio_list_files',
    'List files, optionally scoped by entity type and entity id.',
    listFilesSchema,
    tools.listFiles
  );

  registerTool(
    server,
    'plutio_list_conversations',
    'List conversations in a Plutio business.',
    listConversationsSchema,
    tools.listConversations
  );

  registerTool(
    server,
    'plutio_list_wiki',
    'List wiki entries in a Plutio business.',
    listWikiSchema,
    tools.listWiki
  );

  registerTool(
    server,
    'plutio_create_wiki',
    'Create a wiki in Plutio, optionally attached to a parent entity such as a project.',
    createWikiSchema,
    tools.createWiki
  );

  registerTool(
    server,
    'plutio_create_wiki_page',
    'Create a wiki page in Plutio and optionally populate its generated content block with text.',
    createWikiPageSchema,
    tools.createWikiPage
  );

  registerTool(
    server,
    'plutio_list_blocks',
    'List blocks, optionally scoped by entity type and entity id.',
    listBlocksSchema,
    tools.listBlocks
  );

  registerTool(
    server,
    'plutio_list_task_boards',
    'List task boards, optionally scoped by project.',
    listTaskBoardsSchema,
    tools.listTaskBoards
  );

  registerTool(
    server,
    'plutio_list_task_groups',
    'List task groups, optionally scoped by task board.',
    listTaskGroupsSchema,
    tools.listTaskGroups
  );

  registerTool(
    server,
    'plutio_list_tasks',
    'List tasks with optional filters.',
    listTasksSchema,
    tools.listTasks
  );

  registerTool(
    server,
    'plutio_list_time_tracks',
    'List time tracks with optional filters.',
    listTimeTracksSchema,
    tools.listTimeTracks
  );

  registerTool(
    server,
    'plutio_get_task',
    'Fetch a single task by canonical task record _id.',
    getTaskSchema,
    tools.getTask
  );

  registerTool(
    server,
    'plutio_create_task',
    'Create a task in Plutio.',
    createTaskSchema,
    tools.createTask
  );

  registerTool(
    server,
    'plutio_create_task_safe',
    'Create a task in Plutio with exact project/board/group resolution guardrails.',
    createTaskSafeSchema,
    tools.createTaskSafe
  );

  registerTool(
    server,
    'plutio_update_task',
    'Update an existing task in Plutio using canonical task record _id.',
    updateTaskSchema,
    tools.updateTask
  );

  registerTool(
    server,
    'plutio_update_task_safe',
    'Update an existing task in Plutio using canonical task record _id plus safe placement resolution.',
    updateTaskSafeSchema,
    tools.updateTaskSafe
  );

  registerTool(
    server,
    'plutio_create_tasks_bulk',
    'Create multiple tasks in Plutio with per-item results.',
    createTasksBulkSchema,
    tools.createTasksBulk
  );

  server.tool(
    'plutio_healthcheck',
    'Verify config presence and that the Plutio token flow works.',
    {},
    async () => {
      const accessToken = await client.getAccessToken();
      return toTextContent({
        ok: true,
        business: config.business,
        apiBase: config.apiBase,
        accessTokenReceived: Boolean(accessToken)
      });
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv.includes('--self-test')) {
  (async () => {
    const config = loadConfig();
    assertBaseConfig(config);
    const client = new PlutioClient(config);
    const tools = createTools(client);
    const result = await tools.findProjects({});
    console.log(JSON.stringify({ ok: true, count: Array.isArray(result) ? result.length : null }, null, 2));
  })().catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  });
} else if (process.argv.includes('--print-tools')) {
  console.log(
    JSON.stringify(
      [
        'plutio_healthcheck',
        'plutio_get_business',
        'plutio_find_people',
        'plutio_find_projects',
        'plutio_list_companies',
        'plutio_list_statuses',
        'plutio_list_custom_fields',
        'plutio_list_comments',
        'plutio_create_comment',
        'plutio_list_files',
        'plutio_list_conversations',
        'plutio_list_wiki',
        'plutio_create_wiki',
        'plutio_create_wiki_page',
        'plutio_list_blocks',
        'plutio_list_task_boards',
        'plutio_list_task_groups',
        'plutio_list_tasks',
        'plutio_list_time_tracks',
        'plutio_get_task',
        'plutio_create_task',
        'plutio_create_task_safe',
        'plutio_update_task',
        'plutio_update_task_safe',
        'plutio_create_tasks_bulk'
      ],
      null,
      2
    )
  );
} else {
  startServer().catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  });
}
