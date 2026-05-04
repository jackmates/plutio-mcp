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

function pickProposalContractPayload({
  name,
  projectId,
  personId,
  companyId,
  status,
  currency,
  expiresAt,
  issueDate,
  validUntil,
  tags,
  customFields
}) {
  return pick(
    {
      name,
      projectId,
      personId,
      companyId,
      status,
      currency,
      expiresAt,
      issueDate,
      validUntil,
      tags,
      customFields
    },
    [
      'name',
      'projectId',
      'personId',
      'companyId',
      'status',
      'currency',
      'expiresAt',
      'issueDate',
      'validUntil',
      'tags',
      'customFields'
    ]
  );
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderParagraphHtml(text) {
  return `<p>${escapeHtml(text).replace(/\n/g, '</p><p>')}</p>`;
}

function pickDocumentBlockPayload({ entityType, entityId, type, textPlain, textHTML, name, hasText, signatureType, options, includeEntityScope = true }) {
  const resolvedHasText = hasText !== undefined ? hasText : Boolean(textPlain || textHTML);
  return {
    ...(includeEntityScope ? { entityType, entityId } : {}),
    ...pick(
      {
        type,
        name,
        hasText: resolvedHasText,
        textPlain,
        textHTML: textHTML || (textPlain ? renderParagraphHtml(textPlain) : undefined),
        signatureType
      },
      ['type', 'name', 'hasText', 'textPlain', 'textHTML', 'signatureType']
    ),
    ...(options && typeof options === 'object' ? options : {})
  };
}

function createTools(client) {
  return {
    async getBusiness({ business }) {
      return client.request('businesses', { business });
    },

    async findPeople({ search, personId, email, role, status, skip, limit, business }) {
      const filter = {};
      if (personId) {
        filter._id = personId;
      } else if (search) {
        // Plutio people API ignores plain string q — it needs a JSON filter object.
        // Try first name first, then last name if the search looks like it could be either.
        const parts = search.trim().split(/\s+/);
        if (parts.length >= 2) {
          // Full name search: match first name on first part, last name on last part
          filter['name.first'] = { $regex: parts[0], $options: 'i' };
          filter['name.last'] = { $regex: parts[parts.length - 1], $options: 'i' };
        } else {
          // Single word: search both first and last name (use $or-style via first match)
          filter['name.first'] = { $regex: search.trim(), $options: 'i' };
        }
      }
      if (email) filter['contactEmails.address'] = email;
      if (role) filter.role = role;
      if (status) filter.status = status;

      // If we have a single-word search and it might also be a last name,
      // do a second query and merge results
      const baseQuery = pick({ skip, limit }, ['skip', 'limit']);

      if (search && !personId) {
        const parts = search.trim().split(/\s+/);
        if (parts.length < 2) {
          // Try both first and last name, merge unique results
          const firstNameQuery = { ...baseQuery, q: JSON.stringify({ ...filter, 'name.first': { $regex: search.trim(), $options: 'i' } }) };
          const lastNameFilter = { ...filter };
          delete lastNameFilter['name.first'];
          lastNameFilter['name.last'] = { $regex: search.trim(), $options: 'i' };
          const lastNameQuery = { ...baseQuery, q: JSON.stringify(lastNameFilter) };

          const [firstResults, lastResults] = await Promise.all([
            client.request('people', { query: firstNameQuery, business }).catch(() => []),
            client.request('people', { query: lastNameQuery, business }).catch(() => [])
          ]);

          const seen = new Set();
          const merged = [];
          for (const person of [...(Array.isArray(firstResults) ? firstResults : []), ...(Array.isArray(lastResults) ? lastResults : [])]) {
            if (person && person._id && !seen.has(person._id)) {
              seen.add(person._id);
              merged.push(person);
            }
          }
          return merged;
        }
      }

      const q = Object.keys(filter).length ? JSON.stringify(filter) : undefined;
      return client.request('people', {
        query: pick({ q, ...baseQuery }, ['q', 'skip', 'limit']),
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

    async listProposals({ search, status, skip, limit, business }) {
      const filter = {};
      if (status) filter.status = status;
      return client.request('proposals', {
        query: pick({ q: search || (Object.keys(filter).length ? filter : undefined), skip, limit }, ['q', 'skip', 'limit']),
        business
      });
    },

    async listContracts({ search, status, skip, limit, business }) {
      const filter = {};
      if (status) filter.status = status;
      return client.request('contracts', {
        query: pick({ q: search || (Object.keys(filter).length ? filter : undefined), skip, limit }, ['q', 'skip', 'limit']),
        business
      });
    },

    async createProposal(args) {
      const { name, business } = args;
      if (!name) {
        throw new Error('createProposal requires name');
      }
      return client.request('proposals', {
        method: 'POST',
        business,
        body: pickProposalContractPayload(args)
      });
    },

    async updateProposal({ proposalId, id, business, ...updates }) {
      const canonicalProposalId = proposalId || id;
      if (!canonicalProposalId) {
        throw new Error('updateProposal requires proposalId (canonical proposal _id).');
      }
      return client.request('proposals', {
        method: 'PUT',
        business,
        body: {
          _id: canonicalProposalId,
          ...pickProposalContractPayload(updates)
        }
      });
    },

    async createContract(args) {
      const { name, business } = args;
      if (!name) {
        throw new Error('createContract requires name');
      }
      return client.request('contracts', {
        method: 'POST',
        business,
        body: pickProposalContractPayload(args)
      });
    },

    async updateContract({ contractId, id, business, ...updates }) {
      const canonicalContractId = contractId || id;
      if (!canonicalContractId) {
        throw new Error('updateContract requires contractId (canonical contract _id).');
      }
      return client.request('contracts', {
        method: 'PUT',
        business,
        body: {
          _id: canonicalContractId,
          ...pickProposalContractPayload(updates)
        }
      });
    },

    async createProposalBlock({ entityId, type, textPlain, textHTML, name, hasText, signatureType, options, business }) {
      return client.request('blocks', {
        method: 'POST',
        business,
        body: pickDocumentBlockPayload({
          entityType: 'proposal',
          entityId,
          type,
          textPlain,
          textHTML,
          name,
          hasText,
          signatureType,
          options
        })
      });
    },

    async updateProposalBlock({ blockId, type, textPlain, textHTML, name, hasText, signatureType, options, business }) {
      return client.request('blocks', {
        method: 'PUT',
        business,
        body: {
          _id: blockId,
          ...pickDocumentBlockPayload({
            entityType: 'proposal',
            entityId: undefined,
            type,
            textPlain,
            textHTML,
            name,
            hasText,
            signatureType,
            options,
            includeEntityScope: false
          })
        }
      });
    },

    async createContractBlock({ entityId, type, textPlain, textHTML, name, hasText, signatureType, options, business }) {
      return client.request('blocks', {
        method: 'POST',
        business,
        body: pickDocumentBlockPayload({
          entityType: 'contract',
          entityId,
          type,
          textPlain,
          textHTML,
          name,
          hasText,
          signatureType,
          options
        })
      });
    },

    async updateContractBlock({ blockId, type, textPlain, textHTML, name, hasText, signatureType, options, business }) {
      return client.request('blocks', {
        method: 'PUT',
        business,
        body: {
          _id: blockId,
          ...pickDocumentBlockPayload({
            entityType: 'contract',
            entityId: undefined,
            type,
            textPlain,
            textHTML,
            name,
            hasText,
            signatureType,
            options,
            includeEntityScope: false
          })
        }
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
