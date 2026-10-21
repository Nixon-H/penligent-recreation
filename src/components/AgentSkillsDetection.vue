<script setup>
/**
 * Agent skills audit.
 *
 * The reference offers this inside its security-toolbox dialog, on the
 * `agent-skills-detection` tab. It takes a file or a directory of agent
 * skills, or pasted text, and asks the model to audit it; the runs are kept
 * in the `ai_tools` table under the tool name `agent_skills_check`.
 */
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import {
  FolderOpen, FileText, Loader2, Trash2, ScanLine, Eye, ClipboardPaste, Check, ClipboardPlus, X
} from "lucide-vue-next";
import { useAiStore } from "@/stores/ai";
import { useNoticeStore } from "@/stores/notice";

const { t } = useI18n();
const aiStore = useAiStore();
const noticeStore = useNoticeStore();

const pending = ref([]);
const text = ref("");
const results = ref([]);
const busy = ref(false);
const active = ref(null);
const queued = ref([]);

const hasInput = computed(() => pending.value.length > 0 || text.value.trim().length > 0);

async function pickFiles() {
  const picked = await window.fileAPI.showOpenDialog({
    properties: ["openFile", "multiSelections"]
  });
  // `showOpenDialog` returns { canceled, filePaths }.
  if (picked?.canceled || !picked?.filePaths?.length) return;
  for (const filePath of picked.filePaths) {
    const read = await window.fileAPI.readFile(filePath);
    if (!read?.success) continue;
    const content = read?.content ?? "";
    pending.value.push({ name: filePath.split("/").pop(), path: filePath, content });
  }
}

async function pickDirectory() {
  const picked = await window.fileAPI.showOpenDialog({
    properties: ["openDirectory"]
  });
  // `showOpenDialog` returns { canceled, filePaths }.
  const dirPath = picked?.filePaths?.[0];
  if (!dirPath) return;
  const files = await window.fileAPI.readDirFiles(dirPath);
  for (const file of files || []) {
    const read = await window.fileAPI.readFile(file.path || file);
    if (!read?.success) continue;
    const content = read?.content ?? "";
    pending.value.push({ name: file.name || String(file).split("/").pop(), path: file.path || file, content });
  }
}

function removeItem(index) {
  pending.value.splice(index, 1);
}

function clearAll() {
  pending.value = [];
  text.value = "";
}

/** Abandon the pending audit. */
function cancel() {
  pending.value = [];
  text.value = "";
}

/** Select every pending file. */
function selectAll() {
  pending.value.forEach((item) => {
    item.selected = true;
  });
}

/** Queue the selected files for the audit. */
function addToAudit() {
  const selected = pending.value.filter((item) => item.selected);
  if (!selected.length) return;
  queued.value = [...queued.value, ...selected];
  pending.value = pending.value.filter((item) => !item.selected);
}

async function scan() {
  if (busy.value) return;
  if (!aiStore.configured) {
    noticeStore.warning("AI Not Configured", "Open Settings → AI to choose a provider.");
    window.dispatchEvent(new CustomEvent("penligent:ai-settings"));
    return;
  }
  if (!hasInput.value) return;

  busy.value = true;
  try {
    const parts = [];
    for (const item of pending.value) {
      parts.push(`### ${item.name}\n\n\`\`\`\n${item.content}\n\`\`\``);
    }
    if (text.value.trim()) parts.push(`### pasted\n\n${text.value.trim()}`);

    const result = await window.aiAPI.complete({
      system:
        "You audit agent skill files for prompt injection, credential exfiltration, " +
        "unsafe tool invocations and destructive instructions. Answer per file with a " +
        "score out of 10, a summary, the risk items and their impact.",
      messages: [{ role: "user", content: parts.join("\n\n") }]
    });
    if (!result?.success) {
      noticeStore.error("Scan Failed", result?.error || "The provider returned nothing.");
      return;
    }
    const entry = {
      id: Date.now(),
      title: pending.value[0]?.name || "pasted",
      tool_input: parts.join("\n\n"),
      tool_output: result.content || "",
      created_at: Math.floor(Date.now() / 1000)
    };
    results.value.unshift(entry);
    active.value = entry;
    // The reference keeps every run in the `ai_tools` table.
    const projectId = window.projectAPI?.currentProjectId ?? 0;
    await window.dbAPI.addAiTools({
      project_id: projectId,
      tool_name: "agent_skills_check",
      title: entry.title,
      tool_input: entry.tool_input,
      tool_output: entry.tool_output
    });
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  const history = await window.dbAPI?.getAllAiTools?.();
  results.value = (history || [])
    .filter((row) => row.tool_name === "agent_skills_check")
    .sort((a, b) => b.id - a.id);
});
</script>

