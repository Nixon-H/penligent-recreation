/**
 * Penligent — AI provider layer.
 *
 * The reference application sends every AI request to Penligent's own service
 * (`VITE_API_BASE` + `/api/agent/<path>/v1/messages`) and gates the whole agent
 * surface behind a Penligent account. That service is proprietary and is not
 * reachable from this environment, so the reconstruction talks to a
 * user-supplied provider instead.
 *
 * Two provider families are supported:
 *
 *   "openai"    — any OpenAI-compatible endpoint.
 *                 Request:  POST {baseUrl}/chat/completions
 *                 Headers:  Authorization: Bearer <apiKey>
 *                 Works with: OpenAI, Ollama, LM Studio, vLLM, llama.cpp,
 *                 DeepSeek, Groq, Together, OpenRouter, Azure-compatible
 *                 gateways, …
 *
 *   "anthropic" — the Anthropic Messages API.
 *                 Request:  POST {baseUrl}/v1/messages
 *                 Headers:  x-api-key: <apiKey>
 *                           anthropic-version: 2023-06-01
 *                 Works with: api.anthropic.com, Anthropic-compatible
 *                 gateways, and local proxies such as claude-code-router.
 *
 * Configuration is persisted in the `user_settings` table, mirroring the
 * reference's own use of `user_settings` for the LLM token (`res_token`).
 */
const { ipcMain, app } = require("electron");
const { buildMainPayload } = require("./agentContract.cjs");
const { registerAbort } = require("./taskManager.cjs");
const zlib = require("node:zlib");
const { build } = require("../db/db.cjs");

const SETTING_PREFIX = "ai.";
const DEFAULT_CONFIG = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: ""
};

let api = null;
const db = () => (api ||= build(app));

const activeStreams = new Map();

/** Models that reject the legacy `max_tokens` / `temperature` fields. */
const MODERN_ONLY_MODELS = /^(o\d|gpt-5|gpt-4\.\d+-reasoning)/i;

const FALLBACKS = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" },
  // The reference's own service, offered so that anyone can use the original
  // models. Its model list is public; the messages endpoint needs a token.
  penligent: { baseUrl: "https://api.penligent.ai", model: "penliai-4-5-101" }
};

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

function normaliseProvider(value) {
  const key = String(value || "").toLowerCase();
  if (key === "anthropic" || key === "claude") return "anthropic";
  if (key === "penligent" || key === "penliai") return "penligent";
  return "openai";
}

function readConfig(db) {
  const rows = db.getUserSettings();
  const stored = Object.fromEntries(
    rows
      .filter((row) => row.setting_key.startsWith(SETTING_PREFIX))
      .map((row) => [row.setting_key.slice(SETTING_PREFIX.length), row.setting_value])
  );

  const provider = normaliseProvider(stored.provider || DEFAULT_CONFIG.provider);
  const fallback = FALLBACKS[provider];

  return {
    provider,
    baseUrl: stored.baseUrl || fallback.baseUrl,
    apiKey: stored.apiKey || "",
    model: stored.model || fallback.model,
    temperature: stored.temperature !== undefined
      ? Number(stored.temperature)
      : DEFAULT_CONFIG.temperature,
    maxTokens: stored.maxTokens !== undefined
      ? Number(stored.maxTokens)
      : DEFAULT_CONFIG.maxTokens,
    systemPrompt: stored.systemPrompt || ""
  };
}

function writeConfig(db, config) {
  const provider = normaliseProvider(config.provider);
  const fallback = FALLBACKS[provider];
  // `apiKey: undefined` means "the user did not type a new key" — the stored
  // key must be kept. Only an explicit empty string clears it.
  const existingKey = readConfig(db).apiKey;
  const values = {
    provider,
    baseUrl: config.baseUrl || fallback.baseUrl,
    apiKey: config.apiKey === undefined ? existingKey : config.apiKey,
    model: config.model || fallback.model,
    temperature: String(config.temperature ?? DEFAULT_CONFIG.temperature),
    maxTokens: String(config.maxTokens ?? DEFAULT_CONFIG.maxTokens),
    systemPrompt: config.systemPrompt ?? ""
  };
  for (const [key, value] of Object.entries(values)) {
    db.setUserSetting(
      `${SETTING_PREFIX}${key}`,
      value,
      "string",
      `AI provider ${key}`
    );
  }
  return values;
}

/** Redact the key before the configuration leaves the main process. */
function publicConfig(config) {
  return {
    ...config,
    apiKey: config.apiKey ? maskKey(config.apiKey) : "",
    hasApiKey: Boolean(config.apiKey),
    endpoint: resolveEndpoint(config.provider, config.baseUrl)
  };
}

