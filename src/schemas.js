const { z } = require('zod');

const optionalString = z.string().min(1).optional();

const businessOverride = {
  business: optionalString.describe('Optional Plutio business slug override. Falls back to PLUTIO_BUSINESS.')
};

const paging = {
  skip: z.number().int().min(0).optional().describe('Optional number of items to skip.'),
  limit: z.number().int().min(1).max(1000).optional().describe('Optional max number of items to return.')
};

const getBusinessSchema = z.object({
  ...businessOverride
});

const findPeopleSchema = z.object({
  search: optionalString.describe('Search by first name, last name, or full name. Converted to a Plutio name filter internally.'),
  personId: optionalString.describe('Exact person record _id to look up.'),
  email: optionalString.describe('Search by email address (exact match on contactEmails).'),
  role: optionalString.describe('Filter by role, e.g. team, client, co-owner.'),
  status: optionalString.describe('Filter by status, e.g. active, inactive.'),
  ...paging,
  ...businessOverride
});

const findProjectsSchema = z.object({
  search: optionalString.describe('Free-text search for projects.'),
  ...paging,
  ...businessOverride
});

const listCustomFieldsSchema = z.object({
  entityType: optionalString.describe('Optional entity type to filter custom fields.'),
  ...paging,
  ...businessOverride
});

const listCommentsSchema = z.object({
  entityType: z.string().min(1).describe('Entity type, e.g. task or wiki.'),
  entityId: z.string().min(1).describe('Entity id for the parent entity.'),
  ...paging,
  ...businessOverride
});

const createCommentSchema = z.object({
  entityType: z.string().min(1).describe('Entity type the comment attaches to. Allowed by Plutio: conversation, file, task.'),
  entityId: z.string().min(1).describe('Parent entity id the comment belongs to.'),
  bodyPlain: z.string().min(1).describe('Plain-text comment body to create.'),
  ...businessOverride
});

const listTaskBoardsSchema = z.object({
  projectId: optionalString.describe('Optional project id to scope task boards.'),
  ...paging,
  ...businessOverride
});

const listTaskGroupsSchema = z.object({
  taskBoardId: optionalString.describe('Optional task board id to scope task groups.'),
  ...paging,
  ...businessOverride
});

const listTasksSchema = z.object({
  taskRecordId: optionalString.describe('Optional canonical task record _id filter.'),
  assignedTo: optionalString.describe('Optional person id.'),
  projectId: optionalString.describe('Optional project id.'),
  taskBoardId: optionalString.describe('Optional task board id.'),
  taskGroupId: optionalString.describe('Optional task group id.'),
  dueDateFrom: optionalString.describe('Optional ISO date lower bound for dueDate.'),
  dueDateTo: optionalString.describe('Optional ISO date upper bound for dueDate.'),
  customFieldId: optionalString.describe('Optional custom field id.'),
  customFieldValue: optionalString.describe('Optional custom field value.'),
  ...paging,
  ...businessOverride
});

const listTimeTracksSchema = z.object({
  personId: optionalString.describe('Optional person id.'),
  projectId: optionalString.describe('Optional project id.'),
  startedAtFrom: optionalString.describe('Optional ISO datetime lower bound.'),
  startedAtTo: optionalString.describe('Optional ISO datetime upper bound.'),
  ...paging,
  ...businessOverride
});

const taskPayloadFields = {
  title: z.string().min(1).optional().describe('Task title.'),
  projectId: optionalString.describe('Optional project id.'),
  taskBoardId: optionalString.describe('Optional task board id.'),
  taskGroupId: optionalString.describe('Optional task group id.'),
  assignedTo: z.array(z.string().min(1)).optional().describe('Optional array of assignee person ids.'),
  followers: z.array(z.string().min(1)).optional().describe('Optional array of follower person ids.'),
  dueDate: optionalString.describe('Optional ISO due date.'),
  descriptionPlain: optionalString.describe('Optional plain-text task description.'),
  customFields: z.array(z.any()).optional().describe('Optional raw customFields payload passed through to Plutio.')
};

const placementFields = {
  projectTitle: optionalString.describe('Optional exact project title for safe placement resolution.'),
  taskBoardTitle: optionalString.describe('Optional exact task board title for safe placement resolution.'),
  taskGroupTitle: optionalString.describe('Optional exact task group title for safe placement resolution.')
};