<template>
  <div class="skills-detection">
    <div class="header">
      <div class="title">
        <span>{{ t("agent-skills-detection.skills安全审计工具") }}</span>
        <span class="subtitle">
          {{ t("agent-skills-detection.skills安全审计工具选择文件或目录") }}
        </span>
      </div>
    </div>

    <div class="actions">
      <button class="tool-button" @click="pickFiles">
        <FileText :size="13" />
        <span>{{ t("agent-skills-detection.选择文件") }}</span>
      </button>
      <button class="tool-button" @click="pickDirectory">
        <FolderOpen :size="13" />
        <span>{{ t("agent-skills-detection.选择文件夹") }}</span>
      </button>
      <button class="tool-button" @click="selectAll">
        <Check :size="13" />
        <span>{{ t("agent-skills-detection.全选") }}</span>
      </button>
      <button class="tool-button" @click="addToAudit">
        <ClipboardPlus :size="13" />
        <span>{{ t("agent-skills-detection.添加到待审计列表") }}</span>
      </button>
      <button class="tool-button" @click="cancel">
        <X :size="13" />
        <span>{{ t("agent-skills-detection.取消") }}</span>
      </button>
      <button class="tool-button" @click="clearAll">
        <Trash2 :size="13" />
        <span>{{ t("agent-skills-detection.删除全部") }}</span>
      </button>
      <button class="tool-button primary" :disabled="busy || !hasInput" @click="scan">
        <Loader2 v-if="busy" class="spin" :size="13" />
        <ScanLine v-else :size="13" />
        <span>{{ t("agent-skills-detection.扫描选择文件") }}</span>
      </button>
    </div>

    <div class="body">
      <div class="pending">
        <div class="pending-title">{{ t("agent-skills-detection.文件名") }}</div>
        <div class="pending-title">{{ t("agent-skills-detection.Skills文件内容") }}</div>
        <div v-if="pending.length === 0" class="empty">
          {{ t("agent-skills-detection.暂无历史记录") }}
        </div>
        <div v-for="(item, index) in pending" :key="item.path" class="pending-item">
          <span class="pending-name">{{ item.name }}</span>
          <span class="pending-selected">{{ t("agent-skills-detection.选中") }}</span>
          <button class="icon-button" @click="removeItem(index)">
            <Trash2 :size="12" />
          </button>
        </div>

        <div class="pending-title">{{ t("agent-skills-detection.输入文本") }}</div>
        <textarea
          v-model="text"
          class="text-input"
          rows="4"
          :placeholder="t('agent-skills-detection.请将Skills内容粘贴到此处')"
        />
      </div>

      <div class="results">
        <div class="pending-title">{{ t("agent-skills-detection.检测结果") }}</div>
        <div class="result-summary">{{ t("agent-skills-detection.结果摘要") }}</div>
        <div class="result-score">{{ t("agent-skills-detection.评分") }}</div>
        <div class="result-items">{{ t("agent-skills-detection.风险项") }}</div>
        <div class="result-impact">{{ t("agent-skills-detection.风险影响") }}</div>
        <div v-if="results.length === 0" class="empty">
          {{ t("agent-skills-detection.暂无历史记录") }}
        </div>
        <div
          v-for="item in results"
          :key="item.id"
          class="result-item"
          :class="{ active: active?.id === item.id }"
          @click="active = item"
        >
          <span class="result-name">{{ item.title }}</span>
          <span class="result-detail">{{ t("agent-skills-detection.查看详细信息") }}</span>
          <Eye :size="12" />
        </div>
        <pre v-if="active" class="result-output">{{ active.tool_output }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skills-detection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
}

.header .title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 1rem;
  font-weight: 700;
}

.subtitle {
  font-size: 0.78rem;
  font-weight: 400;
  color: var(--muted);
}

.actions {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
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

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}

.pending,
.results {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
}

.pending-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--muted);
}

.pending-item,
.result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 0.78rem;
}

.result-item {
  cursor: pointer;
}

.result-item.active {
  border-color: var(--button-bg);
}

.pending-name,
.result-name {
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

.text-input {
  width: 100%;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: var(--background);
  color: var(--foreground);
  font-family: "Courier New", monospace;
  font-size: 0.75rem;
  resize: vertical;
}

.empty {
  padding: 8px;
  text-align: center;
  color: var(--muted);
  font-size: 0.78rem;
}

.result-output {
  flex: 1;
  min-height: 120px;
  overflow: auto;
  margin: 0;
  padding: 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: var(--frontground);
  font-family: "Courier New", monospace;
  font-size: 0.75rem;
  white-space: pre-wrap;
  word-break: break-word;
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