function maskKey(key) {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

/* ------------------------------------------------------------------ *
 * Request construction
 * ------------------------------------------------------------------ */

/**
 * Resolve the request endpoint from a user-supplied base URL.
 *
 * The user may enter any of these, and all of them must work:
 *   "https://api.anthropic.com"          -> .../v1/messages
 *   "https://api.anthropic.com/v1"       -> .../v1/messages
 *   "https://api.anthropic.com/v1/messages" -> unchanged
 *   "https://api.openai.com"              -> .../v1/chat/completions
 *   "https://api.openai.com/v1"           -> .../v1/chat/completions
 *   "http://localhost:11434/v1"           -> .../v1/chat/completions
 *   ".../v1/chat/completions"             -> unchanged
 */
function resolveEndpoint(provider, baseUrl) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base) return "";
  if (provider === "anthropic") {
    if (base.endsWith("/v1/messages")) return base;
    if (base.endsWith("/v1")) return `${base}/messages`;
    return `${base}/v1/messages`;
  }
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/v1")) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/**
 * Build the request for Penligent's own agent endpoint.
 *
 * The reference posts to
 *
 *     POST {VITE_API_BASE}/api/agent/main/v1/messages
 *     Authorization: Bearer <user_token>
 *
 * with the body recovered from the reference's renderer bundle:
 *
 *     { auto_send_status, model, mode, project_id, user_input, Language,
 *       context, current_target_info, remark, history_summary, timeout_tools,
 *       risk_list, enable_web_search, system_prompt_config, plugins }
 *
 * `system_prompt_config` carries the nine client-side variables, which the
 * reconstruction already assembles.
 */
function buildPenligentRequest(config, request) {
  const base = String(config.baseUrl || FALLBACKS.penligent.baseUrl).replace(/\/+$/, "");
  const url = base.endsWith("/api/agent/main/v1/messages")
    ? base
    : `${base}/api/agent/main/v1/messages`;
  const context = request.context || {};
  // The contract is the faithful port of the reference's request body.
  const body = buildMainPayload({
    model: config.model,
    mode: context.mode || "Agent",
    projectId: context.projectId,
    userInput: request.messages?.map((entry) => entry.content).join("\n") || "",
    language: context.language || "en",
    chatContext: context.context || [],
    currentTargetInfo: context.overview || {},
    remark: context.remark || {},
    historySummary: context.historySummary || {},
    timeoutTools: context.timeoutTools || [],
    riskList: context.riskList || [],
    enableWebSearch: context.enableWebSearch,
    autoSendStatus: context.autoSendStatus,
    clientInfo: context.clientInfo || {},
    testTarget: context.testTarget || "",
    analysisRound: context.analysisRound || 1,
    aiPythonPath: context.aiPythonPath || "",
    aiScriptPath: context.aiScriptPath || "",
    focusData: context.focusData ?? null,
    taskTree: context.taskTree ?? null,
    taskFocus: context.taskFocus || "",
    selfTools: context.selfTools || [],
    plugins: context.plugins || []
  });
  return {
    url,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        authorization: `Bearer ${config.apiKey || ""}`
      },
      body: JSON.stringify(body)
    }
  };
}

