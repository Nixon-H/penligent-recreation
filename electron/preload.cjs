/**
 * Penligent — preload bridge.
 *
 * Reconstructed from the reference application's `preload.cjs`. The exposed
 * namespaces and their member names were verified against the live renderer
 * (`Object.keys(window).filter(k => /API$/.test(k))` returned exactly the 12
 * namespaces below, and the member lists match).
 */
const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const send = (channel, ...args) => ipcRenderer.send(channel, ...args);
const on = (channel, listener) => {
  const wrapped = (_event, ...args) => listener(...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

/**
 * The shared store.
 *
 * The reference exposes the same four members: read the whole store, read one
 * key, write a key, and watch for patches.
 */
contextBridge.exposeInMainWorld("sharedStore", {
  getAll: () => invoke("store:get-all"),
  get: (key) => invoke("store:get", key),
  set: (key, value) => send("store:set", { key, value }),
  onPatch: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("store:patch", listener);
    return () => ipcRenderer.removeListener("store:patch", listener);
  }
});

/** The chat bridge: the capture window hands the draft to the main window. */
contextBridge.exposeInMainWorld("chatBridge", {
  setChatInput: (value) => send("set-chat-input", value),
  onSetChatInput: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("set-chat-input", listener);
    return () => ipcRenderer.removeListener("set-chat-input", listener);
  }
});

contextBridge.exposeInMainWorld("versionAPI", {
  get: () => invoke("get-app-version"),
  check: () => invoke("check-for-update")
});

contextBridge.exposeInMainWorld("systemAPI", {
  getSystemInfo: () => invoke("get-system-info"),
  getDeviceDetail: () => invoke("get-device-detail"),
  openExternal: (url) => invoke("open-external", url),
  getHiddenInfo: () => invoke("get-hidden-info"),
  getHiddenInfoTwo: () => invoke("get-hidden-info-two")
});

contextBridge.exposeInMainWorld("fileAPI", {
  showSaveDialog: (options) => invoke("show-save-dialog", options),
  showOpenDialog: (options) => invoke("show-open-dialog", options),
  writeFile: (filePath, data) => invoke("write-file", filePath, data),
  readFile: (filePath) => invoke("read-file", filePath),
  readDirFiles: (dirPath) => invoke("read-dir-files", dirPath),
  getFilePath: (name, defaultPath) => invoke("get-file-path", name, defaultPath),
  getFilePathLegacy: (name, defaultPath) => invoke("get-file-path-legacy", name, defaultPath),
  copyFileToPath: (src, dest) => invoke("copy-file-to-path", src, dest),
  getPluginFileList: () => invoke("get-plugin-file-list")
});

contextBridge.exposeInMainWorld("windowAPI", {
  // The reference reads the state with `invoke` and drives the five
  // actions with `send`, because the main process serves them with
  // `ipcMain.on`. An `invoke` to a channel with no handler registered is
  // rejected, so the title bar would do nothing.
  getWindowState: () => invoke("get-window-state"),
  minimize: () => send("window-minimize"),
  maximize: () => send("window-maximize"),
  unmaximize: () => send("window-unmaximize"),
  exitFullScreen: () => send("window-exit-full-screen"),
  close: () => send("window-close"),
  onWindowStateChanged: (listener) => on("window-state-changed", listener),
  removeWindowStateListener: (listener) => {
    ipcRenderer.removeAllListeners("window-state-changed");
    void listener;
  }
});

contextBridge.exposeInMainWorld("logAPI", {
  logInfo: (...args) => invoke("log-info", ...args),
  logError: (...args) => invoke("log-error", ...args),
  logWarn: (...args) => invoke("log-warn", ...args),
  logDebug: (...args) => invoke("log-debug", ...args),
  logVerbose: (...args) => invoke("log-verbose", ...args)
});

