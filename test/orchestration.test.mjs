import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseTestList,
  getNextTaskList,
  buildActions,
  buildSystemPromptConfig,
  ToolSummaryQueue,
  REPORT_ACTION,
  CONTINUE_ACTION,
  toolMetadata
} from "../src/agent/orchestration.js";

/**
 * The expected values below are the reference's own behaviour, recovered from
 * the renderer bundle:
 *   - the test plan is `test_list[].tasks[]`, two levels deep;
 *   - at most three tasks are queued at a time (`next.length > 2` breaks);
 *   - "Report Generation" is added once every task is complete;
 *   - "继续当前任务 / go on" is prepended while a run is mid-task.
 */
const PLAN = [
  {
    tasks: [
      { id: 1, item: "recon", description: "Map the attack surface", target: "target", is_complete: true },
      { id: 2, item: "auth", description: "Test login flows", target: "target", is_complete: false },
      { id: 3, item: "authz", description: "Test authorisation", target: "target", is_complete: false }
    ]
  },
  {
    tasks: [
      { id: 4, item: "sqli", description: "Probe for injection", target: "target", is_complete: false }
    ]
  }
];

describe("test plan parsing", () => {
  it("reads the reference's two-level structure", () => {
    const groups = parseTestList(JSON.stringify(PLAN));
    assert.strictEqual(groups.length, 2);
    assert.strictEqual(groups[0].tasks.length, 3);
  });

  it("accepts a flat array as a single group", () => {
    const groups = parseTestList(JSON.stringify(PLAN[0].tasks));
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].tasks.length, 3);
  });

  it("survives malformed input", () => {
    assert.deepStrictEqual(parseTestList("not json"), []);
    assert.deepStrictEqual(parseTestList(null), []);
    assert.deepStrictEqual(parseTestList(undefined), []);
  });
});

describe("task selection", () => {
  it("returns nothing without a focused task", () => {
    assert.deepStrictEqual(getNextTaskList({ test_list: PLAN }), []);
  });

  it("takes the incomplete tasks of the focused group, skipping the focus", () => {
    const next = getNextTaskList({ test_list: PLAN, focus_data: { id: 2 } });
    assert.deepStrictEqual(next.map((t) => t.id), [3]);
  });

  it("skips the focused task and takes the rest of its group", () => {
    // Focus is task 2; task 3 is the only other incomplete task in the group.
    const next = getNextTaskList({ test_list: PLAN, focus_data: { id: 2 } });
    assert.deepStrictEqual(next.map((t) => t.id), [3]);
  });

  it("falls back to the following groups once its own group is exhausted", () => {
    // The focused group has no other incomplete task, so the client moves on.
    const exhausted = [
      {
        tasks: [
          { id: 1, item: "recon", description: "Map", target: "target", is_complete: true },
          { id: 2, item: "auth", description: "Auth", target: "target", is_complete: false }
        ]
      },
      {
        tasks: [
          { id: 3, item: "sqli", description: "Injection", target: "target", is_complete: false }
        ]
      }
    ];
    const next = getNextTaskList({ test_list: exhausted, focus_data: { id: 2 } });
    assert.deepStrictEqual(next.map((t) => t.id), [3]);
  });

  it("never returns more than three tasks", () => {
    const many = [{ tasks: Array.from({ length: 10 }, (_, i) => ({ id: i, is_complete: false })) }];
    const next = getNextTaskList({ test_list: many, focus_data: { id: 0 } });
    assert.ok(next.length <= 3, `expected at most 3, got ${next.length}`);
  });

  it("returns nothing when the focus is unknown", () => {
    assert.deepStrictEqual(getNextTaskList({ test_list: PLAN, focus_data: { id: 99 } }), []);
  });
});

