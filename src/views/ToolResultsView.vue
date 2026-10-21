<script setup>
/**
 * Tool results — the execution history of the current project.
 *
 * The reference shows "No tool execution results available." when the project
 * has no recorded executions.
 */
import { computed, ref } from "vue";
import { useProjectStore } from "@/stores/project";
import { useI18n } from "vue-i18n";

const projectStore = useProjectStore();
const { t } = useI18n();

/** Every execution, the running ones first. */
const allResults = computed(() => {
  const rows = projectStore.executionResults || [];
  const running = rows.filter((row) => row.status === "running");
  const rest = rows.filter((row) => row.status !== "running");
  return [...running, ...rest];
});

/**
 * The window.
 *
 * The reference renders fifty results and adds ten more every time the
 * container is scrolled to the bottom.
 */
const windowSize = ref(50);
const visible = computed(() => allResults.value.slice(0, windowSize.value));

function onScroll(event) {
  const el = event.target;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
    if (windowSize.value < allResults.value.length) windowSize.value += 10;
  }
}

/** The number of findings a run produced. */
function findCount(result) {
  return Number(result?.find_count ?? 0);
}

/** The four statuses the reference knows. */
function statusLabel(status) {
  if (status === "success") return t("tool.成功");
  if (status === "failed") return t("tool.失败");
  if (status === "running") return t("tool.进行中");
  if (status === "stopped") return t("tool.中断");
  return status || "";
}

/** The rows whose output is shown. */
const expanded = ref(new Set());

function toggle(id) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

/** Stop a run that is still going. */
async function stop(result) {
  await window.commandAPI?.stopCommand?.(result.id);
  await window.dbAPI.updateExecutionResult(result.id, {
    status: "stopped",
    end_time: Math.floor(Date.now() / 1000)
  });
  await projectStore.selectProject(projectStore.currentProject);
}

/** The parameters the reference stores as JSON. */
function parameters(result) {
  if (!result?.parameters) return {};
  if (typeof result.parameters === "object") return result.parameters;
  try {
    return JSON.parse(result.parameters) || {};
  } catch {
    return {};
  }
}

/** The command the tool ran, as the reference reads it from `parameters`. */
function toolCommand(result) {
  const params = parameters(result);
  return params.tool_command || params.command || result?.command || "";
}

/** The explanation the model gave, as the reference reads it. */
function explanation(result) {
  const params = parameters(result);
  return params.explanation || result?.summary || "";
}

/** The output, from the reference's `result_data` column. */
function output(result) {
  if (!result?.result_data) return "";
  if (typeof result.result_data !== "string") return JSON.stringify(result.result_data, null, 2);
  return result.result_data;
}

/** The duration of a run, in the reference's units. */
function duration(result) {
  const seconds = Number(result.duration ?? 0);
  if (!seconds) return "";
  if (seconds < 60) return `${seconds}${t("tool.秒")}`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}${t("tool.分钟")}`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}${t("tool.小时")}`;
  return `${Math.floor(seconds / 86400)}${t("tool.天")}`;
}

/** The time a run started, as the reference prints it. */
function formatTime(seconds) {
  if (!seconds) return "";
  const date = new Date(Number(seconds) * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
</script>

<template>
  <div class="tool-results-container" @scroll="onScroll">
    <div v-if="allResults.length === 0" class="tool-results-empty">
      {{ t("tool.暂无执行的工具结果") }}</div>

    <div v-for="result in visible" :key="result.id" class="tool-result-item">
      <div class="tool-result-header">
        <span class="tool-result-name">{{ result.tool_name }}</span>
        <span
          v-if="findCount(result) > 0"
          class="tool-result-findings"
        >
          {{ findCount(result) }} {{ t("tool.个发现") }}
        </span>
        <span class="tool-result-status" :class="`status-${result.status}`">
          {{ statusLabel(result.status) }}
        </span>
        <button
          v-if="result.status === 'running'"
          class="tool-result-stop"
          @click.stop="stop(result)"
        >
          {{ t("tool.中断") }}
        </button>
      </div>
      <div
        v-if="result.summary && result.summary !== 'summary error'"
        class="tool-result-summary"
      >
        <span class="tool-result-tag">[ {{ t("tool.结果摘要") }} ]</span>
        <span>{{ result.summary }}</span>
      </div>
      <div class="tool-result-command-line">
        <span class="tool-result-tag">[ {{ t("tool.命令") }} ]</span>
        <span class="tool-result-command-text">{{ toolCommand(result) }}</span>
      </div>
      <div v-if="explanation(result)" class="tool-result-summary">
        <span class="tool-result-tag">[ {{ t("tool.解释") }} ]</span>
        <span>{{ explanation(result) }}</span>
      </div>
      <div v-if="!expanded.has(result.id)" class="tool-result-output">
        <div class="tool-result-output-header">
          <span class="tool-result-tag">{{ t("tool.输出") }}</span>
          <button class="tool-result-fold" @click="toggle(result.id)">
            {{ t("tool.输出") }}
          </button>
        </div>
      </div>
      <div v-else class="tool-result-output">
        <div class="tool-result-output-header">
          <span class="tool-result-tag">{{ t("tool.执行命令") }}</span>
        </div>
        <pre class="tool-result-command">{{ toolCommand(result) }}</pre>
        <div class="tool-result-output-header">
          <span class="tool-result-tag">{{ t("tool.输出") }}</span>
          <button class="tool-result-fold" @click="toggle(result.id)">
            {{ t("tool.输出") }}
          </button>
        </div>
        <pre class="tool-result-command">{{ output(result) }}</pre>
      </div>
      <div class="tool-result-time">
        {{ formatTime(result.start_time) }}
        <span v-if="duration(result)"> · {{ duration(result) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-results-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 10px;
  overflow-y: auto;
}

.tool-results-empty {
  width: 100%;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  color: var(--muted);
}

.tool-result-item {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-result-name {
  font-weight: 700;
  flex: 1;
}

.tool-result-status {
  font-size: 0.75rem;
  padding: 1px 6px;
  border-radius: 5px;
  border: 1px solid var(--border);
}

.tool-result-status.status-success {
  color: var(--success);
  border-color: var(--success);
}

.tool-result-status.status-failed {
  color: var(--danger);
  border-color: var(--danger);
}

.tool-result-status.status-running {
  color: var(--accent);
  border-color: var(--accent);
}

.tool-result-label {
  font-size: 0.72rem;
  color: var(--muted);
  margin-top: 3px;
}

.tool-result-summary {
  font-size: 0.78rem;
  word-break: break-word;
}

.tool-result-findings {
  font-size: 0.75rem;
  color: var(--warning);
}

.tool-result-command {
  margin: 0;
  font-size: 0.75rem;
  font-family: "Courier New", monospace;
  color: var(--muted);
  white-space: pre-wrap;
  word-break: break-all;
}

.tool-result-time {
  font-size: 0.75rem;
  color: var(--muted);
}
</style>
