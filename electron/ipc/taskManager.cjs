const { ipcMain } = require("electron");

/**
 * The task manager.
 *
 * The reference keeps, per task, the abort controllers and the SSE streams
 * that belong to it, so a whole task can be stopped at once.
 */
const tasks = new Map();

function entry(taskId) {
  if (!tasks.has(taskId)) {
    tasks.set(taskId, { aborts: new Map(), sses: new Map() });
  }
  return tasks.get(taskId);
}

function registerAbort(taskId, key, controller) {
  entry(taskId).aborts.set(key, controller);
}

function stopAbort(taskId, key) {
  const record = tasks.get(taskId);
  if (!record) return;
  const controller = record.aborts.get(key);
  if (controller) {
    controller.abort();
    record.aborts.delete(key);
  }
}

function registerSSE(taskId, key, controller) {
  entry(taskId).sses.set(key, controller);
}

function stopSSE(taskId, key) {
  const record = tasks.get(taskId);
  if (!record) return;
  const controller = record.sses.get(key);
  if (controller) {
    controller.abort();
    record.sses.delete(key);
  }
}

function hasSSE(taskId, key) {
  const record = tasks.get(taskId);
  if (!record) return false;
  return record.sses.has(key);
}

function removeSSE(taskId, key) {
  const record = tasks.get(taskId);
  if (!record) return;
  record.sses.delete(key);
}

/** Stop everything that belongs to a task. */
function stopTask(taskId) {
  const record = tasks.get(taskId);
  if (!record) return;
  for (const controller of record.aborts.values()) {
    try {
      controller.abort();
    } catch {
      /* already stopped */
    }
  }
  for (const controller of record.sses.values()) {
    try {
      controller.abort();
    } catch {
      /* already stopped */
    }
  }
  record.aborts.clear();
  record.sses.clear();
}

ipcMain.handle("stop-task", (_event, taskId) => {
  stopTask(taskId);
  return { success: true };
});

module.exports = {
  registerAbort,
  stopAbort,
  registerSSE,
  stopSSE,
  hasSSE,
  removeSSE,
  stopTask
};