contextBridge.exposeInMainWorld("dbAPI", {
  getUserSettings: () => invoke("get-all-user-settings"),
  setUserSetting: (key, value, type, description) =>
    invoke("set-user-setting", key, value, type, description),
  getUserSettingOneByKey: (key) => invoke("get-user-setting-one-by-key", key),
  getUserInfo: () => invoke("get-user-info"),
  addUser: (user) => invoke("add-user", user),
  updateUserInfo: (info) => invoke("update-user-info", info),
  getProjects: (userName) => invoke("get-projects", userName),
  addProjects: (project) => invoke("add-projects", project),
  updateProjects: (id, data) => invoke("update-projects", id, data),
  deleteProject: (id) => invoke("delete-project", id),
  updateProjectTaskInfo: (id, data) => invoke("update-project-task-info", id, data),
  updateProjectOverView: (id, doc) => invoke("update-project-over-view", id, doc),
  updateProjectFields: (id, data) => invoke("update-project-fields", id, data),
  getProjectOverView: (id) => invoke("get-project-over-view", id),
  updateProjectRemoteContextSummary: (id, summary) =>
    invoke("update-project-remote-context-summary", id, summary),
  updateProjectTaskMode: (id, mode) => invoke("update-project-task-mode", id, mode),
  addProjectAuthParameters: (data) => invoke("add-project-auth-parameters", data),
  getProjectAuthParameters: (projectId) =>
    invoke("get-project-auth-parameters", projectId),
  deleteProjectAuthParameters: (id) =>
    invoke("delete-project-auth-parameters", id),
  addProjectHeaderParameters: (data) =>
    invoke("add-project-header-parameters", data),
  getProjectHeaderParameters: (projectId) =>
    invoke("get-project-header-parameters", projectId),
  deleteProjectHeaderParameters: (id) =>
    invoke("delete-project-header-parameters", id),
  addProjectRemarks: (data) => invoke("add-project-remarks", data),
  getProjectRemarks: (projectId) => invoke("get-project-remarks", projectId),
  updateProjectRemarks: (id, data) => invoke("update-project-remarks", id, data),
  getSets: () => invoke("get-sets"),
  addSets: (data) => invoke("add-sets", data),
  updateSets: (id, data) => invoke("update-sets", id, data),
  deleteSets: (id) => invoke("delete-sets", id),
  getAllAiTools: () => invoke("get-all-ai-tools"),
  addAiTools: (data) => invoke("add-ai-tools", data),
  deleteAiTool: (id) => invoke("delete-ai-tool", id),
  getAllTtps: () => invoke("get-all-ttps"),
  addTtp: (data) => invoke("add-ttp", data),
  updateTtp: (id, data) => invoke("update-ttp", id, data),
  deleteTtp: (id) => invoke("delete-ttp", id),
  getAllTestLists: () => invoke("get-all-test-lists"),
  addTestList: (data) => invoke("add-test-list", data),
  updateTestListTestList: (id, data) => invoke("update-test-list-test-list", id, data),
  updateTestListFocusData: (id, data) =>
    invoke("update-test-list-focus-data", id, data),
  updateTestListFocusDescription: (id, data) =>
    invoke("update-test-list-focus-description", id, data),
  getLatestTestListByProjectId: (projectId) =>
    invoke("get-latest-test-list-by-project-id", projectId),
  getChatRecords: (projectId) => invoke("get-chat-records", projectId),
  getRecentChatRecords: (projectId, limit) =>
    invoke("get-chat-records", projectId, limit),
  getChatRecordsCount: (projectId) => invoke("get-chat-records", projectId),
  addChatRecords: (data) => invoke("add-chat-record", data),
  deleteChatRecords: (id) => invoke("delete-chat-records", id),
  updateChatRecordsLikeStatus: (id, status) =>
    invoke("update-chat-records-like-status", id, status),
  addExecutionResultAll: (data) => invoke("add-execution-result-all", data),
  addExecutionResult: (data) => invoke("add-execution-result-all", data),
  getExecutionResults: (projectId) => invoke("get-execution-results", projectId),
  updateExecutionResult: (id, data) => invoke("update-execution-result", id, data),
  updateExecutionResultSummaryAndRiskItem: (id, summary, riskItem) =>
    invoke("update-execution-result-summary-and-risk-item", id, summary, riskItem),
  updateExecutionResultTimeout: (id) => invoke("update-execution-result", id),
  cleanupRunningExecutionResults: () => invoke("cleanup-running-execution-results"),
  getRunningExecutionResults: () => invoke("get-execution-results", 0),
  deleteExecutionResults: (id) => invoke("delete-execution-results", id),
  addRiskItem: (data) => invoke("add-risk-item", data),
  addRiskItemAll: (data) => invoke("add-risk-item-all", data),
  getRiskItems: (projectId) => invoke("get-risk-items", projectId),
  getRiskItemById: (id) => invoke("get-risk-item-by-id", id),
  updateRiskItem: (id, data) => invoke("update-risk-item", id, data),
  updateRiskItemIgnoreStatus: (id, status) =>
    invoke("update-risk-item-ignore-status", id, status),
  updateRiskItemVerifyStatus: (id, status) =>
    invoke("update-risk-item-verify-status", id, status),
  updateRiskItemVerifyContextHis: (id, context) =>
    invoke("update-risk-item-verify-context-his", id, context),
  updateRiskItemVerifyContext: (id, context) =>
    invoke("update-risk-item-verify-context", id, context),
  updateRiskItemVerifyEvidence: (id, evidence) =>
    invoke("update-risk-item-verify-evidence", id, evidence),
  updateRiskItemLikeStatus: (id, status) =>
    invoke("update-risk-item-like-status", id, status),
  deleteRiskItems: (id) => invoke("delete-risk-items", id),
  getRiskItemsByExecutionId: (executionId) =>
    invoke("get-risk-items", executionId),
  getRiskItemsExecutionResults: (projectId) =>
    invoke("get-risk-items-execution-results", projectId),
  addRiskItemsExecutionResults: (data) =>
    invoke("add-risk-items-execution-results", data),
  getUserSettingsAll: () => invoke("get-all-user-settings"),
  getTokenUsageSum: () => invoke("get-all-user-settings"),
  addReportExport: (data) => invoke("add-report-export", data),
  getReportExports: (projectId) => invoke("get-report-exports", projectId),
  getReportExportById: (id) => invoke("get-report-exports"),
  updateReportExportContentFormatStatus: (id, content, format, status) =>
    invoke("update-report-export-content-format-status", id, content, format, status),
  generateReport: (payload) => invoke("generate-report", payload),
  updateReportExportFilePath: (id, filePath) =>
    invoke("update-report-export-content-format-status", id, filePath),
  getCrawlerResultByProjectId: (projectId) =>
    invoke("get-crawler-result-by-project-id", projectId),
  getRiskScanByProjectId: (projectId) =>
    invoke("get-risk-scan-by-project-id", projectId),
  getProxySettings: () => invoke("get-proxy-settings"),
  updateProxySettings: (type, value) => invoke("update-proxy-settings", type, value),
  addProxyHistory: (data) => invoke("add-proxy-history", data),
  getProxyHistoryAll: () => invoke("get-proxy-history-all"),
  getProxyHistoryAnalyzedAll: () => invoke("get-proxy-history-analyzed-all"),
  updateProxyHistoryAnalysisResult: (id, result) =>
    invoke("update-proxy-history-analysis-result", id, result),
  deleteProxyHistoryNoAnalysisResult: (id) =>
    invoke("delete-proxy-history-no-analysis-result", id),
  addRepeaterList: (data) => invoke("add-repeater-list", data),
  deleteRepeaterList: (id) => invoke("delete-repeater-list", id),
  getAllRepeaterListParent: () => invoke("get-all-repeater-list-parent"),
  getAllRepeaterListByParentId: (parentId) =>
    invoke("get-all-repeater-list-by-parent-id", parentId),
  getAllRepeaterListAnalysisResult: () =>
    invoke("get-all-repeater-list-analysis-result"),
  updateRepeaterListAnalysisResult: (id, result) =>
    invoke("update-repeater-list-analysis-result", id, result),
  getDatabase: () => invoke("get-all-user-settings"),
  initializeDatabase: () => invoke("get-all-user-settings")
});

