<script setup>
/**
 * Agent chat panel.
 *
 * The reference streams its conversation from Penligent's own service and
 * gates it behind an account. This reconstruction streams from the provider
 * the user configured (OpenAI-compatible or Anthropic) and never requires a
 * Penligent account.
 *
 * Composer layout is reproduced from the reference: a bordered footer with a
 * transparent two-row textarea, a mode chip, a scope chip and a circular
 * submit button.
 */
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from "vue";
import {
  MessageSquare,
  ChevronDown,
  GlobeLock,
  Globe,
  ArrowUp,
  Square,
  Settings2,
  SquarePen,
  Search,
  Play,
  Wrench,
  Check,
  CircleX,
  CircleCheck,
  Loader
} from "lucide-vue-next";
import { useProjectStore } from "@/stores/project";
import { useI18n } from "vue-i18n";
import { useAiStore } from "@/stores/ai";
import { useAgentStore } from "@/stores/agent";
import { useNoticeStore } from "@/stores/notice";
import { useDialogStore } from "@/stores/dialog";
import { useToolsStore } from "@/stores/tools";
import { usePluginStore } from "@/stores/plugin";
import MarkdownContent from "@/components/MarkdownContent.vue";

const projectStore = useProjectStore();
const { t, locale } = useI18n();
const aiStore = useAiStore();
const agentStore = useAgentStore();
const toolsStore = useToolsStore();
const pluginStore = usePluginStore();
const noticeStore = useNoticeStore();
const dialogStore = useDialogStore();

const draft = ref("");
const sending = ref(false);
const modeOpen = ref(false);
const webSearch = ref(false);
const inputBox = ref(null);
const contentBox = ref(null);
const liveReply = ref("");
const liveStatus = ref("");
const liveTools = ref([]);
/** The tool the pointer is over, as the reference tracks it. */
const hovered = ref(null);
/** The tool ids picked for each message. */
const toolSelection = ref({});
/** The model's thinking, kept apart from its reply. */
const liveThinking = ref("");
const waitingForTool = ref(false);
const confirmStop = ref(false);
/** The tool calls the model proposed, with their status. */
const toolCalls = ref([]);
const activeToolResult = ref(null);
const liveError = ref("");
/** The message currently being sent, used to avoid duplicating it. */
const pendingText = ref("");

/**
 * The reference's chat model list is exactly ["Ask", "Agent"] — recovered from
 * the renderer bundle (`const h = a0_0x189d69(["Ask", "Agent"])`).
 */
const MODES = [
  { key: "agent", label: "Agent", icon: MessageSquare },
  { key: "ask", label: "Ask", icon: MessageSquare },
  { key: "manual", label: "Manual", icon: Wrench }
];

const mode = ref(MODES[0]);

/**
 * The chat records in the reference's shape.
 *
 * The reference keeps a list of messages, each of which is either a user
 * message with a `text_content` or an assistant message with a
 * `think_content`, a `text_content`, the tool calls it proposed
 * (`tool_meta_data`) and the ones that were picked (`tool_choose_list`).
 */
const messages = computed(() =>
  (projectStore.chatRecords || []).map((record) => {
    const metadata = parseMetadata(record.chat_metadata);
    if (record.chat_type === "assistant") {
      const tools = metadata.tool_meta_data || [];
      return {
        id: record.id,
        role: "assistant",
        think_content: metadata.think_content || "",
        think_content_fold: true,
        text_content: record.chat_content || "",
        choose_list: metadata.choose_list || [],
        tool_meta_data: tools,
        tool_choose_list: metadata.tool_choose_list || [],
        like_status: record.like_status || "neutral"
      };
    }
    return {
      id: record.id,
      role: "user",
      text_content: record.chat_content || ""
    };
  })
);

