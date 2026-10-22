/**
 * Penligent — database IPC handlers.
 *
 * Channel names and call shapes mirror the reference application's
 * `ipc/db.cjs` (116 ipcMain registrations were enumerated across the
 * reference; the database subset is registered here).
 */
const { ipcMain, app } = require("electron");
const { build } = require("../db/db.cjs");

let api = null;
const db = () => (api ||= build(app));

/* projects */
ipcMain.handle("get-projects", (_e, userName) => db().getProjects(userName));
ipcMain.handle("add-projects", (_e, project) => db().addProjects(project));
ipcMain.handle("update-projects", (_e, id, data) => db().updateProjects(id, data));
ipcMain.handle("delete-project", (_e, id) => db().deleteProject(id));
ipcMain.handle("update-project-task-info", (_e, id, info) =>
  db().updateProjectTaskInfo(id, info)
);
ipcMain.handle("update-project-fields", (_e, id, data) =>
  db().updateProjectFields(id, data)
);
ipcMain.handle("update-project-over-view", (_e, id, doc) =>
  db().updateProjectOverView(id, doc)
);
ipcMain.handle("get-project-over-view", (_e, id) => db().getProjectOverView(id));
ipcMain.handle("update-project-remote-context-summary", (_e, id, summary) =>
  db().updateProjectHistorySummary(id, summary)
);
ipcMain.handle("update-project-task-mode", (_e, id, mode) =>
  db().updateProjectTaskMode(id, mode)
);

/* user */
ipcMain.handle("get-user-info", () => db().getUserToken() ?? null);
ipcMain.handle("add-user", (_e, user) => db().addUsers(user));
ipcMain.handle("update-user-info", (_e, info) => {
  if (!info || info.id === undefined || info.id === null) {
    return { success: false, error: "missing user id" };
  }
  return db().updateUsers(info.id, info);
});

/* settings */
ipcMain.handle("get-all-user-settings", () => db().getUserSettings());
ipcMain.handle("get-user-setting-one-by-key", (_e, key) => db().getUserSetting(key));
ipcMain.handle("set-user-setting", (_e, key, value, type, description) =>
  db().setUserSetting(key, value, type, description)
);
ipcMain.handle("delete-user-setting", (_e, key) => db().deleteUserSetting(key));

/* auth / header / remark parameters */
ipcMain.handle("add-project-auth-parameters", (_e, data) =>
  db().addAuthParameters(data)
);
ipcMain.handle("get-project-auth-parameters", (_e, projectId) =>
  db().getProjectAuthParameters(projectId)
);
ipcMain.handle("delete-project-auth-parameters", (_e, id) =>
  db().deleteAuthParameters(id)
);
ipcMain.handle("add-project-header-parameters", (_e, data) =>
  db().addHeaderParameters(data)
);
ipcMain.handle("get-project-header-parameters", (_e, projectId) =>
  db().getProjectHeaderParameters(projectId)
);
ipcMain.handle("delete-project-header-parameters", (_e, id) =>
  db().deleteHeaderParameters(id)
);
ipcMain.handle("add-project-remarks", (_e, data) => db().addRemarkParameters(data));
ipcMain.handle("get-project-remarks", (_e, projectId) =>
  db().getProjectRemarks(projectId)
);
ipcMain.handle("update-project-remarks", (_e, id, data) =>
  db().updateRemarkParameters(id, data)
);

/* tool sets */
ipcMain.handle("get-sets", () => db().getSets());
ipcMain.handle("add-sets", (_e, data) => db().addSets(data));
ipcMain.handle("update-sets", (_e, id, data) => db().updateSets(id, data));
ipcMain.handle("delete-sets", (_e, id) => db().deleteSets(id));

/* chat */
ipcMain.handle("get-chat-records", (_e, projectId, limit) =>
  limit ? db().getRecentChatRecords(projectId, limit) : db().getChatRecords(projectId)
);
ipcMain.handle("add-chat-record", (_e, data) => db().addChatRecords(data));
ipcMain.handle("delete-chat-records", (_e, id) => db().deleteChatRecords(id));
ipcMain.handle("update-chat-records-like-status", (_e, id, status) =>
  db().updateChatRecordsLikeStatus(id, status)
);

/* execution results */
ipcMain.handle("add-execution-result-all", (_e, data) =>
  db().addExecutionResultAll(data)
);
ipcMain.handle("get-execution-results", (_e, projectId) =>
  db().getExecutionResults(projectId)
);
ipcMain.handle("update-execution-result", (_e, id, data) =>
  db().updateExecutionResult(id, data ?? {})
);
ipcMain.handle("update-execution-result-summary-and-risk-item", (_e, id, summary, riskItem) =>
  db().updateExecutionResultSummaryAndRiskItem(id, summary, riskItem)
);
ipcMain.handle("cleanup-running-execution-results", () =>
  db().cleanupRunningExecutionResults()
);
ipcMain.handle("delete-execution-results", (_e, id) => db().deleteExecutionResults(id));

