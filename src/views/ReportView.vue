<script setup>
/**
 * Report view.
 *
 * The reference asks Penligent's service to render the report and stores the
 * markdown in `report_exports`; the same inputs (`risk_list`,
 * `current_target_info`, `test_list`) are assembled client-side, so the
 * reconstruction renders the report locally and stores it through exactly the
 * same call the reference makes.
 *
 * The report list, the export status handling and the download action mirror
 * the reference's behaviour:
 *   - a report is created in the "processing" state and then completed;
 *   - failed reports are filtered out of the list;
 *   - a completed report can be downloaded as a markdown file.
 */
import { ref, computed, onMounted } from "vue";
import { FileText, Download, Loader2, RefreshCw } from "lucide-vue-next";
import { useProjectStore } from "@/stores/project";
import { useNoticeStore } from "@/stores/notice";
import { useI18n } from "vue-i18n";

const projectStore = useProjectStore();
const noticeStore = useNoticeStore();
const { t } = useI18n();

const reports = ref([]);
const generating = ref(false);
const selected = ref(null);

async function load() {
  const project = projectStore.currentProject;
  if (!project) {
    reports.value = [];
    return;
  }
  const all = (await window.dbAPI.getReportExports(project.id)) || [];
  reports.value = all.filter((row) => row.export_status !== "failed");
  selected.value = reports.value[0] || null;
}

async function generate() {
  if (generating.value) return;
  const project = projectStore.currentProject;
  if (!project) {
    noticeStore.addNotice({
      title: t("notice.目标信息"),
      content: t("notice.请先创建任务"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  generating.value = true;
  try {
    const result = await window.dbAPI.generateReport({
      projectId: project.id,
      language: "en"
    });
    if (result?.success) {
      noticeStore.addNotice({
        title: t("report.报告生成成功"),
        content: t("report.报告生成成功，请在报告列表中查看"),
        type: "success",
        duration: 5000
      });
      await load();
    } else {
      noticeStore.addNotice({
        title: t("report.报告生成失败"),
        content: t("report.报告生成失败，错误信息：") + (result?.error || ""),
        type: "error",
        duration: 5000
      });
    }
  } finally {
    generating.value = false;
  }
}

async function download() {
  if (!selected.value) {
    noticeStore.addNotice({
      title: t("report.报告内容为空"),
      content: t("report.请先生成报告"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  const project = projectStore.currentProject;
  const name = `${(project?.project_name || "penligent-report").replace(/[^\w.-]+/g, "_")}.md`;
  const result = await window.fileAPI.showSaveDialog({
    title: t("reportdownload.下载报告"),
    defaultPath: name,
    filters: [{ name: "Markdown", extensions: ["md"] }]
  });
  if (!result?.canceled && result?.filePath) {
    try {
      await window.fileAPI.writeFile(result.filePath, selected.value.report_content || "");
      await window.dbAPI.updateReportExportFilePath(selected.value.id, result.filePath);
      noticeStore.addNotice({
        title: t("report.Markdown报告保存成功"),
        content: t("report.Markdown报告保存成功，") + result.filePath,
        type: "success",
        duration: 5000
      });
    } catch (error) {
      noticeStore.addNotice({
        title: t("report.Markdown报告保存失败"),
        content: t("report.Markdown报告保存失败，") + (error.message || ""),
        type: "error",
        duration: 5000
      });
    }
  }
}

const markdown = computed(() => selected.value?.report_content || "");

onMounted(load);
</script>

<template>
  <div class="report-container">
    <div class="report-standard">{{ t("report.报告规范") }}</div>
    <div class="report-toolbar">
      <button class="toolbar-button" :disabled="generating" @click="generate">
        <span class="toolbar-label">{{ t("report.生成新报告") }}</span>
        <Loader2 v-if="generating" class="spin" :size="13" />
        <FileText v-else :size="13" />
        <span>{{ generating ? "Generating..." : "Generate report" }}</span>
      </button>
      <button class="toolbar-button" @click="download">
        <Download :size="13" />
        <span>Download</span>
      </button>
      <button class="toolbar-button" @click="load">
        <RefreshCw :size="13" />
        <span>Refresh</span>
      </button>

      <select v-if="reports.length" v-model="selected" class="report-select">
        <option v-for="row in reports" :key="row.id" :value="row">
          #{{ row.id }} — {{ row.export_status }} — {{ row.export_format }}
        </option>
      </select>
    </div>

    <div v-if="!reports.length" class="report-empty">
      No reports yet. Generate one for the current project.
    </div>
    <pre v-else class="report-content">{{ markdown }}</pre>
  </div>
</template>

<style scoped>
.report-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

.report-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.8rem;
}

.toolbar-button:hover {
  background-color: var(--button-hover);
}

.toolbar-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.report-select {
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: var(--background);
  color: var(--foreground);
  font-size: 0.8rem;
}

.report-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  font-family: "Courier New", monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  background-color: var(--frontground);
}

.report-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 0.9rem;
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