/** The metadata the reference keeps alongside a chat record. */
function parseMetadata(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Active streams, keyed by request id.
 *
 * A single DevTools listener is registered for the lifetime of the component
 * and dispatches to the stream that owns the event. Registering a listener
 * per message leaked one listener for every message sent.
 */
const streams = new Map();
let disposeStreamListener = null;

/* ------------------------------------------------------------------ *
 * Prompt construction
 * ------------------------------------------------------------------ */

function projectContext() {
  const project = projectStore.currentProject;
  if (!project) return "No project is selected.";
  const risks = projectStore.risks
    .slice(0, 20)
    .map((risk) => `- [${risk.severity}] ${risk.title}`)
    .join("\n");
  const results = projectStore.executionResults
    .slice(0, 10)
    .map((result) => `- ${result.tool_name} (${result.status})`)
    .join("\n");

  return [
    `Project: ${project.project_name}`,
    project.project_description ? `Description: ${project.project_description}` : null,
    risks ? `Known findings:\n${risks}` : null,
    results ? `Recent tool executions:\n${results}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The system prompt.
 *
 * The reference keeps its prompt template on the server and sends the
 * variables it substitutes into it as `system_prompt_config`. The
 * reconstruction sends the same variables (see `buildSystemPromptConfig`) and
 * pairs them with a local instruction that tells the model to answer in the
 * same terms.
 */
function systemPrompt() {
  const base =
    "You are Penligent, an offensive-security assistant embedded in a penetration testing platform. " +
    "Give concrete, technically precise answers about reconnaissance, vulnerability analysis, " +
    "exploitation and remediation. Prefer checklists, commands and payload syntax over prose. " +
    "Never invent tool output.";

  const config = agentStore.systemPromptConfig(
    projectStore.currentProject,
    projectStore.currentTestList
  );

  if (mode.value.key === "ask") {
    return `${base} Answer the user's question directly and concisely.`;
  }
  // The reference sends these variables in the request's context, and
  // Penligent's own service substitutes them into its system prompt, so they
  // are not written into the prompt here.
  void config;
  return (
    `${base}\n\nCurrent workspace:\n${projectContext()}\n\n` +
    "When you want a tool to be run, end your reply with a fenced JSON block of the form " +
    '{"tool_meta_data": [{"id": "<id>", "command": "<the command to run>", "summary": "<what it does>"}]}. ' +
    "Otherwise end with an empty block: {\"tool_meta_data\": []}."
  );
}

/**
 * Conversation history for the request.
 *
 * The user's message is persisted before the request is built, so it is
 * already the last entry of the history — appending it again would send it
 * twice. `excludeLastUserMessage` drops that duplicate.
 */
function historyForRequest() {
  const records = messages.value.filter((record) => record.chat_content);
  const last = records[records.length - 1];
  const withoutDuplicate =
    last && last.chat_type === "user" && last.chat_content === pendingText.value
      ? records.slice(0, -1)
      : records;
  // The reference keeps the last eight messages, and six after a summary
  // round.
  return withoutDuplicate.slice(-8).map((record) => ({
    role: record.chat_type === "assistant" ? "assistant" : "user",
    content: record.chat_content
  }));
}

/* ------------------------------------------------------------------ *
 * Sending
 * ------------------------------------------------------------------ */

async function grow() {
  const el = inputBox.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

/**
 * The message shown while the model works.
 *
 * The reference shows a different one for thinking, replying, running a tool,
 * generating code and searching the web.
 */
function statusText(payload) {
  if (payload.status === "thinking") return t("chat.思考中");
  if (payload.status === "text") return t("chat.正在回复");
  if (payload.status === "web_search") return t("chat.联网搜索中");
  if (payload.status === "tool") {
    return payload.tool === "createScript"
      ? t("chat.代码生成中")
      : t("chat.工具解析中");
  }
  return "";
}

async function scrollToBottom() {
  await nextTick();
  if (contentBox.value) contentBox.value.scrollTop = contentBox.value.scrollHeight;
}

async function send() {
  const text = draft.value.trim();
  if (sending.value) return;
  if (text === "") {
    noticeStore.addNotice({
      title: t("notice.请输入内容"),
      content: t("notice.请输入内容"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  if (text.length >= 100000) {
    noticeStore.addNotice({
      title: t("notice.输入内容过长"),
      content: t("notice.输入内容过长提示"),
      type: "error",
      duration: 5000
    });
    return;
  }

  if (!aiStore.configured) {
    noticeStore.addNotice({
      title: t("notice.错误"),
      content: t("notice.请填写完整的环境配置"),
      type: "error",
      duration: 5000
    });
    dialogStore.openDialog("setting");
    return;
  }

  if (!projectStore.currentProject) {
    noticeStore.addNotice({
      title: t("notice.错误"),
      content: t("notice.请先创建任务"),
      type: "error",
      duration: 5000
    });
    return;
  }

  sending.value = true;
  liveReply.value = "";
  liveError.value = "";
  pendingText.value = text;

  try {
    await window.dbAPI.addChatRecords({
      project_id: projectStore.currentProject.id,
      chat_type: "user",
      chat_content: text,
      chat_metadata: JSON.stringify({ mode: mode.value.key })
    });
    draft.value = "";
    await grow();
    await projectStore.selectProject(projectStore.currentProject);
    await scrollToBottom();

    const request = {
      system: systemPrompt(),
      messages: [...historyForRequest(), { role: "user", content: text }],
      id: `ai-${Date.now()}`,
      // The context the reference assembles on the client and sends with
      // every agent request.
      context: agentContext()
    };

    streams.set(request.id, { text: "", error: "" });

    const result = await window.aiAPI.stream(request);
    if (!result?.success) {
      noticeStore.addNotice({
        title: t("notice.SSE ERROR"),
        content: t("notice.消息发送失败"),
        type: "error",
        duration: 5000
      });
      liveError.value = result?.error || "The request could not be started.";
      aiStore.raiseCreditDialog(result);
    }
  } catch (error) {
    liveError.value = error.message;
  } finally {
    pendingText.value = "";
  }
}

/**
 * The client-side context.
 *
 * The reference assembles this on the client and sends it with every agent
 * request; Penligent's own service substitutes the nine
 * `system_prompt_config` variables into its system prompt.
 */
function agentContext() {
  const project = projectStore.currentProject;
  const testList = projectStore.currentTestList;
  const config = agentStore.systemPromptConfig(project, testList);
  return {
    mode: mode.value.key,
    projectId: project?.id ?? 0,
    language: locale.value,
    context: historyForRequest().map((entry) => ({
      role: entry.role,
      content: entry.content
    })),
    overview: project?.overview || {},
    remark: project?.remark || {},
    historySummary: testList?.history_summary || "{}",
    timeoutTools: [],
    riskList: projectStore.risks || [],
    enableWebSearch: webSearch.value,
    autoSendStatus: mode.value.key === "agent",
    clientInfo: config.client_info,
    testTarget: config.test_target,
    analysisRound: config.analysis_round,
    aiPythonPath: config.ai_python_path,
    aiScriptPath: config.ai_script_path,
    focusData: config.task,
    taskTree: config.task_tree,
    taskFocus: config.task_focus,
    selfTools: config.self_tools,
    plugins: pluginStore.pluginList
  };
}

/**
 * The tool calls the model proposed.
 *
 * The reference's server returns them in the stream as `tool_meta_data`; a
 * provider that is not Penligent's own returns them in a fenced JSON block
 * the prompt asks for.
 */
function parseToolCalls(reply) {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced ? fenced[1] : "", reply];
  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      const calls = parsed?.tool_meta_data;
      if (Array.isArray(calls)) return calls;
    } catch {
      /* not a JSON block */
    }
  }
  return [];
}

/**
 * The agent's run loop.
 *
 * The reference: the model proposes the tools, the client decides which run
 * next, the commands are executed, the results are fed back, the analysis
 * round is incremented and the model is asked again — until the plan is
 * finished, when the report is generated.
 */
async function runAgentLoop(reply) {
  const calls = parseToolCalls(reply);
  if (calls.length === 0) return;

  // In the manual mode the user chooses which calls run.
  if (mode.value.key === "manual") {
    liveTools.value = calls.map((call) => ({
      id: call.id,
      command: call.command,
      summary: call.summary,
      status: "pending",
      output: ""
    }));
    return;
  }

  const testList = projectStore.currentTestList;
  const all = agentStore.nextTasks(testList).length;
  const done = agentStore.nextTasks(testList).filter((task) => task.is_complete).length;
  const { actions } = agentStore.plan({
    chooseList: calls.map((call) => call.id),
    testList,
    allTaskCount: all,
    completeTaskCount: done
  });

  const runnable = actions.filter((action) => action.command);
  if (runnable.length === 0) return;

  agentStore.advance();
  const results = [];
  for (const action of runnable) {
    const outcome = await window.commandAPI?.executeCommand?.({
      command: action.command,
      cwd: projectStore.currentProject?.project_target || ""
    });
    results.push({
      id: action.id,
      command: action.command,
      summary: action.description,
      result: outcome?.stdout || outcome?.output || outcome?.error || ""
    });
  }

  // The results go back to the model with the incremented round.
  const request = {
    system: systemPrompt(),
    messages: [
      ...historyForRequest(),
      {
        role: "user",
        content:
          `The following tools were executed:\n${JSON.stringify(results, null, 2)}\n\n` +
          "Continue with the next step, or report that the work is complete."
      }
    ],
    id: `ai-${Date.now()}`
  };
  streams.set(request.id, { text: "", error: "" });
  const result = await window.aiAPI.stream(request);
  if (result?.success) {
    const stream = streams.get(request.id);
    if (stream?.text) await runAgentLoop(stream.text);
  }
}

async function finish(id, failed = false) {
  const stream = id ? streams.get(id) : null;
  const reply = (stream ? stream.text : liveReply.value).trim();
  liveReply.value = "";
  // A provider error is reported by the 'error' event and is immediately
  // followed by 'end'; the message must survive it.
  if (!failed) liveError.value = "";
  sending.value = false;
  if (id) streams.delete(id);

  if (reply && projectStore.currentProject) {
    // The reference keeps the thinking, the tool calls and the ones that
    // were picked alongside the message.
    const tools = liveTools.value.map((tool) => ({
      id: tool.id,
      excute_type: "",
      tool_name: tool.name || tool.tool_name || "",
      command_path: "",
      command_command: tool.command,
      command_description: tool.description || tool.summary || "",
      status: tool.status || "pending"
    }));
    await window.dbAPI.addChatRecords({
      project_id: projectStore.currentProject.id,
      chat_type: "assistant",
      chat_content: reply,
      chat_metadata: JSON.stringify({
        architecture: aiStore.config.provider,
        hasToolSelection: tools.length > 0,
        isComplete: true,
        finalResultProcessed: true,
        toolsToExecute: tools,
        thinking: liveThinking.value,
        hasThinking: Boolean(liveThinking.value),
        think_content: liveThinking.value,
        tool_meta_data: tools,
        tool_choose_list: tools.map((tool) => tool.id),
        choose_list: []
      })
    });
    await projectStore.selectProject(projectStore.currentProject);
    if (!failed && mode.value.key === "agent") {
      await runAgentLoop(reply);
    }
  }
  await scrollToBottom();
  void id;
}

/**
 * Stop the current session.
 *
 * The reference asks for confirmation first.
 */
async function stop() {
  const id = [...streams.keys()][0];
  if (!confirmStop.value) {
    confirmStop.value = true;
    return;
  }
  confirmStop.value = false;
  await window.aiAPI.stopStream?.(id);
  sending.value = false;
  // The reference does not write the interrupted reply to the database; the
  // partial text stays in the live buffer.
  noticeStore.addNotice({
    title: t("notice.已触发手动中断"),
    content: liveError.value || t("notice.中断请求"),
    type: "info",
    duration: 5000
  });
}

/**
 * The web-search mode.
 *
 * The reference toggles it and reports the change through a notice.
 */
function toggleWebSearch() {
  webSearch.value = !webSearch.value;
  noticeStore.addNotice({
    title: t("notice.联网搜索"),
    content: webSearch.value
      ? t("notice.联网搜索模式已启用")
      : t("notice.联网搜索模式已关闭"),
    type: "info",
    duration: 5000
  });
}

/** The tools picked for a message. */
function selectedFor(chatId) {
  return toolSelection.value[chatId] || [];
}

/** Pick one tool, as the reference's checkbox does. */
function toggleSelectTool(chatId, toolId) {
  const current = selectedFor(chatId);
  toolSelection.value[chatId] = current.includes(toolId)
    ? current.filter((id) => id !== toolId)
    : [...current, toolId];
}

/** Pick every tool of a message, or none of them. */
function toggleSelectAllTool(chatId) {
  const message = messages.value.find((entry) => entry.id === chatId);
  if (!message) return;
  const all = message.tool_meta_data.map((tool) => tool.id);
  toolSelection.value[chatId] =
    selectedFor(chatId).length === all.length ? [] : all;
}

/** Run the tools that were picked. */
async function runSelected(chatId) {
  const message = messages.value.find((entry) => entry.id === chatId);
  if (!message) return;
  const picked = message.tool_meta_data.filter((tool) =>
    selectedFor(chatId).includes(tool.id)
  );
  for (const tool of picked) {
    const outcome = await window.commandAPI?.executeCommand?.({
      command: tool.command_command,
      cwd: projectStore.currentProject?.project_target || ""
    });
    tool.status = "success";
    tool.result = outcome?.stdout || outcome?.output || outcome?.error || "";
  }
}


/** Edit the command a tool call would run. */
function editCommand(tool) {
  // The command lives in `command_command`, the reference's field.
  const next = window.prompt(t("chat.编辑命令"), tool.command_command || "");
  if (next === null) return;
  tool.command_command = next;
}

/**
 * Show the result of a tool call.
 *
 * The reference finds the run whose command matches and shows its output.
 */
function searchResult(tool) {
  activeToolResult.value = tool;
}

/** The run that produced a tool call, if there is one. */
const toolResult = computed(() => {
  const tool = activeToolResult.value;
  if (!tool) return null;
  const command = (tool.command_command || "").trim();
  if (!command) return null;
  const runs = projectStore.executionResults || [];
  return (
    runs.find((run) => (run.command || "").trim() === command) ||
    runs.find((run) => (run.parameters || "").includes(command)) ||
    null
  );
});

/** Continue with one of the planned actions. */
function selectAction(action) {
  const list = projectStore.currentTestList;
  if (!list) return;
  // The focus is the whole task, as the reference stores it.
  const task = (projectStore.currentTestList?.test_list || [])
    .flatMap((group) => group.tasks || [])
    .find((entry) => entry.id === action.id);
  window.dbAPI.updateTestListFocusData(
    list.id,
    JSON.stringify(task ? { ...task } : { id: action.id })
  );
  window.dbAPI.updateTestListFocusDescription(list.id, action.description || "");
  projectStore.selectProject(projectStore.currentProject);
}

function chooseMode(next) {
  mode.value = next;
  modeOpen.value = false;
}

onMounted(async () => {
  await aiStore.load();
  await pluginStore.getPluginFilesList();
  disposeStreamListener = window.aiAPI.onStreamData((payload) => {
    const stream = streams.get(payload.id);
    if (!stream) return;
    if (payload.type === "tool") {
      liveTools.value = [
        ...liveTools.value,
        { id: payload.id, command: payload.command, status: "running", output: "" }
      ];
    } else if (payload.type === "status") {
      liveStatus.value = statusText(payload);
    } else if (payload.type === "delta") {
      stream.text += payload.delta;
      liveReply.value = stream.text;
      scrollToBottom();
    } else if (payload.type === "error") {
      stream.error = payload.error;
      liveError.value = payload.error;
      noticeStore.addNotice({
        title: t("notice.SSE ERROR"),
        content: t("notice.接收消息失败"),
        type: "error",
        duration: 5000
      });
      // The reference opens its credit dialogs on the provider's error codes.
      aiStore.raiseCreditDialog({ code: payload.code });
    } else if (payload.type === "end") {
      finish(payload.id, Boolean(stream.error));
    }
  });
  await grow();
  await scrollToBottom();
});

onBeforeUnmount(() => {
  if (disposeStreamListener) disposeStreamListener();
  disposeStreamListener = null;
  streams.clear();
});
</script>

<template>
  <div class="chat-container">
    <div ref="contentBox" class="content-container">
      <!-- The reference renders nothing in the chat until a project exists,
           so the reconstruction does the same. -->

      <div v-for="message in messages" :key="message.id" class="chat-item">
        <div v-if="message.role === 'user'" class="chat-user-container">
          <div class="chat-user-content">{{ message.text_content }}</div>
        </div>
        <div v-else class="chat-assistant-container">
          <div
            v-if="message.think_content"
            class="think-content"
          >
            <MarkdownContent :source="message.think_content" />
          </div>
          <div class="text-content">
            <MarkdownContent :source="message.text_content" />
          </div>

          <div
            v-for="tool in message.tool_meta_data"
            :key="tool.id"
            class="tool-content-item"
            @mouseenter="hovered = { chat: message.id, tool: tool.id }"
            @mouseleave="hovered = null"
          >
            <div
              v-if="mode.key !== 'agent' && mode.key !== 'ask'"
              class="tool-item-choose"
              :class="{
                'tool-item-choose-active': selectedFor(message.id).includes(tool.id)
              }"
              @click="toggleSelectTool(message.id, tool.id)"
            >
              <Check v-if="selectedFor(message.id).includes(tool.id)" :size="15" />
            </div>
            <div class="tool-item-command">
              <div class="tool-content-item-description-fold">
                {{ tool.command_description }}
              </div>
              <div class="tool-content-item-title">
                {{ tool.command_command }}
              </div>
            </div>
            <div class="tool-item-status">
              <CircleX
                v-if="tool.status === 'error'"
                class="tool-item-status-error"
                :size="15"
              />
              <CircleCheck
                v-else-if="tool.status === 'success'"
                class="tool-item-status-success"
                :size="15"
              />
              <Loader
                v-else-if="tool.status === 'running'"
                class="tool-item-status-running"
                :size="15"
              />
            </div>
            <div
              v-if="hovered && hovered.chat === message.id && hovered.tool === tool.id"
              class="tool-item-button-item"
            >
              <button
                v-if="mode.key !== 'agent' && mode.key !== 'ask'"
                class="tool-item-button"
                @click.stop="editCommand(tool)"
              >
                <SquarePen :size="12" />
                <span>{{ t("chat.编辑命令") }}</span>
              </button>
              <button class="tool-item-button" @click.stop="searchResult(tool)">
                <Search :size="12" />
                <span>{{ t("chat.搜索执行结果") }}</span>
              </button>
            </div>
            <div
              v-if="activeToolResult && activeToolResult.id === tool.id && toolResult"
              class="tool-item-result"
            >
              <div class="tool-item-result-label">{{ t("tool.输出") }}</div>
              <pre class="tool-item-result-output">{{ toolResult.result_data || "" }}</pre>
            </div>
          </div>

          <div
            v-if="mode.key === 'manual' && message.tool_meta_data.length"
            class="tool-choose-actions"
          >
            <button class="choose-button" @click="toggleSelectAllTool(message.id)">
              {{ t("chat.全选") }}
            </button>
            <button
              class="run-button"
              :disabled="!selectedFor(message.id).length"
              @click="runSelected(message.id)"
            >
              {{ t("chat.执行") }}
            </button>
          </div>

          <div
            v-if="message.choose_list && message.choose_list.length && mode.key !== 'ask'"
            class="tool-content-item"
            v-for="action in message.choose_list"
            :key="action.id || action.action_name"
          >
            <div class="tool-item-command">
              <div class="tool-content-item-title">{{ t(action.action_name) }}</div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="agentStore.actions.length" class="chat-tools">
        <div
          v-for="action in agentStore.actions"
          :key="action.id || action.action_name"
          class="tool-item"
        >
          <div class="tool-item-command">
            {{ t(action.action_name) }}
          </div>
          <div v-if="action.id" class="tool-item-buttons">
            <button class="tool-item-button" @click.stop="selectAction(action)">
              <Play :size="12" />
              <span>{{ t("chat.继续") }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="liveStatus" class="chat-item">
        <div class="chat-bubble assistant loading">
          <span class="loading-message-icon">
            <span class="loading-message-icon-item" />
            <span class="loading-message-icon-item" />
            <span class="loading-message-icon-item" />
          </span>
          <span>{{ liveStatus }}</span>
        </div>
      </div>

      <div v-else-if="waitingForTool" class="chat-item">
        <div class="chat-bubble assistant loading">
          <span class="loading-message-icon">
            <span class="loading-message-icon-item" />
            <span class="loading-message-icon-item" />
            <span class="loading-message-icon-item" />
          </span>
          <span>{{ t("chat.等待工具执行完成后进行分析") }}</span>
        </div>
      </div>

      <div v-if="liveReply" class="chat-item">
        <div class="chat-assistant-container">
          <div class="text-content">
            <MarkdownContent :source="liveReply" />
          </div>
        </div>
      </div>

      <div v-if="liveError" class="chat-item">
        <div class="chat-bubble error">{{ liveError }}</div>
      </div>
    </div>

    <div class="footer-container">
      <div class="input-container">
        <textarea
          ref="inputBox"
          v-model="draft"
          class="input-box"
          rows="2"
          :placeholder="t('chat.请输入内容')"
          @input="grow"
          @keydown.enter.exact.prevent="send"
        />
      </div>

      <div class="select-container">
        <div class="select-mode-container" @click="modeOpen = !modeOpen">
          <MessageSquare class="select-mode-container-icon" :size="12" />
          <span class="select-mode-item-text">{{ mode.label }}</span>
          <ChevronDown class="select-mode-container-icon" :size="10" />

          <div v-if="modeOpen" class="select-mode-absolute-container">
            <div
              v-for="item in MODES"
              :key="item.key"
              class="select-mode-item"
              @click.stop="chooseMode(item)"
            >
              {{ item.label }}
            </div>
          </div>
        </div>

        <div
          class="select-search-container"
          :class="{ active: webSearch }"
          :title="t('chat.联网搜索')"
          @click.stop="toggleWebSearch"
        >
          <Globe
            v-if="webSearch"
            class="select-search-container-icon select-search-container-icon-globe"
            :size="16"
          />
          <GlobeLock v-else class="select-search-container-icon" :size="16" />
        </div>

        <div
          v-if="sending && confirmStop"
          class="stop-confirm"
        >
          <span class="stop-confirm-text">{{ t("chat.确认停止当前聊天吗？") }}</span>
          <button class="stop-confirm-button" @click="stop">{{ t("chat.停止") }}</button>
          <button class="stop-confirm-button" @click="confirmStop = false">
            {{ t("chat.不停止") }}
          </button>
        </div>
        <div
          v-else-if="sending"
          class="submit-button-container stop"
          title="Stop"
          @click="stop"
        >
          <Square :size="13" />
        </div>
        <div v-else class="submit-button-container" title="Send" @click="send">
          <ArrowUp :size="15" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-item-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
  padding: 8px;
  border-radius: 5px;
  background-color: var(--button-hover);
}

.tool-item-result-label {
  font-size: 0.75rem;
  color: var(--muted);
}

.tool-item-result-output {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  font-size: 0.78rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.chat-container {
  width: calc(100% - 5px);
  height: 100%;
  margin: 0 2.5px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.chat-container .content-container {
  width: 100%;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-bottom: 200px;
}

.chat-empty {
  margin: auto;
  text-align: center;
  color: var(--muted);
}

.chat-empty-title {
  font-weight: 700;
  color: var(--foreground);
}

.chat-container .content-container .chat-item {
  width: 100%;
}

.chat-tools {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-self: flex-start;
}

.tool-item {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 8px;
  min-width: 200px;
}

.tool-item-command {
  font-family: "Courier New", monospace;
  font-size: 0.75rem;
  margin-bottom: 4px;
  word-break: break-all;
}

.tool-item-buttons {
  display: flex;
  gap: 6px;
}

.tool-item-button {
  display: flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.72rem;
}

.tool-item-button:hover {
  color: var(--foreground);
}

.loading-message-icon {
  display: inline-flex;
  gap: 3px;
  margin-right: 6px;
  vertical-align: middle;
}

.loading-message-icon-item {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: currentColor;
  animation: loading-dot 1.2s infinite ease-in-out;
}

.loading-message-icon-item:nth-child(2) {
  animation-delay: 0.2s;
}

.loading-message-icon-item:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes loading-dot {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}

.chat-bubble.loading {
  color: var(--muted);
  font-style: italic;
}

.stop-confirm {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
}

.stop-confirm-text {
  color: var(--muted);
}

.stop-confirm-button {
  padding: 1px 7px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.72rem;
}

.chat-bubble {
  border-radius: 5px;
  padding: 5px 10px;
  margin: 5px 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.9rem;
  line-height: 1.5;
  border: 1px solid var(--border);
}

.chat-bubble.user {
  background-color: var(--nav-active-bg-project);
  margin-left: 20px;
}

.chat-bubble.assistant {
  background-color: var(--background);
  margin-right: 20px;
}

.chat-bubble.error {
  border-color: var(--danger);
  color: var(--danger);
  background-color: var(--background);
  margin-right: 20px;
}

.chat-container .footer-container {
  position: relative;
  width: calc(100% - 12px);
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: var(--frontground);
  border: 1px solid var(--border);
  padding: 5px;
  min-height: 50px;
  border-radius: 5px;
  margin-bottom: 5px;
  gap: 5px;
}

.chat-container .footer-container .input-container {
  width: 100%;
  display: block;
}

.chat-container .footer-container .input-container .input-box {
  width: 100%;
  resize: none;
  background-color: transparent;
  border: none;
  color: var(--foreground);
  font-size: 1rem;
  padding: 0;
  overflow-y: auto;
  line-height: 1.5;
}

.chat-container .footer-container .input-container .input-box:focus {
  outline: none;
}

.chat-container .footer-container .select-container {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 3px;
  position: relative;
}

.chat-container .footer-container .select-container .select-mode-container {
  display: flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  font-size: 1rem;
  border-radius: 5px;
  padding: 2px 5px;
  position: relative;
  max-width: calc(50% - 10px);
}

.chat-container .footer-container .select-container .select-mode-container .select-mode-container-icon {
  min-width: 10px;
  min-height: 10px;
}

.chat-container .footer-container .select-container .select-mode-container .select-mode-absolute-container {
  position: absolute;
  bottom: 120%;
  left: 0;
  background-color: var(--background);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 3px;
  display: flex;
  flex-direction: column;
  min-width: 100px;
  z-index: 5;
}

.chat-container .footer-container .select-container .select-mode-container .select-mode-absolute-container .select-mode-item {
  padding: 3px 8px;
  border-radius: 3px;
  cursor: pointer;
  color: var(--foreground);
}

.chat-container .footer-container .select-container .select-mode-container .select-mode-absolute-container .select-mode-item:hover {
  background-color: var(--button-hover);
}

.chat-container .footer-container .select-container .select-mode-container:first-child {
  background-color: var(--button-bg);
}

.chat-container .footer-container .select-container .select-mode-container:first-child:hover {
  background-color: var(--button-hover);
}

.select-search-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 3px;
  cursor: pointer;
}

.chat-container .footer-container .select-container .submit-button-container {
  position: absolute;
  right: 0;
  cursor: pointer;
  background-color: var(--button-bg);
  border-radius: 50%;
  padding: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-container .footer-container .select-container .submit-button-container:hover {
  background-color: var(--button-hover);
}

.chat-container .footer-container .select-container .submit-button-container.stop {
  background-color: var(--danger);
}
</style>
