<script setup>
/**
 * The security toolbox.
 *
 * The reference's dialog is titled "Security Toolbox" and holds five tools,
 * each with its own input, its own output and its own history. The runs are
 * kept in the `ai_tools` table under the tool's name, and the reference
 * keeps a separate history per tool:
 *
 *   http_to_python · webshell_detection · agent_skills_check · …
 */
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import {
  FileCode2, Bug, Activity, ShieldCheck, Terminal, Loader2, X, Trash2, ScanLine
} from "lucide-vue-next";
import { useAiStore } from "@/stores/ai";
import { useNoticeStore } from "@/stores/notice";
import { useToolsStore } from "@/stores/tools";
import ReverseShellView from "@/views/ReverseShellView.vue";
import AgentSkillsDetection from "@/components/AgentSkillsDetection.vue";

const { t } = useI18n();
const aiStore = useAiStore();
const noticeStore = useNoticeStore();
const toolsStore = useToolsStore();

const TOOLS = [
  {
    key: "http_to_python",
    nav: "http2python",
    icon: FileCode2,
    title: "ai-tools.HTTP转Python",
    subtitle: "ai-tools.转换HTTP请求为Python代码",
    heading: "http-to-python.HTTP请求转Python代码",
    emptyKey: "http-to-python.暂无历史记录",
    note: "http-to-python.自动转换",
    action: "http-to-python.自动转换",
    inputLabel: "http-to-python.输入-HTTP请求",
    outputLabel: "http-to-python.输出-Python代码",
    placeholder: "http-to-python.请输入HTTP请求",
    // The reference's `http-to-python.例如` value carries a literal JSON
    // body, which vue-i18n's message compiler rejects. The example is built
    // by `useExample()` instead, so this is a plain label.
    exampleLabel: "Example",
    empty: "http-to-python.转换结果将在此显示",
    prompt:
      "Convert the following raw HTTP request into equivalent Python code using the " +
      "`requests` library. Reply with the code only, inside a single fenced block.\n\n"
  },
  {
    key: "webshell_detection",
    nav: "webshell",
    icon: Bug,
    title: "ai-tools.WebShell检测",
    subtitle: "webshell-detection.粘贴可疑代码",
    tag: "ai-tools.基于AI检测WebShell",
    heading: "webshell-detection.基于AI检测WebShell",
    emptyKey: "webshell-detection.暂无历史记录",
    inputLabel: "webshell-detection.输入-可疑代码",
    outputLabel: "webshell-detection.输出-检测结果",
    placeholder: "webshell-detection.请输入可疑文件代码",
    exampleLabel: "webshell-detection.例如",
    empty: "webshell-detection.检测结果将在此显示",
    prompt:
      "Analyse the following file for signs of a web shell: obfuscation, base64 blobs, " +
      "eval/system/exec calls, and suspicious character encodings. Reply with a short " +
      "verdict and the reasons.\n\n"
  },
  {
    key: "abnormal_process",
    nav: "process",
    icon: Activity,
    title: "abnormal-process.异常进程分析",
    subtitle: "ai-tools.基于AI分析进程列表",
    tag: "ai-tools.异常进程分析",
    emptyKey: "abnormal-process.暂无历史记录",
    note: "abnormal-process.AI将分析可疑进程",
    inputLabel: "abnormal-process.输入-进程列表",
    outputLabel: "abnormal-process.输出-分析结果",
    placeholder: "abnormal-process.请输入进程列表",
    exampleLabel: "abnormal-process.例如",
    empty: "abnormal-process.分析结果将在此显示",
    prompt:
      "Analyse the following process list for suspicious processes: unknown binaries, " +
      "listeners on unusual ports, and miners. Reply with a short verdict per process.\n\n"
  },
  {
    key: "agent_skills_check",
    nav: "agent-skills-detection",
    icon: ShieldCheck,
    title: "agent-skills-detection.skills安全审计工具",
    subtitle: "ai-tools.skills安全审计工具描述",
    inputLabel: "",
    outputLabel: "",
    placeholder: "",
    exampleLabel: "",
    empty: "",
    prompt: ""
  },
  {
    key: "reverse_shell",
    nav: "reverse",
    icon: Terminal,
    title: "reverse-shell.反向Shell生成",
    subtitle: "reverse-shell.生成各类反向Shell",
    inputLabel: "",
    outputLabel: "",
    placeholder: "",
    exampleLabel: "",
    empty: "",
    prompt: ""
  }
];