const createTaskSchema = z.object({
  ...taskPayloadFields,
  title: z.string().min(1).describe('Task title.'),
  ...businessOverride
});

const createTaskSafeSchema = z.object({
  ...taskPayloadFields,
  ...placementFields,
  title: z.string().min(1).describe('Task title.'),
  ...businessOverride
});

const getTaskSchema = z.object({
  taskRecordId: z.string().min(1).describe('Canonical task record _id.'),
  ...businessOverride
});

const updateTaskSchema = z.object({
  taskRecordId: optionalString.describe('Canonical task record _id to update.'),
  taskId: optionalString.describe('Legacy alias for taskRecordId. Prefer taskRecordId.'),
  ...taskPayloadFields,
  status: optionalString.describe('Optional task status value.'),
  ...businessOverride
}).refine(
  (data) => Boolean(data.taskRecordId || data.taskId),
  {
    message: 'updateTask requires taskRecordId (canonical task _id).'
  }
).refine(
  (data) => Object.keys(data).some((key) => !['taskRecordId', 'taskId', 'business'].includes(key) && data[key] !== undefined),
  {
    message: 'updateTask requires at least one field to update.'
  }
);

const updateTaskSafeSchema = z.object({
  taskRecordId: optionalString.describe('Canonical task record _id to update.'),
  taskId: optionalString.describe('Legacy alias for taskRecordId. Prefer taskRecordId.'),
  ...taskPayloadFields,
  ...placementFields,
  status: optionalString.describe('Optional task status value.'),
  ...businessOverride
}).refine(
  (data) => Boolean(data.taskRecordId || data.taskId),
  {
    message: 'updateTaskSafe requires taskRecordId (canonical task _id).'
  }
).refine(
  (data) => Object.keys(data).some((key) => !['taskRecordId', 'taskId', 'business'].includes(key) && data[key] !== undefined),
  {
    message: 'updateTaskSafe requires at least one field to update.'
  }
);

const createTasksBulkSchema = z.object({
  tasks: z.array(
    z.object({
      ...taskPayloadFields,
      title: z.string().min(1).describe('Task title.')
    })
  ).min(1).describe('Array of tasks to create.'),
  ...businessOverride
});

const listCompaniesSchema = z.object({
  search: optionalString.describe('Free-text search for companies.'),
  ...paging,
  ...businessOverride
});

const listStatusesSchema = z.object({
  search: optionalString.describe('Optional free-text search for statuses.'),
  ...paging,
  ...businessOverride
});

const listFilesSchema = z.object({
  entityType: optionalString.describe('Optional entity type to scope files.'),
  entityId: optionalString.describe('Optional parent entity id to scope files.'),
  ...paging,
  ...businessOverride
});

const listConversationsSchema = z.object({
  search: optionalString.describe('Optional free-text search for conversations.'),
  ...paging,
  ...businessOverride
});

const listWikiSchema = z.object({
  search: optionalString.describe('Optional free-text search for wiki entries.'),
  ...paging,
  ...businessOverride
});

const createWikiSchema = z.object({
  title: z.string().min(1).describe('Wiki title.'),
  entityType: optionalString.describe('Optional parent entity type, e.g. project.'),
  entityId: optionalString.describe('Optional parent entity id, e.g. a project id.'),
  ...businessOverride
});

const createWikiPageSchema = z.object({
  wikiId: z.string().min(1).describe('Parent wiki id.'),
  parentId: optionalString.describe('Optional parent id within the wiki tree. Defaults to wikiId for a top-level page.'),
  title: z.string().min(1).describe('Wiki page title.'),
  textPlain: optionalString.describe('Optional plain-text body. Updates the auto-generated content block if supplied.'),
  textHTML: optionalString.describe('Optional HTML body. Now also triggers the content-block update on its own (plain text is auto-derived from the HTML for the search index). Pair with textPlain for full control.'),
  status: optionalString.describe("Optional page status: 'draft' (default) or 'published'."),
  type: optionalString.describe("Optional entity type. 'page' (default) or 'category' for a folder/section."),
  designOptions: z.record(z.string(), z.unknown()).optional().describe('Optional style block applied at creation. Same shape as Plutio returns on read (id, maxWidth, section{...}, fonts, etc.).'),
  icon: z.record(z.string(), z.unknown()).optional().describe('Optional icon object.'),
  meta: z.record(z.string(), z.unknown()).optional().describe('Optional meta object (cover image, etc.).'),
  index: z.number().int().optional().describe('Optional sort index among siblings.'),
  ...businessOverride
});

