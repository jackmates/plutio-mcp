const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { createAppContext } = require('./server');

async function startServer() {
  const { server } = createAppContext();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv.includes('--self-test')) {
  (async () => {
    const { tools } = createAppContext();
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
        'plutio_list_proposals',
        'plutio_list_contracts',
        'plutio_create_proposal',
        'plutio_update_proposal',
        'plutio_create_contract',
        'plutio_update_contract',
        'plutio_create_proposal_block',
        'plutio_update_proposal_block',
        'plutio_create_contract_block',
        'plutio_update_contract_block',
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