const active = ref(toolsStore.activeToolsNav);
const input = ref("");
const output = ref("");
const busy = ref(false);
const history = ref([]);

const current = computed(() => TOOLS.find((tool) => tool.nav === active.value) || TOOLS[0]);
const isEmbedded = computed(
  () => active.value === "reverse" || active.value === "agent-skills-detection"
);

function select(key) {
  active.value = key;
  toolsStore.setActiveToolsNav(key);
  input.value = "";
  output.value = "";
  loadHistory();
}

async function loadHistory() {
  const tool = current.value;
  if (!tool?.key) return;
  const rows = (await window.dbAPI.getAllAiTools()) || [];
  history.value = rows
    .filter((row) => row.tool_name === tool.key)
    .sort((a, b) => b.id - a.id);
}

onMounted(loadHistory);

async function run() {
  if (busy.value) return;
  if (!aiStore.configured) {
    noticeStore.warning("AI Not Configured", "Open Settings → AI to choose a provider.");
    window.dispatchEvent(new CustomEvent("penligent:ai-settings"));
    return;
  }
  if (!input.value.trim()) return;

  busy.value = true;
  output.value = "";
  const tool = current.value;
  try {
    const result = await window.aiAPI.complete({
      system: tool.prompt,
      messages: [{ role: "user", content: input.value }]
    });
    if (!result?.success) {
      aiStore.raiseCreditDialog(result);
      noticeStore.error("Request Failed", result?.error || "The provider returned nothing.");
      return;
    }
    output.value = result.content || "";
    const projectId = window.projectAPI?.currentProjectId ?? 0;
    await window.dbAPI.addAiTools({
      project_id: projectId,
      tool_name: tool.key,
      title: tool.title,
      tool_input: input.value,
      tool_output: output.value
    });
    await loadHistory();
  } finally {
    busy.value = false;
  }
}

/**
 * The example text.
 *
 * The reference's own example for the HTTP request carries a literal JSON
 * body; it is shown as a tooltip rather than compiled as a message.
 */
function exampleText(tool) {
  if (tool.nav === "http2python") {
    return "POST /api/login HTTP/1.1\nHost: example.com\nContent-Type: application/json\n" +
      "Cookie: session=abc123\n\n{\"username\":\"admin\",\"password\":\"123456\"}";
  }
  return "";
}

function useExample() {
  if (active.value === "http2python") {
    input.value =
      "POST /api/login HTTP/1.1\nHost: example.com\nContent-Type: application/json\n" +
      'Cookie: session=abc123\n\n{"username":"admin","password":"123456"}';
  } else if (active.value === "webshell") {
    input.value = "<?php eval(base64_decode($_POST['cmd'])); ?>";
  } else if (active.value === "process") {
    input.value =
      "USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n" +
      "root         1  0.0  0.1 169584 13256 ?        Ss   Jan01   0:03 /sbin/init";
  }
}

function removeRun(id) {
  window.dbAPI.deleteAiTool?.(id);
  loadHistory();
}
</script>

