/**
 * Penligent — database access layer.
 *
 * Reconstructed from the reference application's `db/db.cjs`. The reference
 * stores its database in the Electron userData directory and (in production)
 * encrypts it with `better-sqlite3-multiple-ciphers`; the encryption key is
 * kept in a key file by `db/key-manager.cjs`.
 *
 * This reconstruction keeps the same relational model and query surface but
 * stores the database unencrypted so that the data is inspectable and
 * reproducible. `PENLIGENT_DB_PATH` overrides the default location, matching
 * the reference's environment override.
 */
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { SCHEMA_STATEMENTS, MIGRATION_STATEMENTS } = require("./schema.cjs");

let database = null;
/** The Electron app, captured so the database can be opened from anywhere. */
let appRef = null;

function resolveDatabasePath(app) {
  if (process.env.PENLIGENT_DB_PATH) return process.env.PENLIGENT_DB_PATH;
  const base = app.getPath("userData");
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, "app.db");
}

/**
 * The database.
 *
 * The app is captured on the first call and the path is resolved from it, so
 * the database can be opened from any module — the crawler and the scanner
 * write their results through this accessor.
 */
function getDatabase(app) {
  if (database) return database;
  const resolved = app || appRef;
  if (!resolved) {
    throw new Error("the database was opened before the application was ready");
  }
  const file = resolveDatabasePath(resolved);
  database = new Database(file);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  return database;
}

function applyMigrations(db) {
  for (const statement of MIGRATION_STATEMENTS) {
    const target = statement.match(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i);
    if (!target) continue;
    const existing = new Set(
      db.prepare(`PRAGMA table_info(${target[1]})`).all().map((c) => c.name)
    );
    if (existing.has(target[2])) continue;
    try {
      db.exec(statement);
    } catch (error) {
      if (!/duplicate column name/i.test(error.message)) throw error;
    }
  }
}

async function initializeDatabase(app) {
  // The app is captured so the crawler and the scanner can open the database
  // themselves.
  if (app) appRef = app;
  const db = getDatabase(app);
  for (const statement of SCHEMA_STATEMENTS) db.exec(statement);
  applyMigrations(db);
  return db;
}

/* ------------------------------------------------------------------ *
 * Query helpers — one function per reference db.cjs export.
 * ------------------------------------------------------------------ */

const now = () => Math.floor(Date.now() / 1000);