const listProposalsSchema = z.object({
  search: optionalString.describe('Optional free-text search for proposals.'),
  status: optionalString.describe('Optional proposal status filter.'),
  ...paging,
  ...businessOverride
});

const listContractsSchema = z.object({
  search: optionalString.describe('Optional free-text search for contracts.'),
  status: optionalString.describe('Optional contract status filter.'),
  ...paging,
  ...businessOverride
});

const proposalContractFields = {
  name: optionalString.describe('Document name. Plutio create for proposals/contracts expects name, not title.'),
  projectId: optionalString.describe('Optional project id.'),
  personId: optionalString.describe('Optional person/client id.'),
  companyId: optionalString.describe('Optional company id.'),
  status: optionalString.describe('Optional document status.'),
  currency: optionalString.describe('Optional currency code.'),
  expiresAt: optionalString.describe('Optional ISO datetime expiration.'),
  issueDate: optionalString.describe('Optional ISO datetime issue date.'),
  validUntil: optionalString.describe('Optional ISO datetime valid-until date.'),
  tags: z.array(z.string().min(1)).optional().describe('Optional tag list.'),
  customFields: z.array(z.any()).optional().describe('Optional raw customFields payload passed through to Plutio.')
};

const createProposalSchema = z.object({
  name: z.string().min(1).describe('Proposal name. Use name, not title.'),
  ...proposalContractFields,
  ...businessOverride
});

const updateProposalSchema = z.object({
  proposalId: optionalString.describe('Canonical proposal record _id to update.'),
  id: optionalString.describe('Legacy alias for proposalId. Prefer proposalId.'),
  ...proposalContractFields,
  ...businessOverride
}).refine(
  (data) => Boolean(data.proposalId || data.id),
  {
    message: 'updateProposal requires proposalId (canonical proposal _id).'
  }
).refine(
  (data) => Object.keys(data).some((key) => !['proposalId', 'id', 'business'].includes(key) && data[key] !== undefined),
  {
    message: 'updateProposal requires at least one field to update.'
  }
);

const createContractSchema = z.object({
  name: z.string().min(1).describe('Contract name. Use name, not title.'),
  ...proposalContractFields,
  ...businessOverride
});

const updateContractSchema = z.object({
  contractId: optionalString.describe('Canonical contract record _id to update.'),
  id: optionalString.describe('Legacy alias for contractId. Prefer contractId.'),
  ...proposalContractFields,
  ...businessOverride
}).refine(
  (data) => Boolean(data.contractId || data.id),
  {
    message: 'updateContract requires contractId (canonical contract _id).'
  }
).refine(
  (data) => Object.keys(data).some((key) => !['contractId', 'id', 'business'].includes(key) && data[key] !== undefined),
  {
    message: 'updateContract requires at least one field to update.'
  }
);

const documentBlockFields = {
  entityId: z.string().min(1).describe('Parent proposal/contract record _id.'),
  type: z.enum(['content', 'html', 'signature']).describe('Validated safe block types for proposal/contract MCP writes.'),
  textPlain: optionalString.describe('Optional plain text for content/html blocks.'),
  textHTML: optionalString.describe('Optional HTML for content/html blocks. For proposals/contracts, images are often embedded via HTML in content blocks.'),
  name: optionalString.describe('Optional block name/title when supported.'),
  hasText: z.boolean().optional().describe('Optional hasText override. Defaults to true when textPlain or textHTML is supplied.'),
  signatureType: optionalString.describe('Optional signature type for signature blocks if the API requires it.'),
  options: z.any().optional().describe('Optional raw extra block fields for validated document-block experiments.'),
  ...businessOverride
};

const createProposalBlockSchema = z.object({
  ...documentBlockFields
});