contextBridge.exposeInMainWorld("apiAPI", {
  stopTask: (taskId) => invoke("stop-task", taskId),
  request: (options) => invoke("http-request", options),
  stopRequest: (options) => invoke("stop-request", options),
  proxyRequest: (options) => invoke("proxy-request", options),
  getUserInfo: () => invoke("get-user-info"),
  getToken: () => invoke("get-user-info")
});

/**
 * AI provider bridge.
 *
 * The reconstruction talks to a user-supplied provider rather than
 * Penligent's proprietary service, so the renderer can configure an
 * OpenAI-compatible endpoint or Anthropic directly.
 */
contextBridge.exposeInMainWorld("aiAPI", {
  getConfig: () => invoke("ai-get-config"),
  setConfig: (config) => invoke("ai-set-config", config),
  clearKey: () => invoke("ai-clear-key"),
  complete: (request) => invoke("ai-complete", request),
  stream: (request) => invoke("ai-stream", request),
  stopStream: (id) => invoke("ai-stop-stream", id),
  test: (overrides) => invoke("ai-test", overrides),
  listModels: (overrides) => invoke("ai-list-models", overrides),
  onStreamData: (listener) => on("ai-stream-data", listener)
});

contextBridge.exposeInMainWorld("sseGenrateAPI", {
  startSSE: (options) => invoke("start-sse", options),
  stopSSE: (sseId) => invoke("stop-sse", sseId),
  onSSEData: (listener) => on("sse-data", listener),
  removeSSEListeners: () => {},
  // The reference's generator, which reports on a channel named after the
  // stream so that several streams can be told apart.
  startGenrate: (options) => invoke("start-sse-genrate", options),
  stopGenrate: (sseId) => invoke("stop-sse-genrate", sseId),
  onGenrateData: (sseId, listener) => on(`${sseId}-data`, listener),
  onGenrateEnd: (sseId, listener) => on(`${sseId}-end`, listener),
  onGenrateError: (sseId, listener) => on(`${sseId}-error`, listener)
});

