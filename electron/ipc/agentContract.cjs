/**
 * Penligent — agent request contract.
 *
 * The reference application builds every agent request **client-side** and
 * posts it to Penligent's service; the server relays the payload to the
 * model. That means the request *contract* is recoverable from the package,
 * and the reconstruction reproduces it exactly.
 *
 * Recovered from the reference renderer bundle (de-obfuscated with webcrack).
 * The twenty agent endpoints and the payload each one sends:
 *
 *   /api/agent/main/v1/messages
 *     { auto_send_status, model, mode, project_id, user_input, Language,
 *       context, current_target_info, remark, history_summary, timeout_tools,
 *       risk_list, enable_web_search,
 *       system_prompt_config: { client_info } }
 *
 *   /api/agent/next/v1/messages, /api/agent/tool-summary/v1/messages,
 *   /api/agent/verify-vul/v1/messages, … follow the same shape.
 *
 *   /api/agent/generate-task-tree/v1/messages
 *     { test_type, test_target, task, current_target_info, remark,
 *       system_prompt_config: { client_info }, plugins }
 *
 * The reference sends `Authorization: Bearer <user_token>`; the
 * reconstruction sends `Authorization: Bearer <apiKey>` for the
 * OpenAI-compatible family and `x-api-key` for Anthropic, and falls back to
 * the reference's bearer scheme when talking to a Penligent-compatible relay.
 *
 * Because the reference assembles the whole prompt on the client, the same
 * contract works against any OpenAI-compatible or Anthropic endpoint — which
 * is what the reconstruction does.
 */

/** The agent endpoints the reference exposes, with their payload builders. */
const AGENT_ENDPOINTS = {
  main: "/api/agent/main/v1/messages",
  next: "/api/agent/next/v1/messages",
  contextSummary: "/api/agent/context-summary/v1/messages",
  generateTaskTree: "/api/agent/generate-task-tree/v1/messages",
  generateTaskFocusDescription:
    "/api/agent/generate-task-focus-description/v1/messages",
  toolSummary: "/api/agent/tool-summary/v1/messages",
  ttpGenerate: "/api/agent/ttp-generate/v1/messages",
  ttpSelect: "/api/agent/ttp-select/v1/messages",
  verifyVul: "/api/agent/verify-vul/v1/messages",
  verifyVulHistoryCompress: "/api/agent/verify-vul-history-compress/v1/messages",
  reportExport: "/api/agent/report-export/v1/messages",
  skillDetection: "/api/agent/skill-detection-tool/v1/messages",
  webshellDetection: "/api/agent/webshell-detection-tool/v1/messages",
  httpRequestToPython: "/api/agent/http-request-to-python-code-tool/v1/messages",
  packetCaptureAnalysis: "/api/agent/packet-capture-analysis-tool/v1/messages",
  fofaQuery: "/api/agent/fofa-query/v1/messages",
  abnormalProcessAnalysis:
    "/api/agent/abnormal-process-analysis-tool/v1/messages",
  targetInfoUpdate: "/api/agent/target-info-update/v1/messages",
  forceToolExecution: "/api/agent/force-tool-execution/v1/messages"
};

/**
 * Build the `system_prompt_config` the reference sends.
 *
 * The reference's server turns these client-side variables into its system
 * prompt, so the variables themselves are the recoverable part of the
 * "brain": the target, the analysis round, the configured Python and script
 * paths, the focused task, the whole task tree, the focus description and the
 * user's own tool set.
 *
 * Recovered from the reference's `force-tool-execution` request.
 */
function buildSystemPromptConfig(context) {
  const {
    clientInfo = {},
    testTarget = "",
    analysisRound = 1,
    aiPythonPath = "",
    aiScriptPath = "",
    focusData = null,
    taskTree = null,
    taskFocus = "",
    selfTools = []
  } = context;

  return {
    client_info: JSON.stringify(clientInfo),
    test_target: testTarget,
    analysis_round: String(analysisRound),
    ai_python_path: aiPythonPath,
    ai_script_path: aiScriptPath,
    task: JSON.stringify(focusData),
    task_tree: JSON.stringify(taskTree),
    task_focus: taskFocus,
    self_tools: JSON.stringify(selfTools)
  };
}

/**
 * Build the payload the reference sends to `/api/agent/main/v1/messages`.
 *
 * Every field matches the reference's construction, including the JSON
 * stringification of nested structures.
 */
function buildMainPayload(context) {
  const {
    model,
    mode,
    projectId,
    userInput,
    language,
    chatContext,
    currentTargetInfo,
    remark,
    historySummary,
    timeoutTools,
    riskList,
    enableWebSearch,
    autoSendStatus,
    clientInfo,
    testTarget,
    analysisRound,
    aiPythonPath,
    aiScriptPath,
    focusData,
    taskTree,
    taskFocus,
    selfTools
  } = context;

  return {
    auto_send_status: autoSendStatus ? "1" : "0",
    model: model || "",
    mode: (mode || "Agent").toLowerCase(),
    project_id: String(projectId ?? ""),
    user_input: userInput || "",
    Language: language || "en",
    // The reference's `context` is an array of recent chat entries that the
    // client assembles and the server summarises.
    context: Array.isArray(chatContext) ? chatContext : [],
    current_target_info: JSON.stringify(currentTargetInfo ?? {}),
    remark: JSON.stringify(remark ?? {}),
    history_summary: JSON.stringify(historySummary ?? {}),
    timeout_tools: JSON.stringify(timeoutTools ?? []),
    risk_list: JSON.stringify(riskList ?? []),
    enable_web_search: Boolean(enableWebSearch),
    system_prompt_config: buildSystemPromptConfig({
      clientInfo,
      testTarget,
      analysisRound,
      aiPythonPath,
      aiScriptPath,
      focusData,
      taskTree,
      taskFocus,
      selfTools
    })
  };
}

/**
 * Build the payload the reference sends to
 * `/api/agent/generate-task-tree/v1/messages`.
 */
function buildTaskTreePayload(context) {
  const {
    testType,
    testTarget,
    task,
    currentTargetInfo,
    remark,
    clientInfo,
    plugins
  } = context;

  return {
    test_type: testType || "",
    test_target: testTarget || "",
    task: JSON.stringify(task ?? []),
    current_target_info: JSON.stringify(currentTargetInfo ?? {}),
    remark: JSON.stringify(remark ?? {}),
    system_prompt_config: {
      client_info: JSON.stringify(clientInfo ?? {})
    },
    plugins: JSON.stringify(plugins ?? [])
  };
}

module.exports = {
  AGENT_ENDPOINTS,
  buildMainPayload,
  buildTaskTreePayload,
  buildSystemPromptConfig
};