const updateProposalBlockSchema = z.object({
  blockId: z.string().min(1).describe('Proposal block _id to update.'),
  type: z.enum(['content', 'html', 'signature']).optional().describe('Optional validated block type.'),
  textPlain: optionalString.describe('Optional plain text update.'),
  textHTML: optionalString.describe('Optional HTML update.'),
  name: optionalString.describe('Optional block name/title update.'),
  hasText: z.boolean().optional().describe('Optional hasText override.'),
  signatureType: optionalString.describe('Optional signature type update.'),
  options: z.any().optional().describe('Optional raw extra block fields for validated document-block experiments.'),
  ...businessOverride
}).refine(
  (data) => Object.keys(data).some((key) => !['blockId', 'business'].includes(key) && data[key] !== undefined),
  {
    message: 'updateProposalBlock requires at least one field to update.'
  }
);

const createContractBlockSchema = z.object({
  ...documentBlockFields
});

const updateContractBlockSchema = z.object({
  blockId: z.string().min(1).describe('Contract block _id to update.'),
  type: z.enum(['content', 'html', 'signature']).optional().describe('Optional validated block type.'),
  textPlain: optionalString.describe('Optional plain text update.'),
  textHTML: optionalString.describe('Optional HTML update.'),
  name: optionalString.describe('Optional block name/title update.'),
  hasText: z.boolean().optional().describe('Optional hasText override.'),
  signatureType: optionalString.describe('Optional signature type update.'),
  options: z.any().optional().describe('Optional raw extra block fields for validated document-block experiments.'),
  ...businessOverride
}).refine(
  (data) => Object.keys(data).some((key) => !['blockId', 'business'].includes(key) && data[key] !== undefined),
  {
    message: 'updateContractBlock requires at least one field to update.'
  }
);

const listBlocksSchema = z.object({
  entityType: optionalString.describe('Optional entity type to scope blocks.'),
  entityId: optionalString.describe('Optional entity id to scope blocks.'),
  ...paging,
  ...businessOverride
});

// ─── Task group writes ──────────────────────────────────────────────────────

const createTaskGroupSchema = z.object({
  taskBoardId: z.string().min(1).describe('ID of the task board the new group belongs to. Required.'),
  title: optionalString.describe('Display name for the group (e.g. "Backlog", "In Progress", "Done"). Min 1, max 256 chars.'),
  color: optionalString.describe('Display color for the group.'),
  projectId: optionalString.describe('Optional project id this group belongs to.'),
  position: z.number().int().min(0).optional().describe('Optional position/order index within the task board (0 = first column).'),
  isDefault: z.boolean().optional().describe('If true, mark as the default group for its context.'),
  ...businessOverride
});

const updateTaskGroupSchema = z.object({
  _id: z.string().min(1).describe('Canonical task group _id to update.'),
  title: optionalString.describe('New title.'),
  color: optionalString.describe('New display color.'),
  taskBoardId: optionalString.describe('Optional move-to-board id.'),
  projectId: optionalString.describe('Optional project id.'),
  isDefault: z.boolean().optional(),
  ...businessOverride
}).refine(
  (data) => Object.keys(data).some((key) => !['_id', 'business'].includes(key) && data[key] !== undefined),
  { message: 'updateTaskGroup requires at least one field to update.' }
);

const moveTaskGroupSchema = z.object({
  _id: z.string().min(1).describe('Canonical task group _id to move.'),
  taskBoardId: z.string().min(1).describe('Destination task board id (can be the same as the current one for simple reorder).'),
  position: z.number().int().min(0).describe('New position/order index within the destination task board (0 = first column).'),
  ...businessOverride
});

const copyTaskGroupSchema = z.object({
  _id: z.string().min(1).describe('Canonical task group _id to copy.'),
  taskBoardId: z.string().min(1).describe('Destination task board id for the copy (can be the same board to duplicate inline).'),
  position: z.number().int().min(0).describe('Position/order index where the copy should land in the destination board.'),
  ...businessOverride
});

const archiveTaskGroupSchema = z.object({
  _id: z.string().min(1).describe('Canonical task group _id to archive or unarchive.'),
  isArchived: z.boolean().describe('true to archive, false to restore from archive.'),
  ...businessOverride
});

const deleteTaskGroupSchema = z.object({
  _id: z.string().min(1).describe('Canonical task group _id to permanently delete. Cannot be undone.'),
  ...businessOverride
});

const deleteTaskSchema = z.object({
  taskRecordId: optionalString.describe('Canonical task record _id to permanently delete.'),
  taskId: optionalString.describe('Legacy alias for taskRecordId. Prefer taskRecordId.'),
  ...businessOverride
}).refine(
  (data) => Boolean(data.taskRecordId || data.taskId),
  { message: 'deleteTask requires taskRecordId (canonical task _id).' }
);

