const {
  pickDefined,
  normalizeTaskResult,
  resolveTaskPlacement,
  getTaskByRecordId
} = require('./helpers');

function pick(obj, keys) {
  return pickDefined(obj, keys);
}

function withPaging(filter, skip, limit) {
  return {
    ...pick({ skip, limit }, ['skip', 'limit']),
    ...(filter && Object.keys(filter).length ? { q: filter } : {})
  };
}

function pickTaskPayload({
  title,
  projectId,
  taskBoardId,
  taskGroupId,
  assignedTo,
  followers,
  dueDate,
  descriptionPlain,
  customFields,
  status
}) {
  return pick(
    {
      title,
      projectId,
      taskBoardId,
      taskGroupId,
      assignedTo,
      followers,
      dueDate,
      descriptionPlain,
      customFields,
      status
    },
    [
      'title',
      'projectId',
      'taskBoardId',
      'taskGroupId',
      'assignedTo',
      'followers',
      'dueDate',
      'descriptionPlain',
      'customFields',
      'status'
    ]
  );
}

function createTools(client) {
  return {
    async getBusiness({ business }) {
      return client.request('businesses', { business });
    },

    async findPeople({ search, skip, limit, business }) {
      return client.request('people', {
        query: pick({ q: search, skip, limit }, ['q', 'skip', 'limit']),
        business
      });
    },

    async findProjects({ search, skip, limit, business }) {
      return client.request('projects', {
        query: pick({ q: search, skip, limit }, ['q', 'skip', 'limit']),
        business
      });
    },

    async listCompanies({ search, skip, limit, business }) {
      return client.request('companies', {
        query: pick({ q: search, skip, limit }, ['q', 'skip', 'limit']),
        business
      });
    },

    async listStatuses({ search, skip, limit, business }) {
      return client.request('statuses', {
        query: pick({ q: search, skip, limit }, ['q', 'skip', 'limit']),
        business
      });
    },

    async listCustomFields({ entityType, skip, limit, business }) {
      const filter = {};
      if (entityType) filter.entityType = entityType;
      return client.request('custom-fields', {
        query: withPaging(filter, skip, limit),
        business
      });
    },

    async listComments({ entityType, entityId, skip, limit, business }) {
      return client.request('comments', {
        query: pick({ entityType, entityId, skip, limit }, ['entityType', 'entityId', 'skip', 'limit']),
        business
      });
    },

    async createComment({ entityType, entityId, bodyPlain, business }) {
      return client.request('comments', {
        method: 'POST',
        business,
        body: {
          entityType,
          entityId,
          bodyPlain
        }
      });
    },

    async listFiles({ entityType, entityId, skip, limit, business }) {
      const filter = {};
      if (entityType) filter.entityType = entityType;
      if (entityId) filter.entityId = entityId;
      return client.request('files', {
        query: withPaging(filter, skip, limit),
        business
      });
    },

    async listConversations({ search, skip, limit, business }) {
      return client.request('conversations', {
        query: pick({ q: search, skip, limit }, ['q', 'skip', 'limit']),
        business
      });
    },

    async listWiki({ search, skip, limit, business }) {
      return client.request('wiki', {
        query: pick({ q: search, skip, limit }, ['q', 'skip', 'limit']),
        business
      });
    },

    async createWiki({ title, entityType, entityId, business }) {
      return client.request('wiki', {
        method: 'POST',
        business,
        body: pick({ title, entityType, entityId }, ['title', 'entityType', 'entityId'])
      });
    },

    async createWikiPage({ wikiId, parentId, title, textPlain, textHTML, status, business }) {
      const page = await client.request('wiki-entities', {
        method: 'POST',
        business,
        body: pick({ wikiId, parentId: parentId || wikiId, title, type: 'page', status }, ['wikiId', 'parentId', 'title', 'type', 'status'])
      });

      if (textPlain) {
        const blocks = await client.request('blocks', {
          query: { entityType: 'wiki-page', entityId: page._id, limit: 20 },
          business
        });
        const contentBlock = Array.isArray(blocks) ? blocks.find((block) => block.type === 'content') : null;
        if (!contentBlock) {
          throw new Error(`Created wiki page ${page._id} but could not find its generated content block for text update.`);
        }

        const renderedHtml = textHTML || `<p>${String(textPlain)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '</p><p>')}</p>`;

        const updatedContentBlock = await client.request('blocks', {
          method: 'PUT',
          business,
          body: {
            _id: contentBlock._id,
            hasText: true,
            textPlain,
            textHTML: renderedHtml
          }
        });

        return {
          page,
          contentBlock: updatedContentBlock
        };
      }

      return { page };
    },

    async listBlocks({ entityType, entityId, skip, limit, business }) {
      const filter = {};
      if (entityType) filter.entityType = entityType;
      if (entityId) filter.entityId = entityId;
      return client.request('blocks', {
        query: withPaging(filter, skip, limit),
        business
      });
    },

    async listTaskBoards({ projectId, skip, limit, business }) {
      const filter = projectId ? { projectId } : {};
      return client.request('task-boards', { query: withPaging(filter, skip, limit), business });
    },

    async listTaskGroups({ taskBoardId, skip, limit, business }) {
      const filter = taskBoardId ? { taskBoardId } : {};
      return client.request('task-groups', { query: withPaging(filter, skip, limit), business });
    },

    async listTasks({ taskRecordId, assignedTo, projectId, taskBoardId, taskGroupId, dueDateFrom, dueDateTo, customFieldId, customFieldValue, skip, limit, business }) {
      const filter = {};
      if (taskRecordId) filter._id = taskRecordId;
      if (assignedTo) filter.assignedTo = assignedTo;
      if (projectId) filter.projectId = projectId;
      if (taskBoardId) filter.taskBoardId = taskBoardId;
      if (taskGroupId) filter.taskGroupId = taskGroupId;
      if (dueDateFrom || dueDateTo) {
        filter.dueDate = pick({ $gte: dueDateFrom, $lte: dueDateTo }, ['$gte', '$lte']);
      }
      if (customFieldId && customFieldValue) {
        filter.customFields = {
          $elemMatch: {
            _id: customFieldId,
            value: customFieldValue
          }
        };
      }

      const result = await client.request('tasks', {
        query: withPaging(filter, skip, limit),
        business
      });
      return normalizeTaskResult(result);
    },

    async listTimeTracks({ personId, projectId, startedAtFrom, startedAtTo, skip, limit, business }) {
      const filter = {};
      if (personId) filter.personId = personId;
      if (projectId) filter.projectId = projectId;
      if (startedAtFrom || startedAtTo) {
        filter.startedAt = pick({ $gte: startedAtFrom, $lte: startedAtTo }, ['$gte', '$lte']);
      }

      return client.request('time-tracks', {
        query: withPaging(filter, skip, limit),
        business
      });
    },

    async getTask({ taskRecordId, business }) {
      return getTaskByRecordId(client, { taskRecordId, business });
    },

    async createTask(args) {
      const { title, business } = args;
      if (!title) {
        throw new Error('createTask requires title');
      }

      const created = await client.request('tasks', {
        method: 'POST',
        business,
        body: pickTaskPayload(args)
      });
      return normalizeTaskResult(created);
    },

    async createTaskSafe({ projectTitle, taskBoardTitle, taskGroupTitle, business, ...args }) {
      const { title } = args;
      if (!title) {
        throw new Error('createTaskSafe requires title');
      }

      const placement = await resolveTaskPlacement(client, {
        projectId: args.projectId,
        projectTitle,
        taskBoardId: args.taskBoardId,
        taskBoardTitle,
        taskGroupId: args.taskGroupId,
        taskGroupTitle,
        business
      });

      const created = await client.request('tasks', {
        method: 'POST',
        business,
        body: pickTaskPayload({
          ...args,
          projectId: placement.projectId,
          taskBoardId: placement.taskBoardId,
          taskGroupId: placement.taskGroupId
        })
      });

      return {
        placement,
        task: normalizeTaskResult(created)
      };
    },

    async updateTask({ taskRecordId, taskId, business, ...updates }) {
      const canonicalTaskId = taskRecordId || taskId;
      if (!canonicalTaskId) {
        throw new Error('updateTask requires taskRecordId (canonical task _id).');
      }

      const updated = await client.request('tasks', {
        method: 'PUT',
        business,
        body: {
          _id: canonicalTaskId,
          ...pickTaskPayload(updates)
        }
      });
      return normalizeTaskResult(updated);
    },

    async updateTaskSafe({ taskRecordId, taskId, projectTitle, taskBoardTitle, taskGroupTitle, business, ...updates }) {
      const canonicalTaskId = taskRecordId || taskId;
      if (!canonicalTaskId) {
        throw new Error('updateTaskSafe requires taskRecordId (canonical task _id).');
      }

      const currentTask = await getTaskByRecordId(client, { taskRecordId: canonicalTaskId, business });
      const placement = await resolveTaskPlacement(client, {
        projectId: updates.projectId || currentTask.projectId,
        projectTitle,
        taskBoardId: updates.taskBoardId || currentTask.taskBoardId,
        taskBoardTitle,
        taskGroupId: updates.taskGroupId || currentTask.taskGroupId,
        taskGroupTitle,
        business
      });

      const updated = await client.request('tasks', {
        method: 'PUT',
        business,
        body: {
          _id: canonicalTaskId,
          ...pickTaskPayload({
            ...updates,
            projectId: placement.projectId,
            taskBoardId: placement.taskBoardId,
            taskGroupId: placement.taskGroupId
          })
        }
      });

      return {
        placement,
        task: normalizeTaskResult(updated)
      };
    },

    async createTasksBulk({ tasks, business }) {
      const results = [];

      for (const [index, task] of tasks.entries()) {
        try {
          const created = await client.request('tasks', {
            method: 'POST',
            business,
            body: pickTaskPayload(task)
          });
          results.push({ index, ok: true, task: normalizeTaskResult(created) });
        } catch (error) {
          results.push({ index, ok: false, error: error.message || String(error) });
        }
      }

      return { results };
    }
  };
}

module.exports = {
  createTools
};
