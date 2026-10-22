/**
 * Penligent — agent orchestration.
 *
 * Recovered from the reference renderer bundle. The reference's *tool
 * orchestration policy* is entirely client-side: the server proposes tool
 * calls, but the client decides which task runs next, when the run is
 * finished, when the report is generated and how results are fed back.
 *
 * The recovered pieces:
 *
 *   getNextTaskList()  — the next tasks to run. The test plan is a two-level
 *                        structure (`test_list[].tasks[]`); the client finds
 *                        the group holding the focused task, takes up to three
 *                        incomplete tasks from it, and falls back to the
 *                        following groups, then to any incomplete task.
 *
 *   the action list    — the client turns the next tasks into
 *                        `{ action_name, description, item, target, id }`
 *                        actions, prepends a "go on" action when the run is
 *                        mid-task, and appends a "Report Generation" action
 *                        once every task is complete.
 *
 *   the auto-round loop — after a tool execution the client increments
 *                        `analysis_round` and calls the model again with the
 *                        tool metadata, until the model reports the task
 *                        complete.
 *
 *   the tool-summary queue — a client-side FIFO that serialises
 *                        "the target overview changed" updates so the server
 *                        merges each tool's output into the overview one at
 *                        a time.
 */

/** The reference's "the task finished, write the report" action. */
export const REPORT_ACTION = {
  action_name: "Report Generation",
  description: "Report Generation",
  item: "report",
  target: "system"
};

/** The reference's "carry on with the current task" action. */
/**
 * The "go on" action.
 *
 * The reference builds it as
 *
 *   { action_name: $t("chat.继续当前任务"), description: "go on",
 *     item: "go on", target: "system" }
 *
 * and the chat renders the `$t("chat.继续")` label on it.
 */
export const CONTINUE_ACTION = {
  action_name: "chat.继续当前任务",
  label: "chat.继续",
  description: "go on",
  item: "go on",
  target: "system"
};

/** The reference allows at most three queued actions. */
export const MAX_ACTIONS = 3;

/**
 * Parse the test plan into its two levels.
 *
 * The reference stores the plan as JSON in `test_lists.test_list`:
 *   [ { tasks: [ { id, item, description, target, is_complete } ] }, … ]
 * A flat array is accepted too and treated as a single group.
 */
export function parseTestList(raw) {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed) && parsed.length && !parsed[0]?.tasks) {
    return [{ tasks: parsed }];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((group, index) => {
      const tasks = Array.isArray(group?.tasks) ? group.tasks : [];
      // The reference normalises `is_complete` to a boolean, counts it, and
      // gives every task and every group an id.
      let complete = 0;
      tasks.forEach((task, taskIndex) => {
        if (task.id === undefined || task.id === null || task.id === "") {
          task.id = `task-${index}-${taskIndex}`;
        }
        if (task.is_complete === true || task.is_complete === "true") {
          task.is_complete = true;
          complete += 1;
        } else {
          task.is_complete = false;
        }
      });
      return {
        ...group,
        id: group.id || `group-${index}`,
        tasks,
        is_complete: complete === tasks.length,
        all_count: tasks.length,
        complete_count: complete
      };
    });
}

/**
 * The counts the reference keeps on the test list.
 *
 * `all_count` and `complete_count` count the **groups**; `all_task_count` and
 * `complete_task_count` count the tasks. The centre nav's badge shows the
 * group counts.
 */
export function testListCounts(raw) {
  const groups = parseTestList(raw);
  let allTaskCount = 0;
  let completeTaskCount = 0;
  let completeGroupCount = 0;
  for (const group of groups) {
    allTaskCount += group.tasks.length;
    completeTaskCount += group.complete_count;
    if (group.is_complete) completeGroupCount += 1;
  }
  return {
    test_list: groups,
    all_count: groups.length,
    complete_count: completeGroupCount,
    all_task_count: allTaskCount,
    complete_task_count: completeTaskCount
  };
}

/**
 * The reference's `getNextTaskList`.
 *
 * @param {object} testList  { test_list, focus_data }
 * @returns {Array} up to three tasks to run next
 */