// ─── Wiki reads/writes ──────────────────────────────────────────────────────
//
// Important: Plutio's wiki API uses path names `/wiki` (singular) for the
// container and `/wiki-entities` for both pages AND categories. The plural
// forms `/wikis` and `/wiki-pages` return 403 at the Plutio edge.

const wikiDesignOptionsField = z
  .record(z.string(), z.unknown())
  .optional()
  .describe('Style block. May include id, maxWidth, section.{bgColor,padding,...}, font settings, etc. Pass full or partial; Plutio merges shallowly.');

const getWikiSchema = z.object({
  wikiId: z.string().min(1).describe('Canonical wiki _id.'),
  ...businessOverride
});

const getWikiPageSchema = z.object({
  pageId: z.string().min(1).describe('Canonical wiki-entity _id (a page or category).'),
  wikiId: optionalString.describe('Optional wikiId — speeds up the lookup by scoping the list query.'),
  ...businessOverride
});

const listWikiPagesSchema = z.object({
  wikiId: optionalString.describe('Filter by wiki container _id.'),
  parentId: optionalString.describe('Filter by parent page/category _id (use the wikiId for top-level pages).'),
  status: optionalString.describe("Filter by status, e.g. 'draft' or 'published'."),
  type: optionalString.describe("Filter by entity type. 'page' for content pages, 'category' for folders."),
  ...paging,
  ...businessOverride
});

const updateWikiSchema = z.object({
  wikiId: z.string().min(1).describe('Canonical wiki _id to update.'),
  title: optionalString,
  description: optionalString,
  designOptions: wikiDesignOptionsField,
  shareSettings: z.record(z.string(), z.unknown()).optional(),
  privateShareSettings: z.record(z.string(), z.unknown()).optional(),
  logo: z.record(z.string(), z.unknown()).optional(),
  iconImage: z.record(z.string(), z.unknown()).optional(),
  color: optionalString,
  index: z.number().int().optional(),
  ...businessOverride
}).refine(
  (data) => Object.keys(data).some((k) => !['wikiId', 'business'].includes(k) && data[k] !== undefined),
  { message: 'updateWiki requires at least one field to update.' }
);

const wikiPageMutableFields = {
  title: optionalString,
  parentId: optionalString.describe('New parent _id (or wikiId for top-level).'),
  status: optionalString.describe("'draft' | 'published'."),
  designOptions: wikiDesignOptionsField,
  icon: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  index: z.number().int().optional(),
  type: optionalString.describe("'page' or 'category' — only set when intentionally converting between types.")
};

const updateWikiPageSchema = z.object({
  pageId: z.string().min(1).describe('Canonical wiki-entity _id to update.'),
  ...wikiPageMutableFields,
  ...businessOverride
}).refine(
  (data) => Object.keys(wikiPageMutableFields).some((k) => data[k] !== undefined),
  { message: 'updateWikiPage requires at least one field to update.' }
);

const moveWikiPageSchema = z.object({
  pageId: z.string().min(1).describe('Canonical wiki-entity _id to move.'),
  parentId: z.string().min(1).describe('New parent — pass the wikiId to move to top level.'),
  position: z.number().int().min(0).describe('Position among siblings (0 = first).'),
  ...businessOverride
});

const publishWikiPageSchema = z.object({
  pageId: z.string().min(1),
  ...businessOverride
});

const deleteWikiSchema = z.object({
  wikiId: z.string().min(1).describe('Canonical wiki _id to permanently delete (cascades to its pages).'),
  ...businessOverride
});

const deleteWikiPageSchema = z.object({
  pageId: z.string().min(1).describe('Canonical wiki-entity _id to permanently delete.'),
  ...businessOverride
});

const updateWikiBlockSchema = z.object({
  blockId: z.string().min(1).describe('Canonical block _id to update.'),
  textHTML: optionalString,
  textPlain: optionalString,
  designOptions: wikiDesignOptionsField,
  type: optionalString,
  ...businessOverride
}).refine(
  (data) => ['textHTML', 'textPlain', 'designOptions', 'type'].some((k) => data[k] !== undefined),
  { message: 'updateWikiBlock requires at least one field to update.' }
);