function buildRequest(config, request) {
  if (config.provider === "penligent") {
    return buildPenligentRequest(config, request);
  }
  const { system, messages, stream } = request;
  if (config.provider === "anthropic") {
    const url = resolveEndpoint("anthropic", config.baseUrl || FALLBACKS.anthropic.baseUrl);
    const body = {
      model: config.model,
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature ?? 0.7,
      messages,
      stream: Boolean(stream)
    };
    if (system) body.system = system;
    return {
      url,
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey || "",
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(body)
      }
    };
  }

  const url = resolveEndpoint("openai", config.baseUrl || FALLBACKS.openai.baseUrl);
  const chatMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;
  const body = {
    model: config.model,
    messages: chatMessages,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens || 4096,
    stream: Boolean(stream)
  };
  // Some reasoning models only accept `max_completion_tokens` and reject
  // `temperature`; the request is retried with the modern field on a 400.
  if (MODERN_ONLY_MODELS.test(config.model || "")) {
    delete body.max_tokens;
    delete body.temperature;
    body.max_completion_tokens = config.maxTokens || 4096;
  }
  return {
    url,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey || ""}`
      },
      body: JSON.stringify(body)
    }
  };
}

/* ------------------------------------------------------------------ *
 * Response parsing
 * ------------------------------------------------------------------ */

function extractText(config, payload) {
  if (!payload) return "";
  if (config.provider === "anthropic") {
    if (typeof payload.content === "string") return payload.content;
    if (Array.isArray(payload.content)) {
      return payload.content
        .filter((part) => part && (part.type === "text" || typeof part.text === "string"))
        .map((part) => part.text || "")
        .join("");
    }
    return "";
  }
  const choice = payload.choices && payload.choices[0];
  if (!choice) return "";
  if (choice.message && typeof choice.message.content === "string") {
    return choice.message.content;
  }
  if (typeof choice.text === "string") return choice.text;
  return "";
}

/**
 * The status a stream event implies.
 *
 * The reference shows a different message while the model thinks, replies,
 * runs a tool or searches the web. The Anthropic stream says so directly in
 * its `content_block_start` events; the OpenAI shape has to be inferred.
 */
function extractStatus(config, payload) {
  if (!payload) return null;
  if (config.provider === "anthropic") {
    if (payload.type !== "content_block_start" || !payload.content_block) return null;
    const block = payload.content_block;
    if (block.type === "thinking") return { status: "thinking" };
    if (block.type === "text") return { status: "text" };
    if (block.type === "server_tool_use") return { status: "web_search" };
    if (block.type === "tool_use") {
      return { status: "tool", tool: block.name || "" };
    }
    return null;
  }
  const choice = payload.choices && payload.choices[0];
  const delta = choice && choice.delta;
  if (delta && Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
    return { status: "tool" };
  }
  if (delta && typeof delta.content === "string" && delta.content) {
    return { status: "text" };
  }
  return null;
}

/**
 * The tool call a stream event carries, if any.
 *
 * The reference shows each tool call in the chat with the command it ran and
 * two actions on it.
 */
function extractToolCall(config, payload) {
  if (!payload) return null;
  if (config.provider === "anthropic") {
    if (payload.type !== "content_block_start") return null;
    const block = payload.content_block;
    if (!block || block.type !== "tool_use") return null;
    return { id: block.id || "", command: block.name || "" };
  }
  const choice = payload.choices && payload.choices[0];
  const delta = choice && choice.delta;
  const calls = delta && delta.tool_calls;
  if (!Array.isArray(calls) || !calls.length) return null;
  const call = calls[0];
  const command = (call.function && call.function.name) || "";
  if (!command) return null;
  return { id: String(call.id || ""), command };
}

function extractDelta(config, payload) {
  if (!payload) return "";
  if (config.provider === "anthropic") {
    if (payload.type === "content_block_delta" && payload.delta) {
      return payload.delta.text || "";
    }
    return "";
  }
  const choice = payload.choices && payload.choices[0];
  if (!choice) return "";
  if (choice.delta && typeof choice.delta.content === "string") return choice.delta.content;
  if (typeof choice.text === "string") return choice.text;
  return "";
}

/** Parse one Server-Sent Events frame into a JSON payload (or null). */
function parseSseFrame(frame) {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data || data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function decodeChunk(buffer) {
  if (!buffer) return "";
  try {
    return zlib.gunzipSync(buffer).toString("utf8");
  } catch {
    return buffer.toString("utf8");
  }
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

ipcMain.handle("ai-get-config", () => publicConfig(readConfig(db())));

ipcMain.handle("ai-set-config", (_event, config) => {
  writeConfig(db(), config || {});
  return publicConfig(readConfig(db()));
});

ipcMain.handle("ai-clear-key", () => {
  writeConfig(db(), { ...readConfig(db()), apiKey: "" });
  return publicConfig(readConfig(db()));
});

/** Non-streaming completion. */
ipcMain.handle("ai-complete", async (_event, request) => {
  const config = readConfig(db());
  if (!config.model) {
    return { success: false, error: "No AI model configured. Open Settings → AI to configure a provider." };
  }

  const { url, init } = buildRequest(config, {
    system: request.system || config.systemPrompt,
    messages: request.messages || [],
    stream: false
  });

  // A request can be stopped: the caller passes a task id and the abort
  // controller is registered with the task manager.
  const taskId = request.taskId || "";
  const controller = new AbortController();
  if (taskId) registerAbort(taskId, request.id || "complete", controller);

  try {
    const { response, text: preRead } = await postWithFallback(
      url,
      {
        ...init,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)])
      },
      JSON.parse(init.body),
      config.provider === "openai"
    );
    const text = preRead !== undefined ? preRead : await response.text();
    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: providerError(response.status, text),
        code: providerErrorCode(text)
      };
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    return { success: true, status: response.status, content: extractText(config, payload) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/** Streaming completion; each delta is pushed to the renderer. */
ipcMain.handle("ai-stream", async (event, request) => {
  const config = readConfig(db());
  const id = request.id || `ai-${Date.now()}`;

  const send = (payload) => {
    if (event.sender.isDestroyed()) return;
    event.sender.send("ai-stream-data", { id, ...payload });
  };

  if (!config.model) {
    send({ type: "error", error: "No AI model configured. Open Settings → AI to configure a provider." });
    send({ type: "end" });
    return { success: false, id };
  }

  const { url, init } = buildRequest(config, {
    system: request.system || config.systemPrompt,
    messages: request.messages || [],
    stream: true
  });

  const controller = new AbortController();

  const read = async () => {
    try {
      const { response } = await postWithFallback(
        url,
        { ...init, signal: controller.signal },
        JSON.parse(init.body),
        config.provider === "openai"
      );
      if (!response.ok) {
        const text = await response.text();
        send({ type: "error", error: providerError(response.status, text) });
        send({ type: "end" });
        return;
      }
      if (!response.body) {
        send({ type: "error", error: "The provider returned no response body." });
        send({ type: "end" });
        return;
      }

      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("text/event-stream")) {
        // The provider ignored `stream: true` and answered with one JSON
        // document. Surface it as a single delta instead of an empty reply.
        const text = await response.text();
        let payload = null;
        try {
          payload = JSON.parse(text);
        } catch {
          payload = null;
        }
        const content = extractText(config, payload) || text;
        if (content) send({ type: "delta", delta: content });
        send({ type: "end" });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      for await (const chunk of response.body) {
        if (event.sender.isDestroyed()) break;
        buffer += decoder.decode(chunk, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const payload = parseSseFrame(frame);
          if (payload) {
            const status = extractStatus(config, payload);
            if (status) send({ type: "status", ...status });
            const toolCall = extractToolCall(config, payload);
            if (toolCall) send({ type: "tool", ...toolCall });
            const delta = extractDelta(config, payload);
            if (delta) send({ type: "delta", delta });
            if (payload.type === "message_stop") {
              send({ type: "end" });
              return;
            }
            if (payload.choices && payload.choices[0] && payload.choices[0].finish_reason) {
              send({ type: "end" });
              return;
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
      send({ type: "end" });
    } catch (error) {
      if (error.name !== "AbortError") {
        send({ type: "error", error: error.message });
      }
      send({ type: "end" });
    }
  };

  activeStreams.set(id, controller);
  read().finally(() => activeStreams.delete(id));

  return { success: true, id };
});

ipcMain.handle("ai-stop-stream", (_event, id) => {
  const controller = activeStreams.get(id);
  if (controller) {
    controller.abort();
    activeStreams.delete(id);
    return { success: true, id, stopped: true };
  }
  return { success: true, id, stopped: false };
});

/**
 * List the models the configured provider offers.
 *
 * The reference does the same thing against Penligent's service:
 *
 *     GET /api/model/open  ->  { data: { llm_list: [...] } }
 *     ... and falls back to the hard-coded "penliai-4-5-101" on failure.
 *
 * Both provider families expose the same shape under a different path —
 * OpenAI-compatible servers serve `GET {base}/models` and Anthropic serves
 * `GET {base}/v1/models`, both returning `{ data: [{ id }] }` — so the
 * reference's `llm_list` is reproduced here as a normalised model list.
 */
ipcMain.handle("ai-list-models", async (_event, overrides) => {
  const config = { ...readConfig(db()) };
  for (const [key, value] of Object.entries(overrides || {})) {
    if (value !== undefined) config[key] = value;
  }
  if (!config.baseUrl) {
    return { success: false, error: "No base URL configured.", models: [] };
  }

  const base = String(config.baseUrl).replace(/\/+$/, "");

  // Penligent's own list is public and needs no credentials:
  //
  //   GET /api/model/open  ->  { data: { llm_list: [...] } }
  //
  // The reference falls back to the hard-coded "penliai-4-5-101".
  if (config.provider === "penligent") {
    try {
      const response = await fetch(`${base}/api/model/open`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15000)
      });
      if (response.ok) {
        const payload = await response.json();
        const list = payload?.data?.llm_list || payload?.llm_list || [];
        const models = list.filter(Boolean);
        if (models.length) return { success: true, models };
      }
    } catch {
      /* fall through to the reference's hard-coded default */
    }
    return { success: true, models: [FALLBACKS.penligent.model] };
  }

  const candidates =
    config.provider === "anthropic"
      ? [base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`]
      : [base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`, `${base}/models`];

  const headers =
    config.provider === "anthropic"
      ? { "x-api-key": config.apiKey || "", "anthropic-version": "2023-06-01" }
      : { authorization: `Bearer ${config.apiKey || ""}` };

  let lastError = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        lastError = `Model list request failed (${response.status}).`;
        continue;
      }
      const payload = await response.json();
      const list = Array.isArray(payload?.data) ? payload.data : [];
      const models = list
        .map((entry) => (typeof entry === "string" ? entry : entry?.id))
        .filter(Boolean);
      if (models.length) return { success: true, models };
      lastError = "The provider returned an empty model list.";
    } catch (error) {
      lastError = error.message;
    }
  }
  return { success: false, error: lastError || "Could not read the model list.", models: [] };
});

/** Connectivity probe used by the settings dialog's "Test connection" button. */
ipcMain.handle("ai-test", async (_event, overrides) => {
  const config = { ...readConfig(db()) };
  // Only apply overrides that were actually supplied; an explicit `undefined`
  // must not shadow the stored key.
  for (const [key, value] of Object.entries(overrides || {})) {
    if (value !== undefined) config[key] = value;
  }
  if (!config.baseUrl) {
    return { success: false, error: "No base URL configured." };
  }
  const { url, init } = buildRequest(config, {
    system: "You are a connectivity probe.",
    messages: [{ role: "user", content: "Reply with the single word: ok" }],
    stream: false
  });
  try {
    const { response, text: preRead } = await postWithFallback(
      url,
      { ...init, signal: AbortSignal.timeout(20000) },
      JSON.parse(init.body),
      config.provider === "openai"
    );
    const text = preRead !== undefined ? preRead : await response.text();
    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: providerError(response.status, text),
        code: providerErrorCode(text)
      };
    }
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      /* not JSON — still a reachable endpoint */
    }
    return {
      success: true,
      status: response.status,
      content: extractText(config, payload).slice(0, 200),
      endpoint: url
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * POST to the provider, retrying once with the modern field names when the
 * provider rejects the legacy `max_tokens` / `temperature` fields.
 */
async function postWithFallback(url, init, body, allowFallback) {
  const response = await fetch(url, init);
  if (response.status !== 400 || !allowFallback) return { response, body };

  const text = await response.text();
  // Only a complaint about the *parameter name* triggers the retry. A value
  // error such as Anthropic's "max_tokens must be <= N" must not.
  const mentionsMaxTokens =
    /max_tokens[\s\S]{0,120}(not supported|unsupported|unknown|unrecognized|unexpected|is not valid)/i.test(text) ||
    /(not supported|unsupported|unknown|unrecognized|unexpected)[\s\S]{0,120}max_tokens/i.test(text);
  if (!mentionsMaxTokens || body.max_completion_tokens) {
    return { response, body, text };
  }

  const retryBody = { ...body };
  delete retryBody.max_tokens;
  delete retryBody.temperature;
  retryBody.max_completion_tokens = body.max_tokens || body.max_completion_tokens || 4096;
  const retry = await fetch(url, { ...init, body: JSON.stringify(retryBody) });
  return { response: retry, body: retryBody };
}

/** The numeric error code a provider reported, if any. */
function providerErrorCode(text) {
  try {
    const payload = JSON.parse(text);
    const raw = payload?.code ?? payload?.error?.code ?? payload?.data?.code;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

/**
 * Describe a provider failure.
 *
 * The reference reads the numeric `code` out of the error body to decide
 * which dialog to open (80001 → subscription, 80002 → top-up), so the code
 * is surfaced alongside the message.
 */
function providerError(status, text) {
  let detail = text;
  let code = 0;
  try {
    const payload = JSON.parse(text);
    detail =
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      text;
    const raw = payload?.code ?? payload?.error?.code ?? payload?.data?.code;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed !== 0) code = parsed;
  } catch {
    /* keep the raw body */
  }
  const message = String(detail || "").slice(0, 400);
  if (status === 401 || status === 403) {
    return `Authentication failed (${status}). Check the API key. ${message}`;
  }
  if (status === 404) {
    return `Endpoint not found (${status}). Check the base URL and model name. ${message}`;
  }
  if (status === 429) {
    return `Rate limited (${status}). ${message}`;
  }
  return `Provider error ${status}. ${message}`;
}

module.exports = {
  readConfig,
  writeConfig,
  publicConfig,
  buildRequest,
  extractText,
  resolveEndpoint
};