/* risk items */
ipcMain.handle("add-risk-item", (_e, data) => db().addRiskItem(data));
ipcMain.handle("add-risk-item-all", (_e, rows) => db().addRiskItemAll(rows));
ipcMain.handle("get-risk-items", (_e, projectId) => db().getRiskItems(projectId));
ipcMain.handle("get-risk-items-by-execution-id", (_e, executionId) =>
  db().getRiskItemsByExecutionId(executionId)
);
ipcMain.handle("get-risk-item-by-id", (_e, id) => db().getRiskItemById(id));
ipcMain.handle("update-risk-item", (_e, id, data) => db().updateRiskItem(id, data));
ipcMain.handle("update-risk-item-ignore-status", (_e, id, status) =>
  db().updateRiskItemIgnoreStatus(id, status)
);
ipcMain.handle("update-risk-item-verify-status", (_e, id, status) =>
  db().updateRiskItemVerifyStatus(id, status)
);
ipcMain.handle("update-risk-item-verify-context", (_e, id, context) =>
  db().updateRiskItemVerifyContext(id, context)
);
ipcMain.handle("update-risk-item-verify-context-his", (_e, id, context) =>
  db().updateRiskItemVerifyContextHis(id, context)
);
ipcMain.handle("update-risk-item-verify-evidence", (_e, id, evidence) =>
  db().updateRiskItemVerifyEvidence(id, evidence)
);
ipcMain.handle("update-risk-item-like-status", (_e, id, status) =>
  db().updateRiskItemLikeStatus(id, status)
);
ipcMain.handle("delete-risk-items", (_e, id) => db().deleteRiskItems(id));
ipcMain.handle("get-risk-items-execution-results", (_e, projectId) =>
  db().getRiskItemsExecutionResults(projectId)
);
ipcMain.handle("add-risk-items-execution-results", (_e, data) =>
  db().addRiskItemsExecutionResults(data)
);

/* reports */
ipcMain.handle("add-report-export", (_e, data) => db().addReportExport(data));
ipcMain.handle("get-report-exports", (_e, projectId) => db().getReportExports(projectId));
ipcMain.handle(
  "update-report-export-content-format-status",
  (_e, id, content, format, status) =>
    db().updateReportExportContentFormatStatus(id, content, format, status)
);

/* crawler & scanner */
ipcMain.handle("get-crawler-result-by-project-id", (_e, projectId) =>
  db().getCrawlerResultByProjectId(projectId)
);
ipcMain.handle("get-risk-scan-by-project-id", (_e, projectId) =>
  db().getRiskScanByProjectId(projectId)
);

/* ai tools & ttp */
ipcMain.handle("get-all-ai-tools", () => db().getAllAiTools());
ipcMain.handle("add-ai-tools", (_e, data) => db().addAiTools(data));
ipcMain.handle("delete-ai-tool", (_e, id) => db().deleteAiTool(id));
ipcMain.handle("get-all-ttps", () => db().getAllTtps());
ipcMain.handle("add-ttp", (_e, data) => db().addTtp(data));
ipcMain.handle("update-ttp", (_e, id, data) => db().updateTtp(id, data));
ipcMain.handle("delete-ttp", (_e, id) => db().deleteTtp(id));

/* test lists */
ipcMain.handle("get-all-test-lists", () => db().getAllTestLists());
ipcMain.handle("add-test-list", (_e, data) => db().addTestList(data));
ipcMain.handle("update-test-list-test-list", (_e, id, data) =>
  db().updateTestListTestList(id, data)
);
ipcMain.handle("update-test-list-focus-data", (_e, id, data) =>
  db().updateTestListFocusData(id, data)
);
ipcMain.handle("update-test-list-focus-description", (_e, id, data) =>
  db().updateTestListFocusDescription(id, data)
);
ipcMain.handle("get-latest-test-list-by-project-id", (_e, projectId) =>
  db().getLatestTestListByProjectId(projectId)
);

/* proxy & repeater */
ipcMain.handle("get-proxy-settings", () => db().getProxySettings());
ipcMain.handle("update-proxy-settings", (_e, type, value) =>
  db().updateProxySettings(type, value)
);
ipcMain.handle("add-proxy-history", (_e, data) => db().addProxyHistory(data));
ipcMain.handle("get-proxy-history-all", () => db().getProxyHistoryAll());
ipcMain.handle("get-proxy-history-analyzed-all", () =>
  db().getProxyHistoryAnalyzedAll()
);
ipcMain.handle("update-proxy-history-analysis-result", (_e, id, result) =>
  db().updateProxyHistoryAnalysisResult(id, result)
);
ipcMain.handle("delete-proxy-history-no-analysis-result", (_e, id) =>
  db().deleteProxyHistoryNoAnalysisResult(id)
);
ipcMain.handle("add-repeater-list", (_e, data) => db().addRepeaterList(data));
ipcMain.handle("delete-repeater-list", (_e, id) => db().deleteRepeaterList(id));
ipcMain.handle("get-all-repeater-list-parent", () => db().getAllRepeaterListParent());
ipcMain.handle("get-all-repeater-list-by-parent-id", (_e, parentId) =>
  db().getAllRepeaterListByParentId(parentId)
);
ipcMain.handle("get-all-repeater-list-analysis-result", () =>
  db().getAllRepeaterListAnalysisResult()
);
ipcMain.handle("update-repeater-list-analysis-result", (_e, id, result) =>
  db().updateRepeaterListAnalysisResult(id, result)
);