const deleteWikiBlockSchema = z.object({
  blockId: z.string().min(1).describe('Canonical block _id to permanently delete.'),
  ...businessOverride
});

const wikiPageInputFields = {
  wikiId: z.string().min(1).describe('Wiki container _id this page belongs to.'),
  title: z.string().min(1).describe('Page title.'),
  parentId: optionalString.describe('Parent _id (defaults to wikiId for top-level placement).'),
  textPlain: optionalString.describe('Plain-text body. If supplied, the auto-generated content block is updated.'),
  textHTML: optionalString.describe('HTML body. NOW updates the content block even if textPlain is omitted (auto-derives plain text from the HTML).'),
  status: optionalString.describe("'draft' or 'published'."),
  type: optionalString.describe("'page' (default) or 'category'."),
  designOptions: wikiDesignOptionsField,
  icon: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  index: z.number().int().optional()
};

const createWikiPagesBulkSchema = z.object({
  pages: z.array(z.object({ ...wikiPageInputFields })).min(1).describe('Pages to create. Each item is a full create payload.'),
  ...businessOverride
});

const updateWikiPagesBulkSchema = z.object({
  updates: z.array(z.object({
    pageId: z.string().min(1),
    ...wikiPageMutableFields
  })).min(1).describe('Updates to apply. Each item is a partial update keyed by pageId.'),
  ...businessOverride
});

// ─── Escape-hatch tools ──────────────────────────────────────────────────────

const apiReferenceSchema = z.object({
  category: optionalString.describe(
    "Optional category filter (e.g. 'crm', 'project-management', 'documents', 'communication', 'admin')."
  ),
  mode: z
    .enum(['always', 'read', 'write'])
    .optional()
    .describe('Optional filter by tool mode: always (always shown), read (read tools), write (write tools).')
});

const requestSchema = z.object({
  method: z
    .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'get', 'post', 'put', 'patch', 'delete'])
    .default('GET')
    .describe('HTTP method. Server enforces GET-only when PLUTIO_MCP_MODE=readonly.'),
  path: z
    .string()
    .min(1)
    .describe(
      "API path relative to the configured Plutio API base. Example: 'people', 'projects/abc123', 'time-tracks'. Do NOT include the host."
    ),
  query: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Query string parameters. Object values are JSON-stringified into the URL — Plutio's `q` filter accepts this shape directly."
    ),
  body: z.unknown().optional().describe('Optional JSON body for POST/PUT/PATCH requests.'),
  ...businessOverride
});

const workspaceSchemaSchema = z.object({
  refresh: z
    .boolean()
    .optional()
    .describe('If true, bypass the 5-minute cache and re-fetch custom fields.'),
  ...businessOverride
});

const rateLimitStatusSchema = z.object({});

// ─── Compound: client_360 ────────────────────────────────────────────────────

const client360Schema = z
  .object({
    personId: optionalString.describe('Most direct: a Plutio person _id. Wins over email/name when set.'),
    email: optionalString.describe('Email address. Looks up the person by contactEmails.email.'),
    name: z
      .object({
        first: optionalString,
        last: optionalString
      })
      .optional()
      .describe('Partial name — first and/or last. Case-insensitive regex match.'),
    includeProjects: z.boolean().optional().default(true),
    includeInvoices: z.boolean().optional().default(true),
    includeSubscriptions: z.boolean().optional().default(true),
    ...businessOverride
  })
  .refine((data) => Boolean(data.personId || data.email || data.name), {
    message: 'Provide one of personId, email, or name.{first,last}.'
  });

module.exports = {
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
  client360Schema,
  createTaskGroupSchema,
  updateTaskGroupSchema,
  moveTaskGroupSchema,
  copyTaskGroupSchema,
  archiveTaskGroupSchema,
  deleteTaskGroupSchema,
  deleteTaskSchema,
  getWikiSchema,
  getWikiPageSchema,
  listWikiPagesSchema,
  updateWikiSchema,
  updateWikiPageSchema,
  moveWikiPageSchema,
  publishWikiPageSchema,
  deleteWikiSchema,
  deleteWikiPageSchema,
  updateWikiBlockSchema,
  deleteWikiBlockSchema,
  createWikiPagesBulkSchema,
  updateWikiPagesBulkSchema
};
