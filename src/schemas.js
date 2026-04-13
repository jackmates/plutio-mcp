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
  search: optionalString.describe('Free-text search for people.'),
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
  textPlain: optionalString.describe('Optional plain-text body. If supplied, the generated content block is updated.'),
  textHTML: optionalString.describe('Optional HTML body. If omitted but textPlain is supplied, a simple paragraph HTML wrapper is generated.'),
  status: optionalString.describe('Optional page status. Defaults to draft if omitted by Plutio.'),
  ...businessOverride
});

const listBlocksSchema = z.object({
  entityType: optionalString.describe('Optional entity type to scope blocks.'),
  entityId: optionalString.describe('Optional entity id to scope blocks.'),
  ...paging,
  ...businessOverride
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
  listBlocksSchema
};
