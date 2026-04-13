function pickDefined(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (obj && obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

function stripTaskIdentity(task) {
  if (!task || typeof task !== 'object') return task;
  return {
    ...task,
    canonicalTaskId: task._id || null,
    legacyTaskNumber: task.taskId ?? null
  };
}

function normalizeTaskResult(result) {
  if (Array.isArray(result)) {
    return result.map(stripTaskIdentity);
  }
  return stripTaskIdentity(result);
}

function getDisplayName(record) {
  return record?.title || record?.name || '';
}

async function findUniqueByExactTitle(fetcher, title, entityLabel) {
  const records = await fetcher();
  const exact = records.filter((record) => getDisplayName(record) === title);

  if (exact.length === 1) return exact[0];
  if (exact.length === 0) {
    throw new Error(`${entityLabel} not found by exact title: ${title}`);
  }

  throw new Error(`${entityLabel} title is ambiguous: ${title}`);
}

async function resolveProject(client, { projectId, projectTitle, business }) {
  if (projectId) {
    const results = await client.request('projects', {
      query: { limit: 1000 },
      business
    });
    const project = results.find((record) => record?._id === projectId);
    if (!project) {
      throw new Error(`Project not found by id: ${projectId}`);
    }
    return project;
  }

  if (projectTitle) {
    return findUniqueByExactTitle(
      () => client.request('projects', { query: { q: projectTitle, limit: 100 }, business }),
      projectTitle,
      'Project'
    );
  }

  return null;
}

async function resolveTaskBoard(client, { projectId, taskBoardId, taskBoardTitle, business }) {
  if (taskBoardId) {
    const results = await client.request('task-boards', {
      query: { limit: 1000 },
      business
    });
    const board = results.find((record) => record?._id === taskBoardId);
    if (!board) {
      throw new Error(`Task board not found by id: ${taskBoardId}`);
    }
    if (projectId && board.projectId && board.projectId !== projectId) {
      throw new Error(`Task board ${taskBoardId} does not belong to project ${projectId}`);
    }
    return board;
  }

  if (taskBoardTitle) {
    if (!projectId) {
      throw new Error('Resolving taskBoardTitle requires projectId or projectTitle');
    }
    return findUniqueByExactTitle(
      () => client.request('task-boards', { query: { q: { projectId }, limit: 100 }, business }),
      taskBoardTitle,
      'Task board'
    );
  }

  return null;
}

async function resolveTaskGroup(client, { taskBoardId, taskGroupId, taskGroupTitle, business }) {
  if (taskGroupId) {
    const results = await client.request('task-groups', {
      query: { limit: 1000 },
      business
    });
    const group = results.find((record) => record?._id === taskGroupId);
    if (!group) {
      throw new Error(`Task group not found by id: ${taskGroupId}`);
    }
    if (taskBoardId && group.taskBoardId && group.taskBoardId !== taskBoardId) {
      throw new Error(`Task group ${taskGroupId} does not belong to task board ${taskBoardId}`);
    }
    return group;
  }

  if (taskGroupTitle) {
    if (!taskBoardId) {
      throw new Error('Resolving taskGroupTitle requires taskBoardId or taskBoardTitle');
    }
    return findUniqueByExactTitle(
      () => client.request('task-groups', { query: { q: { taskBoardId }, limit: 100 }, business }),
      taskGroupTitle,
      'Task group'
    );
  }

  return null;
}

async function resolveTaskPlacement(client, { projectId, projectTitle, taskBoardId, taskBoardTitle, taskGroupId, taskGroupTitle, business }) {
  const project = await resolveProject(client, { projectId, projectTitle, business });
  const resolvedProjectId = project?._id || projectId;

  const board = await resolveTaskBoard(client, {
    projectId: resolvedProjectId,
    taskBoardId,
    taskBoardTitle,
    business
  });
  const resolvedTaskBoardId = board?._id || taskBoardId;

  const group = await resolveTaskGroup(client, {
    taskBoardId: resolvedTaskBoardId,
    taskGroupId,
    taskGroupTitle,
    business
  });

  return {
    project,
    board,
    group,
    projectId: resolvedProjectId,
    taskBoardId: resolvedTaskBoardId,
    taskGroupId: group?._id || taskGroupId
  };
}

async function getTaskByRecordId(client, { taskRecordId, business }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const direct = await client.request('tasks', {
      query: { q: { _id: taskRecordId }, limit: 2 },
      business
    });

    if (direct && !Array.isArray(direct) && direct._id === taskRecordId) {
      return normalizeTaskResult(direct);
    }

    if (Array.isArray(direct) && direct.length > 0) {
      const match = direct.find((record) => record?._id === taskRecordId) || direct[0];
      return normalizeTaskResult(match);
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw new Error(`Task not found by canonical _id: ${taskRecordId}`);
}

module.exports = {
  pickDefined,
  normalizeTaskResult,
  resolveTaskPlacement,
  getTaskByRecordId
};