describe("action assembly", () => {
  it("asks for the report when every task is complete", () => {
    const { actions, finished } = buildActions({
      chooseList: [],
      focusSummary: "all done",
      testList: { test_list: PLAN, focus_data: { id: 2 } },
      allTaskCount: 4,
      completeTaskCount: 4
    });
    assert.strictEqual(finished, true);
    assert.strictEqual(actions[actions.length - 1].action_name, REPORT_ACTION.action_name);
  });

  it("queues the next tasks while work remains", () => {
    const { actions, finished } = buildActions({
      chooseList: [],
      focusSummary: "in progress",
      testList: { test_list: PLAN, focus_data: { id: 1 } },
      allTaskCount: 4,
      completeTaskCount: 1
    });
    assert.strictEqual(finished, false);
    assert.ok(actions.length > 0);
    assert.ok(actions.every((a) => "item" in a && "target" in a));
  });

  it("prepends the continue action when a run is mid-task", () => {
    const { actions } = buildActions({
      chooseList: [{ action_name: "nmap", item: "nmap", target: "system" }],
      focusSummary: null,
      testList: { test_list: PLAN, focus_data: { id: 1 } },
      allTaskCount: 4,
      completeTaskCount: 1
    });
    assert.strictEqual(actions[0].action_name, CONTINUE_ACTION.action_name);
    assert.strictEqual(actions[0].description, "go on");
  });

  it("does not duplicate a task that is already queued", () => {
    const { actions } = buildActions({
      chooseList: [{ action_name: "auth", item: 3, id: 3, target: "system" }],
      focusSummary: "in progress",
      testList: { test_list: PLAN, focus_data: { id: 1 } },
      allTaskCount: 4,
      completeTaskCount: 1
    });
    assert.strictEqual(actions.filter((a) => a.id === 3).length, 1);
  });
});

describe("system prompt configuration", () => {
  it("serialises every client-side variable the reference sends", () => {
    const config = buildSystemPromptConfig({
      clientInfo: { platform: "linux", linuxDistro: "kali" },
      testTarget: "https://probe.test",
      analysisRound: 2,
      aiPythonPath: "/usr/bin/python3",
      aiScriptPath: "/tmp/scripts",
      testList: { focus_data: { id: 7 }, test_list: PLAN, focus_description: "focus" },
      selfTools: [{ set_name: "nmap" }]
    });

    assert.strictEqual(config.client_info, '{"platform":"linux","linuxDistro":"kali"}');
    assert.strictEqual(config.test_target, "https://probe.test");
    assert.strictEqual(config.analysis_round, "2");
    assert.strictEqual(config.ai_python_path, "/usr/bin/python3");
    assert.strictEqual(config.ai_script_path, "/tmp/scripts");
    assert.strictEqual(config.task, '{"id":7}');
    assert.ok(config.task_tree.includes("sqli"));
    assert.strictEqual(config.task_focus, "focus");
    assert.strictEqual(config.self_tools, '[{"set_name":"nmap"}]');
  });
});

describe("tool summary queue", () => {
  it("flushes one item at a time, in order", async () => {
    const flushed = [];
    const queue = new ToolSummaryQueue(async (item) => {
      flushed.push(item.taskId);
      await new Promise((r) => setTimeout(r, 5));
    });

    queue.push("a", [1]);
    queue.push("b", [2]);
    await new Promise((r) => setTimeout(r, 200));

    assert.deepStrictEqual(flushed, ["a", "b"]);
  });

  it("ignores empty summaries", async () => {
    const flushed = [];
    const queue = new ToolSummaryQueue(async (item) => flushed.push(item.taskId));
    queue.push("a", []);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepStrictEqual(flushed, []);
  });
});

describe("tool metadata", () => {
  it("matches the reference's field names", () => {
    const meta = toolMetadata({
      id: "call-1",
      tool_command: "nmap -sV target",
      message: "80/tcp open",
      risk_item: null,
      status: "success"
    });
    assert.deepStrictEqual(Object.keys(meta).sort(), [
      "command",
      "id",
      "risk_item",
      "status",
      "summary"
    ]);
  });
});
