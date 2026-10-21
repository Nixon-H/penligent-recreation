/**
 * Schema and data-layer tests.
 *
 * The schema assertions are derived from the reference application's
 * `db/db.cjs` (21 tables recovered from the javascript-obfuscator output).
 * These tests run against a temporary database so they never touch a real
 * user profile.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "penligent-test-"));
process.env.PENLIGENT_DB_PATH = path.join(tmp, "test.db");

const { build, initializeDatabase } = require("../electron/db/db.cjs");
const { SCHEMA_STATEMENTS } = require("../electron/db/schema.cjs");

/** Minimal stand-in for the Electron `app` object. */
const app = { getPath: () => tmp };

const EXPECTED_TABLES = [
  "users",
  "projects",
  "auth_parameters",
  "header_parameters",
  "project_remarks",
  "tool_sets",
  "chat_records",
  "execution_results",
  "risk_items",
  "risk_items_execution_results",
  "user_settings",
  "token_usage",
  "report_exports",
  "crawler_result",
  "scan_result",
  "ai_tools",
  "ttp",
  "test_lists",
  "proxy_settings",
  "proxy_history",
  "repeater_list"
];

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("schema declares the 21 reference tables", () => {
  const names = SCHEMA_STATEMENTS.map((s) => s.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)[1]);
  assert.deepStrictEqual(names, EXPECTED_TABLES);
});

test("initialisation creates every table", async () => {
  await initializeDatabase(app);
  const db = build(app).getDatabase();
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);
  for (const table of EXPECTED_TABLES) {
    assert.ok(rows.includes(table), `missing table ${table}`);
  }
});

test("project round trip", async () => {
  const api = build(app);
  const id = api.addProjects({
    project_name: "acme",
    project_description: "engagement",
    task_tree: "[]"
  }).lastInsertRowid;

  const projects = api.getProjects();
  assert.strictEqual(projects.length, 1);
  assert.strictEqual(projects[0].project_name, "acme");

  api.updateProjects(id, { project_name: "acme-2", project_description: "d2", task_tree: "[]" });
  assert.strictEqual(api.getProjects()[0].project_name, "acme-2");

  api.deleteProject(id);
  assert.strictEqual(api.getProjects().length, 0);
});

test("risk item insert and severity counts", async () => {
  const api = build(app);
  const projectId = api.addProjects({ project_name: "p" }).lastInsertRowid;

  api.addRiskItem({
    project_id: projectId,
    risk_type: "vulnerability",
    severity: "high",
    title: "SQL injection"
  });
  api.addRiskItem({
    project_id: projectId,
    risk_type: "configuration",
    severity: "low",
    title: "Missing header"
  });

  const risks = api.getRiskItems(projectId);
  assert.strictEqual(risks.length, 2);
  assert.strictEqual(risks.filter((r) => r.severity === "high").length, 1);
  assert.ok(risks.every((r) => r.status === "open"));
});

test("deleting a project removes its dependent rows", async () => {
  const api = build(app);
  const projectId = api.addProjects({ project_name: "cascade" }).lastInsertRowid;

  api.addTestList({ project_id: projectId, test_type: "type_1", test_list: "[]" });
  api.addChatRecords({ project_id: projectId, chat_type: "user", chat_content: "hi" });
  api.addRiskItem({ project_id: projectId, severity: "low", title: "r" });
  api.addExecutionResultAll({ project_id: projectId, tool_name: "t", status: "success" });
  api.addRemarkParameters({ project_id: projectId, background: "b" });

  assert.strictEqual(api.getAllTestLists().filter((t) => t.project_id === projectId).length, 1);
  assert.strictEqual(api.getChatRecords(projectId).length, 1);

  api.deleteProject(projectId);

  // The schema declares no foreign keys, so the dependent rows have to be
  // removed explicitly — otherwise a deleted project keeps showing its test
  // lists and chat history.
  assert.strictEqual(api.getAllTestLists().filter((t) => t.project_id === projectId).length, 0);
  assert.strictEqual(api.getChatRecords(projectId).length, 0);
  assert.strictEqual(api.getRiskItems(projectId).length, 0);
  assert.strictEqual(api.getExecutionResults(projectId).length, 0);
  assert.strictEqual(api.getProjectRemarks(projectId).length, 0);
  assert.strictEqual(api.getProjects().filter((p) => p.id === projectId).length, 0);
});

test("user settings upsert on the unique key", async () => {
  const api = build(app);
  api.setUserSetting("onboarding_status", "1", "string", "Onboarding status");
  api.setUserSetting("onboarding_status", "", "string", "Onboarding status");

  const all = api.getUserSettings();
  const matches = all.filter((s) => s.setting_key === "onboarding_status");
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].setting_value, "");
  assert.strictEqual(matches[0].setting_type, "string");
});

test("proxy settings are keyed by type", () => {
  const api = build(app);
  api.updateProxySettings("address", "127.0.0.1:8080");
  api.updateProxySettings("address", "127.0.0.1:9090");

  const settings = api.getProxySettings();
  const addresses = settings.filter((s) => s.proxy_type === "address");
  assert.strictEqual(addresses.length, 1);
  assert.strictEqual(addresses[0].proxy_value, "127.0.0.1:9090");
});

test("repeater list keeps a single root parent", () => {
  const api = build(app);
  const parentId = api
    .addRepeaterList({ request_url: "https://example.test/", request_method: "GET" })
    .lastInsertRowid;
  api.addRepeaterList({ parent_id: parentId, request_url: "https://example.test/x" });

  const parents = api.getAllRepeaterListParent();
  assert.strictEqual(parents.length, 1);
  assert.strictEqual(parents[0].id, parentId);
  assert.strictEqual(api.getAllRepeaterListByParentId(parentId).length, 1);
});