function build(app) {
  const db = getDatabase(app);
  const all = (sql, ...params) => db.prepare(sql).all(...params);
  const get = (sql, ...params) => db.prepare(sql).get(...params);
  const run = (sql, ...params) => db.prepare(sql).run(...params);

  return {
    getDatabase: () => db,

    /* users */
    getUsers: () => all("SELECT * FROM users"),
    addUsers: (user) =>
      run(
        "INSERT INTO users (user_name, user_email, user_token, res_token) VALUES (?, ?, ?, ?)",
        user.user_name ?? "",
        user.user_email ?? "",
        user.user_token ?? "",
        user.res_token ?? ""
      ),
    updateUsers: (id, data) =>
      run(
        "UPDATE users SET user_name = ?, user_email = ?, user_token = ?, res_token = ? WHERE id = ?",
        data.user_name ?? "",
        data.user_email ?? "",
        data.user_token ?? "",
        data.res_token ?? "",
        id
      ),
    deleteUsers: (id) => run("DELETE FROM users WHERE id = ?", id),
    getUserToken: () => get("SELECT * FROM users LIMIT 1"),

    /* projects */
    getProjects: (userName) =>
      // The reference reads the projects of the signed-in user. This build
      // has no account, so the filter is dropped and every local project is
      // returned.
      userName
        ? all("SELECT * FROM projects WHERE user_name = ? ORDER BY updated_at DESC", userName)
        : all("SELECT * FROM projects ORDER BY updated_at DESC"),
    addProjects: (project) =>
      run(
        `INSERT INTO projects
           (project_name, project_description, task_tree, historysummary, user_name, project_target, task_mode, testlist_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        project.project_name ?? "",
        project.project_description ?? "",
        project.task_tree ?? "[]",
        project.historysummary ?? "{}",
        project.user_name ?? "",
        project.project_target ?? "",
        project.task_mode ?? "auto",
        project.testlist_type ?? ""
      ),
    updateProjectFields: (id, data) => {
      // Only the fields the caller supplied are written, so an edit cannot
      // wipe the plan or the mode.
      const columns = [];
      const values = [];
      for (const [key, column] of [
        ["project_name", "project_name"],
        ["project_description", "project_description"],
        ["project_target", "project_target"],
        ["task_mode", "task_mode"],
        ["testlist_type", "testlist_type"],
        ["user_name", "user_name"]
      ]) {
        if (data[key] !== undefined) {
          columns.push(`${column} = ?`);
          values.push(data[key]);
        }
      }
      if (!columns.length) return { changes: 0 };
      columns.push("updated_at = ?");
      values.push(now());
      values.push(id);
      return run(
        `UPDATE projects SET ${columns.join(", ")} WHERE id = ?`,
        ...values
      );
    },
    updateProjects: (id, data) =>
      run(
        `UPDATE projects
         SET project_name = ?, project_description = ?, task_tree = ?, project_target = ?,
             task_mode = ?, testlist_type = ?, updated_at = ?
         WHERE id = ?`,
        data.project_name ?? "",
        data.project_description ?? "",
        data.task_tree ?? "[]",
        data.project_target ?? "",
        data.task_mode ?? "auto",
        data.testlist_type ?? "",
        now(),
        id
      ),
    /**
     * Delete a project and everything that belongs to it.
     *
     * The schema has no FOREIGN KEY constraints, so the dependent rows were
     * left behind: a deleted project still showed its test lists (the Task
     * List badge kept counting them) and kept its chat history, findings,
     * executions, crawler results, scan results and report exports.
     */
    deleteProject: (id) => {
      const dependents = [
        "test_lists",
        "chat_records",
        "risk_items",
        "risk_items_execution_results",
        "execution_results",
        "report_exports",
        "crawler_result",
        "scan_result",
        "auth_parameters",
        "header_parameters",
        "project_remarks",
        "ai_tools"
      ];
      const remove = db.transaction((projectId) => {
        for (const table of dependents) {
          run(`DELETE FROM ${table} WHERE project_id = ?`, projectId);
        }
        run("DELETE FROM projects WHERE id = ?", projectId);
      });
      remove(id);
    },
    updateProjectTaskTree: (id, tree) =>
      run("UPDATE projects SET task_tree = ?, updated_at = ? WHERE id = ?", tree, now(), id),
    updateProjectTaskInfo: (id, info) =>
      run("UPDATE projects SET task_tree = ?, updated_at = ? WHERE id = ?", info, now(), id),
    updateProjectOverView: (id, doc) =>
      run(
        "UPDATE projects SET over_view = ?, updated_at = ? WHERE id = ?",
        typeof doc === "string" ? doc : JSON.stringify(doc),
        now(),
        id
      ),
    getProjectOverView: (id) => {
      const row = get("SELECT over_view FROM projects WHERE id = ?", id);
      if (!row?.over_view) return null;
      try {
        return JSON.parse(row.over_view);
      } catch {
        return null;
      }
    },
    updateProjectTaskMode: (id, mode) =>
      run("UPDATE projects SET task_mode = ?, updated_at = ? WHERE id = ?", mode, now(), id),
    updateProjectHistorySummary: (id, summary) =>
      run("UPDATE projects SET historysummary = ?, updated_at = ? WHERE id = ?", summary, now(), id),
    getProjectHistorySummary: (id) =>
      get("SELECT historysummary FROM projects WHERE id = ?", id),
    updateProjectsUserName: (id, userName) =>
      run("UPDATE projects SET user_name = ? WHERE id = ?", userName, id),

    /* auth / header / remark parameters */
    addAuthParameters: (data) =>
      run(
        "INSERT INTO auth_parameters (project_id, username, password, description) VALUES (?, ?, ?, ?)",
        data.project_id,
        data.username ?? "",
        data.password ?? "",
        data.description ?? ""
      ),
    getProjectAuthParameters: (projectId) =>
      all("SELECT * FROM auth_parameters WHERE project_id = ?", projectId),
    deleteAuthParameters: (id) => run("DELETE FROM auth_parameters WHERE id = ?", id),

    addHeaderParameters: (data) =>
      run(
        "INSERT INTO header_parameters (project_id, header_name, header_value) VALUES (?, ?, ?)",
        data.project_id,
        data.header_name ?? "",
        data.header_value ?? ""
      ),
    getProjectHeaderParameters: (projectId) =>
      all("SELECT * FROM header_parameters WHERE project_id = ?", projectId),
    deleteHeaderParameters: (id) => run("DELETE FROM header_parameters WHERE id = ?", id),

    addRemarkParameters: (data) => {
      const existing = get(
        "SELECT id FROM project_remarks WHERE project_id = ?",
        data.project_id
      );
      if (existing) {
        return run(
          "UPDATE project_remarks SET background = ?, range = ?, assets = ?, history = ?, compliance = ? WHERE id = ?",
          data.background ?? "",
          data.range ?? "",
          data.assets ?? "",
          data.history ?? "",
          data.compliance ?? "",
          existing.id
        );
      }
      return run(
        "INSERT INTO project_remarks (project_id, background, range, assets, history, compliance) VALUES (?, ?, ?, ?, ?, ?)",
        data.project_id,
        data.background ?? "",
        data.range ?? "",
        data.assets ?? "",
        data.history ?? "",
        data.compliance ?? ""
      );
    },
    getProjectRemarks: (projectId) =>
      all("SELECT * FROM project_remarks WHERE project_id = ?", projectId),
    updateRemarkParameters: (id, data) =>
      run(
        "UPDATE project_remarks SET background = ?, range = ?, assets = ?, history = ?, compliance = ? WHERE id = ?",
        data.background ?? "",
        data.range ?? "",
        data.assets ?? "",
        data.history ?? "",
        data.compliance ?? "",
        id
      ),

    /* tool sets */
    getSets: () => all("SELECT * FROM tool_sets ORDER BY id DESC"),
    addSets: (data) =>
      run(
        "INSERT INTO tool_sets (tool_type, set_name, command_path, command_command, api_config, format_str) VALUES (?, ?, ?, ?, ?, ?)",
        data.tool_type ?? "command",
        data.set_name ?? "",
        data.command_path ?? "",
        data.command_command ?? "",
        data.api_config ?? "",
        data.format_str ?? ""
      ),
    updateSets: (id, data) =>
      run(
        "UPDATE tool_sets SET tool_type = ?, set_name = ?, command_path = ?, command_command = ?, api_config = ?, format_str = ? WHERE id = ?",
        data.tool_type ?? "command",
        data.set_name ?? "",
        data.command_path ?? "",
        data.command_command ?? "",
        data.api_config ?? "",
        data.format_str ?? "",
        id
      ),
    deleteSets: (id) => run("DELETE FROM tool_sets WHERE id = ?", id),

    /* chat */
    getChatRecords: (projectId) =>
      all("SELECT * FROM chat_records WHERE project_id = ? ORDER BY created_at ASC", projectId),
    getRecentChatRecords: (projectId, limit = 10, offset = 0) =>
      all(
        "SELECT * FROM chat_records WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        projectId,
        limit,
        offset
      ),
    getChatRecordsCount: (projectId) =>
      get("SELECT COUNT(*) AS count FROM chat_records WHERE project_id = ?", projectId),
    addChatRecords: (data) =>
      run(
        "INSERT INTO chat_records (project_id, chat_type, chat_content, chat_metadata) VALUES (?, ?, ?, ?)",
        data.project_id,
        data.chat_type ?? "user",
        data.chat_content ?? "",
        data.chat_metadata ?? ""
      ),
    deleteChatRecords: (id) => run("DELETE FROM chat_records WHERE id = ?", id),
    updateChatRecordsLikeStatus: (id, status) =>
      run("UPDATE chat_records SET like_status = ? WHERE id = ?", status, id),

    /* execution results */
    addExecutionResultAll: (data) =>
      run(
        `INSERT INTO execution_results
         (project_id, tool_name, command, parameters, result_data, status, start_time, end_time, duration, error_message, scan_id, is_silent, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data.project_id,
        data.tool_name ?? "",
        data.command ?? "",
        data.parameters ?? "",
        data.result_data ?? "",
        data.status ?? "running",
        data.start_time ?? now(),
        data.end_time ?? null,
        data.duration ?? null,
        data.error_message ?? null,
        data.scan_id ?? null,
        data.is_silent ?? 0,
        data.summary ?? ""
      ),
    getExecutionResults: (projectId) =>
      all("SELECT * FROM execution_results WHERE project_id = ? ORDER BY id DESC", projectId),
    updateExecutionResult: (id, data) =>
      run(
        `UPDATE execution_results
         SET result_data = ?, status = ?, end_time = ?, duration = ?, error_message = ?, summary = ?
         WHERE id = ?`,
        data.result_data ?? "",
        data.status ?? "success",
        data.end_time ?? now(),
        data.duration ?? 0,
        data.error_message ?? null,
        data.summary ?? "",
        id
      ),
    updateExecutionResultSummaryAndRiskItem: (id, summary, riskItem) =>
      run(
        "UPDATE execution_results SET summary = ?, risk_item = ? WHERE id = ?",
        summary ?? "",
        riskItem ?? "",
        id
      ),
    cleanupRunningExecutionResults: () =>
      run(
        "UPDATE execution_results SET status = 'stopped', end_time = ?, is_timeout = 0, error_message = 'Tool stopped due to application shutdown' WHERE status = 'running'",
        now()
      ),
    deleteExecutionResults: (id) => run("DELETE FROM execution_results WHERE id = ?", id),

    /* risk items */
    addRiskItem: (data) =>
      run(
        `INSERT INTO risk_items
         (project_id, execution_id, risk_type, severity, title, description, affected_target, evidence, recommendation, cve_id, cvss_score, status, like_status, verify_status, verify_context)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data.project_id,
        data.execution_id ?? null,
        data.risk_type ?? "vulnerability",
        data.severity ?? "info",
        data.title ?? "",
        data.description ?? "",
        data.affected_target ?? "",
        data.evidence ?? "",
        data.recommendation ?? "",
        data.cve_id ?? "",
        data.cvss_score ?? null,
        data.status ?? "open",
        data.like_status ?? "neutral",
        data.verify_status ?? "open",
        data.verify_context ?? null
      ),
    addRiskItemAll: (rows) => {
      const statement = db.prepare(
        `INSERT INTO risk_items
         (project_id, execution_id, risk_type, severity, title, description, affected_target, evidence, recommendation, cve_id, cvss_score, status, like_status, verify_status, verify_context)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const transaction = db.transaction((items) => {
        for (const item of items) {
          statement.run(
            item.project_id,
            item.execution_id ?? null,
            item.risk_type ?? "vulnerability",
            item.severity ?? "info",
            item.title ?? "",
            item.description ?? "",
            item.affected_target ?? "",
            item.evidence ?? "",
            item.recommendation ?? "",
            item.cve_id ?? "",
            item.cvss_score ?? null,
            item.status ?? "open",
            item.like_status ?? "neutral",
            item.verify_status ?? "open",
            item.verify_context ?? null
          );
        }
      });
      transaction(rows);
      return rows.length;
    },
    getRiskItems: (projectId) =>
      all("SELECT * FROM risk_items WHERE project_id = ? ORDER BY created_at DESC", projectId),
    getRiskItemById: (id) => get("SELECT * FROM risk_items WHERE id = ?", id),
    updateRiskItem: (id, data) =>
      run(
        `UPDATE risk_items
         SET risk_type = ?, severity = ?, title = ?, description = ?, affected_target = ?,
             evidence = ?, recommendation = ?, cve_id = ?, cvss_score = ?, status = ?,
             like_status = ?, verify_status = ?
         WHERE id = ?`,
        data.risk_type ?? "",
        data.severity ?? "info",
        data.title ?? "",
        data.description ?? "",
        data.affected_target ?? "",
        data.evidence ?? "",
        data.recommendation ?? "",
        data.cve_id ?? "",
        data.cvss_score ?? null,
        data.status ?? "open",
        data.like_status ?? "neutral",
        data.verify_status ?? "open",
        id
      ),
    updateRiskItemIgnoreStatus: (id, status) =>
      run("UPDATE risk_items SET status = ? WHERE id = ?", status, id),
    updateRiskItemVerifyStatus: (id, status) =>
      run("UPDATE risk_items SET verify_status = ? WHERE id = ?", status, id),
    updateRiskItemVerifyContext: (id, context) =>
      run("UPDATE risk_items SET verify_context = ? WHERE id = ?", context, id),
    updateRiskItemVerifyContextHis: (id, context) =>
      run("UPDATE risk_items SET verify_context_his = ? WHERE id = ?", context, id),
    updateRiskItemVerifyEvidence: (id, evidence) =>
      run("UPDATE risk_items SET evidence = ? WHERE id = ?", evidence, id),
    updateRiskItemLikeStatus: (id, status) =>
      run("UPDATE risk_items SET like_status = ? WHERE id = ?", status, id),
    deleteRiskItems: (id) => run("DELETE FROM risk_items WHERE id = ?", id),
    getRiskItemsByExecutionId: (executionId) =>
      all(
        "SELECT * FROM risk_items WHERE execution_id = ? ORDER BY severity DESC, created_at DESC",
        executionId
      ),
    /** The link table, filtered by the project, as the reference does. */
    getRiskItemsExecutionResults: (projectId) =>
      all(
        "SELECT * FROM risk_items_execution_results WHERE project_id = ? ORDER BY created_at DESC",
        projectId
      ),
    addRiskItemsExecutionResults: (data) =>
      run(
        "INSERT INTO risk_items_execution_results (project_id, risk_item_id, execution_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        data.project_id,
        data.risk_item_id,
        data.execution_id,
        now(),
        now()
      ),

    /* settings & usage */
    getUserSettings: () => all("SELECT * FROM user_settings ORDER BY id ASC"),
    getUserSetting: (key) => {
      const row = get(
        "SELECT setting_value, setting_type FROM user_settings WHERE setting_key = ?",
        key
      );
      if (!row) return null;
      // The reference coerces the stored value to the setting's type.
      if (row.setting_type === "number") return Number(row.setting_value);
      if (row.setting_type === "boolean") return row.setting_value === "true";
      if (row.setting_type === "json") {
        try {
          return JSON.parse(row.setting_value);
        } catch {
          return null;
        }
      }
      return row.setting_value;
    },
    setUserSetting: (key, value, type = "string", description = "") => {
      // The reference stores a JSON setting as JSON, and everything else as
      // a string.
      const stored =
        type === "json" && typeof value === "object" ? JSON.stringify(value) : String(value);
      return run(
        `INSERT INTO user_settings (setting_key, setting_value, setting_type, description, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(setting_key) DO UPDATE SET
           setting_value = excluded.setting_value,
           setting_type = excluded.setting_type,
           description = excluded.description,
           updated_at = excluded.updated_at`,
        key,
        stored,
        type,
        description,
        now()
      );
    },
    deleteUserSetting: (key) => run("DELETE FROM user_settings WHERE setting_key = ?", key),
    addTokenUsage: (data) =>
      run(
        "INSERT INTO token_usage (send_content, api_interface, remark, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)",
        data.send_content ?? "",
        data.api_interface ?? "",
        data.remark ?? "",
        data.input_tokens ?? 0,
        data.output_tokens ?? 0
      ),
    getTokenUsageSum: () =>
      get(
        "SELECT COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens FROM token_usage"
      ),

    /* reports */
    addReportExport: (data) =>
      run(
        `INSERT INTO report_exports
         (project_id, export_time, report_content, export_format, file_path, file_size, export_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        data.project_id,
        data.export_time ?? now(),
        data.report_content ?? "",
        data.export_format ?? "md",
        data.file_path ?? "",
        data.file_size ?? 0,
        data.export_status ?? "completed"
      ),
    getReportExports: (projectId) =>
      all("SELECT * FROM report_exports WHERE project_id = ? ORDER BY export_time DESC", projectId),
    getReportExportById: (id) => get("SELECT * FROM report_exports WHERE id = ?", id),
    /**
     * The reference calls this as
     * `updateReportExportContentFormatStatus(id, content, "md", "completed")`.
     */
    updateReportExportContentFormatStatus: (id, content, format, status) =>
      run(
        `UPDATE report_exports
         SET report_content = ?, export_format = ?, export_status = ?, file_size = ?
         WHERE id = ?`,
        content ?? "",
        format ?? "md",
        status ?? "completed",
        content ? Buffer.byteLength(String(content), "utf8") : 0,
        id
      ),
    updateReportExportFilePath: (id, filePath) =>
      run("UPDATE report_exports SET file_path = ? WHERE id = ?", filePath, id),

    /* crawler & scanner */
    getCrawlerResultByProjectId: (projectId) =>
      all("SELECT * FROM crawler_result WHERE project_id = ? AND is_high_value = 1", projectId),
    getRiskScanByProjectId: (projectId) =>
      all("SELECT * FROM scan_result WHERE project_id = ?", projectId),

    /* ai tools & ttp */
    getAllAiTools: () => all("SELECT * FROM ai_tools ORDER BY created_at DESC LIMIT 50"),
    deleteAiTool: (id) => run("DELETE FROM ai_tools WHERE id = ?", [id]),
    addAiTools: (data) =>
      run(
        "INSERT INTO ai_tools (project_id, tool_name, title, tool_input, tool_output) VALUES (?, ?, ?, ?, ?)",
        data.project_id,
        data.tool_name ?? "",
        data.title ?? "",
        data.tool_input ?? "",
        data.tool_output ?? ""
      ),
    getAllTtps: () => all("SELECT * FROM ttp ORDER BY created_at DESC"),
    addTtp: (data) =>
      run(
        `INSERT INTO ttp (title, ttp_type, ttp_level, ttp_priority, overview, detection_method, waf_bypass, verification, false_positive, priority, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data.title ?? "",
        data.ttp_type ?? "",
        data.ttp_level ?? "low",
        data.ttp_priority ?? 1,
        data.overview ?? "",
        data.detection_method ?? "",
        data.waf_bypass ?? "",
        data.verification ?? "",
        data.false_positive ?? "",
        data.priority ?? "",
        data.notes ?? ""
      ),
    updateTtp: (id, data) =>
      run(
        `UPDATE ttp SET title = ?, ttp_type = ?, ttp_level = ?, ttp_priority = ?, overview = ?,
           detection_method = ?, waf_bypass = ?, verification = ?, false_positive = ?, priority = ?,
           notes = ?, updated_at = ? WHERE id = ?`,
        data.title ?? "",
        data.ttp_type ?? "",
        data.ttp_level ?? "low",
        data.ttp_priority ?? 1,
        data.overview ?? "",
        data.detection_method ?? "",
        data.waf_bypass ?? "",
        data.verification ?? "",
        data.false_positive ?? "",
        data.priority ?? "",
        data.notes ?? "",
        now(),
        id
      ),
    deleteTtp: (id) => run("DELETE FROM ttp WHERE id = ?", id),

    /* test lists */
    getAllTestLists: () => all("SELECT * FROM test_lists ORDER BY created_at DESC"),
    addTestList: (data) =>
      run(
        "INSERT INTO test_lists (project_id, test_type, test_list, focus_data, focus_description) VALUES (?, ?, ?, ?, ?)",
        data.project_id,
        data.test_type ?? "type_1",
        data.test_list ?? "[]",
        data.focus_data ?? "",
        data.focus_description ?? ""
      ),
    updateTestListTestList: (id, data) =>
      run("UPDATE test_lists SET test_list = ?, updated_at = ? WHERE id = ?", data, now(), id),
    updateTestListFocusData: (id, data) =>
      run("UPDATE test_lists SET focus_data = ?, updated_at = ? WHERE id = ?", data, now(), id),
    updateTestListFocusDescription: (id, data) =>
      run("UPDATE test_lists SET focus_description = ?, updated_at = ? WHERE id = ?", data, now(), id),
    getLatestTestListByProjectId: (projectId) =>
      get("SELECT * FROM test_lists WHERE project_id = ? ORDER BY created_at DESC LIMIT 1", projectId),

    /* proxy */
    getProxySettings: () => all("SELECT * FROM proxy_settings"),
    updateProxySettings: (type, value) => {
      const existing = get("SELECT id FROM proxy_settings WHERE proxy_type = ?", type);
      if (existing) {
        run(
          "UPDATE proxy_settings SET proxy_value = ?, updated_at = ? WHERE proxy_type = ?",
          value,
          now(),
          type
        );
        return existing.id;
      }
      return run(
        "INSERT INTO proxy_settings (proxy_type, proxy_value, updated_at) VALUES (?, ?, ?)",
        type,
        value,
        now()
      ).lastInsertRowid;
    },
    /**
     * Record an intercepted request.
     *
     * The reference upserts on the request id: the request arrives first and
     * the response updates the same row, rather than adding a second one.
     */
    addProxyHistory: (data) => {
      const existing = get(
        "SELECT 1 FROM proxy_history WHERE request_id = ?",
        data.request_id ?? ""
      );
      if (existing) {
        return run(
          `UPDATE proxy_history SET
             request_url = ?, request_method = ?, request_headers = ?, request_data = ?,
             request_time = ?, response_status = ?, response_status_message = ?,
             response_headers = ?, response_body = ?, response_body_file_path = ?,
             response_time = ?, updated_at = ?
           WHERE request_id = ?`,
          data.request_url ?? "",
          data.request_method ?? "GET",
          data.request_headers ?? "",
          data.request_data ?? "",
          data.request_time ?? String(Date.now()),
          data.response_status ?? "",
          data.response_status_message ?? "",
          data.response_headers ?? "",
          data.response_body ?? "",
          data.response_body_file_path ?? "",
          data.response_time ?? String(Date.now()),
          now(),
          data.request_id ?? ""
        );
      }
      return run(
        `INSERT INTO proxy_history
         (request_id, request_url, request_method, request_headers, request_data, request_time,
          response_status, response_status_message, response_headers, response_body,
          response_body_file_path, response_time, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data.request_id ?? "",
        data.request_url ?? "",
        data.request_method ?? "GET",
        data.request_headers ?? "",
        data.request_data ?? "",
        data.request_time ?? String(Date.now()),
        data.response_status ?? "",
        data.response_status_message ?? "",
        data.response_headers ?? "",
        data.response_body ?? "",
        data.response_body_file_path ?? "",
        data.response_time ?? String(Date.now()),
        now(),
        now()
      );
    },
    getProxyHistoryAll: () => all("SELECT * FROM proxy_history ORDER BY created_at DESC"),
    getProxyHistoryAnalyzedAll: () =>
      all("SELECT * FROM proxy_history WHERE analysis_result IS NOT NULL ORDER BY updated_at DESC"),
    updateProxyHistoryAnalysisResult: (id, result) =>
      run(
        "UPDATE proxy_history SET analysis_result = ?, updated_at = ? WHERE id = ? OR request_id = ?",
        result,
        now(),
        id,
        id
      ),
    deleteProxyHistoryNoAnalysisResult: (id) =>
      run("DELETE FROM proxy_history WHERE id < ? AND analysis_result IS null", id),

    /* repeater */
    addRepeaterList: (data) =>
      run(
        `INSERT INTO repeater_list
         (parent_id, request_id, request_url, request_method, request_headers, request_data,
          request_time, response_status, response_status_message, response_headers, response_body,
          response_body_file_path, response_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data.parent_id ?? null,
        data.request_id ?? "",
        data.request_url ?? "",
        data.request_method ?? "GET",
        data.request_headers ?? "",
        data.request_data ?? "",
        data.request_time ?? String(Date.now()),
        data.response_status ?? "",
        data.response_status_message ?? "",
        data.response_headers ?? "",
        data.response_body ?? "",
        data.response_body_file_path ?? "",
        data.response_time ?? String(Date.now())
      ),
    deleteRepeaterList: (id) => run("DELETE FROM repeater_list WHERE id = ? OR parent_id = ?", id, id),
    getAllRepeaterListParent: () =>
      all("SELECT * FROM repeater_list WHERE parent_id is null ORDER BY created_at DESC LIMIT 10"),
    getAllRepeaterListByParentId: (parentId) =>
      all("SELECT * FROM repeater_list WHERE parent_id = ? ORDER BY created_at DESC LIMIT 50", parentId),
    getAllRepeaterListAnalysisResult: () =>
      all("SELECT * FROM repeater_list WHERE analysis_result is not null ORDER BY updated_at DESC"),
    updateRepeaterListAnalysisResult: (id, result) =>
      run("UPDATE repeater_list SET analysis_result = ?, updated_at = ? WHERE id = ?", result, now(), id)
  };
}

function clearSession(app) {
  const db = getDatabase(app);
  db.exec("DELETE FROM users");
  return true;
}

module.exports = { build, getDatabase, initializeDatabase, clearSession };