<template>
  <div class="ai-tools">
    <div class="ai-tools-header">
      <div class="ai-tools-title">
        <span>{{ t("ai-tools.安全工具箱") }}</span>
        <span class="ai-tools-subtitle">{{ t("ai-tools.AI驱动的安全分析与辅助工具") }}</span>
      </div>
      <button class="close-button" @click="$bus('close')">
        <X :size="18" />
      </button>
    </div>

    <div class="ai-tools-body">
      <div class="tool-list">
        <div
          v-for="tool in TOOLS"
          :key="tool.key"
          class="tool-item"
          :class="{ active: active === tool.nav }"
          @click="select(tool.nav)"
        >
          <component :is="tool.icon" :size="14" />
          <span>{{ t(tool.title) }}</span>
        </div>
      </div>

      <div class="tool-panel">
        <template v-if="active === 'reverse'">
          <ReverseShellView />
        </template>
        <template v-else-if="active === 'agent-skills-detection'">
          <AgentSkillsDetection />
        </template>
        <template v-else>
          <div class="tool-io">
            <div class="io-column">
              <div class="io-heading">{{ t(current.heading || current.inputLabel) }}</div>
              <div class="io-subtitle">{{ t(current.subtitle) }}</div>
              <div v-if="current.tag" class="io-tag">{{ t(current.tag) }}</div>
              <textarea
                v-model="input"
                class="tool-input"
                rows="6"
                :placeholder="t(current.placeholder)"
              />
              <div class="io-actions">
                <button
                  class="tool-button"
                  :title="exampleText(current)"
                  @click="useExample"
                >
                  {{ current.exampleLabel ? t(current.exampleLabel) : exampleText(current) }}
                </button>
                <button class="tool-button primary" :disabled="busy" @click="run">
                  <Loader2 v-if="busy" class="spin" :size="13" />
                  <ScanLine v-else :size="13" />
                  <span>
                  {{ busy ? t("chat.思考中") : t(current.action || current.note || "agent-skills-detection.扫描") }}
                </span>
                </button>
              </div>
            </div>

            <div class="io-column">
              <div class="io-title">{{ t(current.outputLabel) }}</div>
              <pre class="tool-output">{{ output || t(current.empty) }}</pre>
            </div>
          </div>

          <div class="tool-history">
            <div class="io-title">{{ t("agent-skills-detection.检测结果") }}</div>
            <div v-if="history.length === 0" class="empty">
              {{ t(current.emptyKey || "agent-skills-detection.暂无历史记录") }}
            </div>
            <div v-for="row in history" :key="row.id" class="history-item">
              <span class="history-title">{{ row.title || row.tool_name }}</span>
              <button class="icon-button" @click="removeRun(row.id)">
                <Trash2 :size="12" />
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-tools {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

.ai-tools-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.ai-tools-title {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 1.1rem;
  font-weight: 700;
}

.ai-tools-subtitle {
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--muted);
}

.close-button {
  cursor: pointer;
  color: var(--muted);
  display: flex;
  align-items: center;
}

.ai-tools-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}

.tool-list {
  width: 190px;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.85rem;
}

.tool-item:hover {
  background-color: var(--nav-active-bg-project);
}

.tool-item.active {
  background-color: var(--nav-active-bg);
}

.tool-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.tool-io {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}

.io-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.io-heading {
  font-size: 0.82rem;
  font-weight: 700;
}

.io-subtitle {
  font-size: 0.75rem;
  color: var(--muted);
}

.io-tag {
  font-size: 0.72rem;
  color: var(--accent);
}

.io-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--muted);
}

.tool-input {
  flex: 1;
  min-height: 120px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: var(--background);
  color: var(--foreground);
  font-family: "Courier New", monospace;
  font-size: 0.78rem;
  resize: none;
}

.io-actions {
  display: flex;
  gap: 5px;
}

.tool-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.78rem;
}

.tool-button.primary {
  background-color: var(--button-bg);
}

.tool-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.tool-output {
  flex: 1;
  min-height: 120px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: var(--frontground);
  font-family: "Courier New", monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--muted);
}

.tool-history {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 130px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 0.76rem;
}

.history-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icon-button {
  display: flex;
  align-items: center;
  border: none;
  background: none;
  color: var(--muted);
  cursor: pointer;
}

.empty {
  padding: 8px;
  text-align: center;
  color: var(--muted);
  font-size: 0.78rem;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
