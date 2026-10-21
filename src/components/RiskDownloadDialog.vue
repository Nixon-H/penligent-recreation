<script setup>
/**
 * Export a risk.
 *
 * The reference exports the finding the dialog was opened for as a Markdown
 * document: its name, severity, CVSS, target, verification and ignore
 * states, the description, the recommendation, the evidence list and the
 * tools that produced it.
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { CircleX, Download } from "lucide-vue-next";
import { useNoticeStore } from "@/stores/notice";
import { useDialogStore } from "@/stores/dialog";
import { useProjectStore } from "@/stores/project";

const { t } = useI18n();
const noticeStore = useNoticeStore();
const dialogStore = useDialogStore();
const projectStore = useProjectStore();

const name = ref("");
const location = ref("");

/** The finding the dialog was opened for. */
function activeRisk() {
  return dialogStore.activeRiskItem;
}

function browse() {
  const result = window.fileAPI?.showSaveDialog?.({
    title: t("risk-download.导出位置"),
    defaultPath: `${fileName()}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }]
  });
  if (result && !result.canceled && result.filePath) location.value = result.filePath;
}

function fileName() {
  const risk = activeRisk();
  const base = risk?.title || risk?.name || "risk";
  return String(base).replace(/[./:]/g, "_");
}

function safeParse(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/** The Markdown document the reference writes. */
function markdown() {
  const risk = activeRisk();
  if (!risk) return "";
  const lines = [
    `# ${risk.title || ""}`,
    "",
    `- Severity: ${risk.severity || ""}`,
    `- CVSS: ${risk.cvss_score ?? ""}`,
    `- Target: ${risk.affected_target || ""}`,
    `- Verify Status: ${risk.verify_status || "open"}`,
    `- Ignored Status: ${risk.status || "open"}`,
    "",
    "## Description",
    "",
    risk.description || "",
    "",
    "## Recommendation",
    "",
    risk.recommendation || "",
    "",
    "## Evidence List",
    ""
  ];
  const evidence = safeParse(risk.evidence);
  evidence.forEach((item, index) => {
    lines.push(
      `### Evidence ${index + 1}: ${item.title || ""}`,
      "",
      item.description || "",
      "",
      item.evidence || "",
      ""
    );
  });
  lines.push("## Tools List", "");
  const tools = safeParse(risk.tool_meta_data);
  tools.forEach((tool, index) => {
    lines.push(
      `### Tool ${index + 1}: ${tool.tool_name || ""}`,
      "",
      tool.explanation || "",
      "",
      tool.summary || "",
      "",
      `**Command**`,
      "",
      "```",
      tool.command_command || "",
      "```",
      "",
      `**Result**`,
      "",
      "```",
      tool.result_data || "",
      "```",
      ""
    );
  });
  return lines.join("\n");
}

async function exportRisks() {
  const risk = activeRisk();
  if (!risk) {
    noticeStore.addNotice({
      title: t("notice.错误"),
      content: t("notice.请填写完整信息"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  if (!name.value.trim()) {
    noticeStore.addNotice({
      title: t("risk-download.导出风险信息"),
      content: t("notice.请填写完整信息"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  if (!location.value) {
    browse();
    if (!location.value) return;
  }
  try {
    await window.fileAPI.writeFile(location.value, markdown());
    noticeStore.addNotice({
      title: t("notice.成功"),
      content: location.value,
      type: "success",
      duration: 5000
    });
    dialogStore.closeDialog();
  } catch (error) {
    noticeStore.addNotice({
      title: t("notice.错误"),
      content: error.message || "",
      type: "error",
      duration: 5000
    });
  }
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title"><span>{{ t("risk-download.导出风险信息") }}</span></div>
          <CircleX class="close-button" :size="20" @click="dialogStore.closeDialog()" />
        </div>

        <div class="input-container">
          <div class="input-label">
            {{ t("risk-download.风险名称") }}
            <span class="input-label-required">required</span>
          </div>
          <div class="input-field">
            <input v-model="name" class="input-field-input" type="text" />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("risk-download.导出位置") }}</div>
          <div class="input-field">
            <input v-model="location" class="input-field-input" type="text" />
            <button class="browse-button" @click="browse">
              <Download :size="13" />
            </button>
          </div>
        </div>

        <div class="button-container">
          <button class="button button-cancel" @click="dialogStore.closeDialog()">
            {{ t("risk-download.取消") }}
          </button>
          <button class="button button-primary" @click="exportRisks">
            <Download :size="13" />
            <span>{{ t("risk-download.导出位置") }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-container {
  position: absolute;
  z-index: 3;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.container {
  position: absolute;
  z-index: 3;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #00000080;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 30px;
  box-sizing: border-box;
}

.content {
  width: min(440px, 92vw);
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.header .title {
  font-size: 1.05rem;
  font-weight: 700;
}

.close-button {
  cursor: pointer;
}

.input-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-label {
  font-size: 0.9rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 5px;
}

.input-label-required {
  color: var(--danger);
  font-size: 0.75rem;
}

.input-field {
  display: flex;
  gap: 6px;
}

.input-field-input {
  flex: 1;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  font-family: inherit;
  font-size: 0.85rem;
}

.browse-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
}

.button-container {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.85rem;
}

.button-primary {
  background-color: var(--button-bg);
}
</style>
