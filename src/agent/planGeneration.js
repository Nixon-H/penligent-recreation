/**
 * The test-plan generation.
 *
 * The reference asks the provider for the plan, stores it as a tree of
 * phases, and then asks for the focused task's description. The plan the
 * provider returns has the shape
 *
 *   [{ phase_name, tasks: [{ id, item, description, target, is_complete }] }]
 *
 * and the first task becomes the focus.
 */

/** A task in the shape the reference stores it. */
export function normaliseTask(task, index) {
  const item = String(task.item ?? task.title ?? task.name ?? `Step ${index + 1}`);
  return {
    id: task.id ?? index + 1,
    item,
    title: item,
    description: String(task.description ?? ""),
    target: String(task.target ?? ""),
    is_complete: task.is_complete === true || task.is_complete === "true",
    result: String(task.result ?? "")
  };
}

/** The tree the provider returned. */
export function parsePlan(content) {
  if (!content) return [];
  const text = String(content);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((group, index) => {
        // A group with tasks, or a bare task standing in for a group.
        const tasks = Array.isArray(group.tasks) ? group.tasks : null;
        if (tasks) {
          return {
            id: group.id ?? `phase-${index}`,
            phase_name: String(group.phase_name ?? group.title ?? ""),
            tasks: tasks.map((task, taskIndex) => normaliseTask(task, taskIndex))
          };
        }
        return {
          id: group.id ?? `phase-${index}`,
          phase_name: String(group.phase ?? group.phase_name ?? ""),
          tasks: [normaliseTask(group, 0)]
        };
      })
      .filter((group) => group.tasks.length);
  } catch {
    return [];
  }
}

/** The prompt that asks for the plan. */
export const PLAN_SYSTEM_PROMPT =
  "You are a penetration testing planner. Produce a concrete penetration test plan. " +
  "Reply with a JSON array only, no prose and no code fences. Each element must be an object " +
  'with "phase_name" (string) and "tasks" (an array), and each task an object with "id" ' +
  '(number), "item" (string), "description" (string), "target" (string) and "is_complete" ' +
  "(boolean).";

/** The prompt that asks for the focused task's description. */
export const FOCUS_SYSTEM_PROMPT =
  "You write the focus description of a penetration-test task: one sentence on what the " +
  "task aims to achieve.";

/** Ask the provider for the plan and store it. */
export async function generateTestPlan(project, testType) {
  const result = await window.aiAPI.complete({
    system: PLAN_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `Produce a penetration test plan for project "${project.project_name}".` +
          (project.project_description ? ` ${project.project_description}` : "") +
          " Cover reconnaissance, attack surface analysis, authentication, authorisation, " +
          "injection, business logic, and reporting. 12 to 20 steps."
      }
    ]
  });

  if (!result?.success) {
    const error = new Error(result?.error || "The provider returned no content.");
    error.code = result?.code;
    throw error;
  }

  const tree = parsePlan(result.content);
  if (!tree.length) {
    throw new Error("The provider did not return a usable test plan.");
  }

  const first = tree[0]?.tasks?.[0];
  if (!first) throw new Error("The provider did not return a usable test plan.");

  const focus = await generateFocusDescription(project, first);

  await window.dbAPI.addTestList({
    project_id: project.id,
    test_type: testType || "GENERIC",
    test_list: JSON.stringify(tree),
    focus_data: JSON.stringify(first),
    focus_description: focus
  });

  return tree;
}

/** Ask the provider for the focused task's description. */
export async function generateFocusDescription(project, task) {
  try {
    const result = await window.aiAPI.complete({
      system: FOCUS_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Task: ${task.item}\n\nDescription: ${task.description || ""}`
        }
      ]
    });
    return result?.success
      ? result.content?.trim() || task.description || ""
      : task.description || "";
  } catch {
    return task?.description || "";
  }
}