export function getNextTaskList(testList) {
  const next = [];
  const groups = parseTestList(testList?.test_list);
  const focusId = testList?.focus_data?.id ?? testList?.focus_data;

  if (!focusId) return next;

  let groupIndex = -1;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].tasks.some((task) => task.id === focusId)) {
      groupIndex = i;
      break;
    }
  }
  if (groupIndex < 0) return next;

  // The group that holds the focused task.
  for (const task of groups[groupIndex].tasks) {
    if (task.id !== focusId && !task.is_complete) next.push(task);
    if (next.length > 2) break;
  }

  // Then the following groups.
  if (next.length === 0) {
    for (let g = groupIndex + 1; g < groups.length; g++) {
      for (const task of groups[g].tasks) {
        if (!task.is_complete) next.push(task);
        if (next.length > 2) break;
      }
      if (next.length > 0) break;
    }
  }

  // Then anything at all.
  if (next.length === 0) {
    for (const group of groups) {
      for (const task of group.tasks) {
        if (!task.is_complete) next.push(task);
        if (next.length > 2) break;
      }
    }
  }

  return next;
}

/**
 * The reference's action assembly.
 *
 * @param {object} options
 * @param {Array}  options.chooseList   the actions the model already proposed
 * @param {string} options.focusSummary  the model's focus summary, if any
 * @param {object} options.testList      { test_list, focus_data }
 * @param {number} options.allTaskCount
 * @param {number} options.completeTaskCount
 * @returns {{ actions: Array, finished: boolean }}
 */
export function buildActions({
  chooseList = [],
  focusSummary,
  focusDataStatus,
  testList,
  allTaskCount = 0,
  completeTaskCount = 0
}) {
  const focusId = testList?.focus_data?.id ?? testList?.focus_data;
  const finished = allTaskCount - completeTaskCount < 1;

  // The reference takes the focused task's own actions, drops the focused
  // task, and names each action after the task it belongs to.
  const allTasks = parseTestList(testList?.test_list).flatMap((group) => group.tasks);
  const actions = chooseList
    .filter((action) => action.id !== focusId)
    .map((action) => {
      const task = allTasks.find((entry) => entry.id === action.id);
      return task
        ? { ...action, action_name: task.item || task.title || action.action_name }
        : action;
    });

  // The reference branches on the focused task's status, not on whether a
  // summary was written.
  if (focusDataStatus || focusSummary) {
    if (finished) {
      actions.push({ ...REPORT_ACTION });
    } else {
      for (const task of getNextTaskList(testList)) {
        if (task.id === focusId) continue;
        if (!actions.map((action) => action.id).includes(task.id)) {
          actions.push({
            action_name: task.item,
            description: task.description,
            item: task.id,
            target: task.target,
            id: task.id
          });
        }
      }
    }
    return { actions, finished };
  }

  if (actions.length > 0) {
    actions.unshift({ ...CONTINUE_ACTION });
    for (const task of getNextTaskList(testList)) {
      if (task.id === focusId) continue;
      if (!actions.map((action) => action.id).includes(task.id)) {
        actions.push({
          action_name: task.item,
          description: task.description,
          item: task.id,
          target: task.target,
          id: task.id
        });
      }
    }
  }

  return { actions, finished };
}

/**
 * The reference's `system_prompt_config` — the client-side variables the
 * server substitutes into its system prompt. Every one of them is recoverable,
 * which is why the reconstruction can send the same configuration.
 */
export function buildSystemPromptConfig({
  clientInfo = {},
  testTarget = "",
  analysisRound = 1,
  aiPythonPath = "",
  aiScriptPath = "",
  testList = {},
  selfTools = []
} = {}) {
  return {
    client_info: JSON.stringify(clientInfo),
    test_target: testTarget,
    analysis_round: String(analysisRound),
    ai_python_path: aiPythonPath,
    ai_script_path: aiScriptPath,
    task: JSON.stringify(testList?.focus_data ?? null),
    task_tree: JSON.stringify(testList?.test_list ?? null),
    task_focus: testList?.focus_description ?? "",
    self_tools: JSON.stringify(selfTools)
  };
}

/**
 * A client-side FIFO that serialises the "the target overview changed"
 * updates, exactly as the reference does, so the server merges each tool's
 * output into the overview one at a time.
 */
export class ToolSummaryQueue {
  constructor(flush) {
    this.items = [];
    this.busy = false;
    this.flush = flush;
  }

  push(taskId, toolSummaryList) {
    if (!toolSummaryList || toolSummaryList.length === 0) return;
    this.items.push({ taskId, toolSummaryList });
    this.run();
  }

  async run() {
    if (this.busy || this.items.length === 0) return;
    this.busy = true;
    try {
      while (this.items.length) {
        const item = this.items.shift();
        await this.flush(item);
      }
    } finally {
      this.busy = false;
    }
  }
}

/** The reference's tool metadata shape, sent back after an execution. */
export function toolMetadata(result) {
  return {
    id: result.id,
    command: result.tool_command,
    summary: result.message,
    risk_item: result.risk_item,
    status: result.status
  };
}