contextBridge.exposeInMainWorld("commandAPI", {
  executeCommand: (options) => invoke("execute-command", options),
  executeCommandNonStreaming: (options) =>
    invoke("execute-command-non-streaming", options),
  stopCommand: (commandId) => invoke("stop-command", commandId),
  onCommandData: (listener) => on("command-data", listener),
  removeCommandListeners: () => {}
});

contextBridge.exposeInMainWorld("targetToolsAPI", {
  detectInputType: (input) => invoke("detect-input-type", input),
  resolveHostname: (input) => invoke("resolve-hostname", input),
  reverseIP: (input) => invoke("reverse-ip", input),
  scanPorts: (host, ports) => invoke("scan-ports", host, ports),
  scanSubdomains: (domain) => invoke("scan-subdomains", domain)
});

contextBridge.exposeInMainWorld("checkToolsAPI", {
  checkIpReal: (input) => invoke("check-ip", input),
  checkDomainReal: (input) => invoke("check-domain", input),
  checkSensitivePathReal: (input) => invoke("check-sensitive-path", input)
});

contextBridge.exposeInMainWorld("crawlerAPI", {
  runCrawler: (projectId, targets, options) =>
    invoke("run-crawler", projectId, targets, options),
  getCrawlerResult: (projectId) =>
    invoke("get-crawler-result-by-project-id", projectId),
  info: () => invoke("crawler-info"),
  onSSEData: (listener) => on("sse-data-crawler", listener),
  removeSSEListeners: () => {}
});

/**
 * Scanner bridge. The reference's `run-scanner` handler takes positional
 * arguments: (projectId, url, outputDir, extra).
 */
contextBridge.exposeInMainWorld("scannerAPI", {
  runScanner: (projectId, reqId, url, extra) =>
    invoke("run-scanner", projectId, reqId, url, extra),
  info: () => invoke("scanner-info")
});

/**
 * MITM proxy bridge.
 *
 * `onProxyEvent` carries the child process's messages — INTERCEPTED, PAUSED,
 * INTERCEPTED_RESPONSE, INFO and ERROR — exactly as the reference relays them
 * on the "fork-proxy-child" channel.
 */
contextBridge.exposeInMainWorld("proxyAPI", {
  openProxyWindow: () => invoke("create-proxy-window"),
  startProxy: () => invoke("start-proxy"),
  stopProxy: () => invoke("stop-proxy"),
  status: () => invoke("proxy-status"),
  proxyRequest: (options) => invoke("proxy-request", options),
  // The reference sends this to the proxy child with `ipcRenderer.send`, and
  // the main process listens for it with `ipcMain.on`. Invoking it instead
  // rejects, because there is no handler registered for the channel.
  sendForkProxyChildData: (payload) => ipcRenderer.send("fork-proxy-child-data", payload),
  onProxyEvent: (listener) => on("fork-proxy-child", listener),
  onForkProxyChild: (listener) => on("fork-proxy-child", listener),
  // The settings the reference keeps for the proxy.
  getAddress: () => invoke("get-proxy-address"),
  saveAddress: (address) => invoke("save-proxy-address", address),
  getInterceptRules: () => invoke("get-proxy-intercept-rules"),
  saveInterceptRules: (rules) => invoke("save-proxy-intercept-rules", rules),
  getTimeout: () => invoke("get-proxy-timeout"),
  saveTimeout: (seconds) => invoke("save-proxy-timeout", seconds),
  getHistoryPage: (options) => invoke("get-proxy-history-page", options)
});

