<script setup>
/**
 * Download a report.
 *
 * The reference's dialog takes the report's name, its format and where to
 * save it, and offers Markdown and PDF.
 */
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";
import { CircleX, Download } from "lucide-vue-next";
import { useNoticeStore } from "@/stores/notice";
import { useProjectStore } from "@/stores/project";

const { t } = useI18n();
const dialogStore = useDialogStore();
const noticeStore = useNoticeStore();
const projectStore = useProjectStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close"]);

const name = ref("");
const format = ref("md");
const location = ref("");

const FORMATS = [
  { key: "md", label: "Markdown", extension: "md" },
  { key: "pdf", label: "PDF", extension: "pdf" }
];

const extension = computed(
  () => FORMATS.find((item) => item.key === format.value)?.extension || "md"
);

/**
 * The directory the report is written into.
 *
 * The reference picks a directory, not a file: the report's name and its
 * format decide the file's name.
 */
function browse() {
  const result = window.fileAPI?.showOpenDialog?.({
    title: t("reportdownload.报告保存位置"),
    properties: ["openDirectory", "createDirectory"]
  });
  if (result && !result.canceled && result.filePaths?.length) {
    location.value = result.filePaths[0];
  }
}

async function download() {
  if (!name.value.trim()) {
    noticeStore.addNotice({
      title: t("report.报告名称不能为空"),
      content: t("report.请输入报告名称"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  if (!location.value) {
    browse();
    if (!location.value) return;
  }
  const reports = await window.dbAPI.getReportExports?.(projectStore.currentProject?.id) || [];
  const report = reports[0];
  if (!report) {
    noticeStore.addNotice({
      title: t("report.报告内容为空"),
      content: t("report.请先生成报告"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  try {
    // The directory was chosen, so the report's name and format decide the
    // file's name.
    const fileName = `${name.value.trim() || "penligent-report"}.${extension.value}`;
    await window.fileAPI.writeFile(
      `${location.value.replace(/[/\\]+$/, "")}/${fileName}`,
      report.report_content || ""
    );
    noticeStore.addNotice({
      title: format.value === "pdf" ? t("report.PDF报告保存成功") : t("report.Markdown报告保存成功"),
      content: (format.value === "pdf" ? t("report.PDF报告保存成功，") : t("report.Markdown报告保存成功，")) + location.value,
      type: "success",
      duration: 5000
    });
    emit("close");
  } catch (error) {
    noticeStore.addNotice({
      title: format.value === "pdf" ? t("report.PDF报告保存失败") : t("report.Markdown报告保存失败"),
      content: (format.value === "pdf" ? t("report.PDF报告保存失败，") : t("report.Markdown报告保存失败，")) + (error.message || ""),
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
          <div class="title">{{ t("reportdownload.下载报告") }}</div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <div class="input-container">
          <div class="input-label">
            {{ t("reportdownload.报告名称") }}
            <span class="input-label-required">required</span>
          </div>
          <div class="input-field">
            <input v-model="name" class="input-field-input" type="text" />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("reportdownload.报告格式") }}</div>
          <div class="input-field">
            <select v-model="format" class="input-field-input">
              <option v-for="item in FORMATS" :key="item.key" :value="item.key">
                {{ item.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("reportdownload.报告保存位置") }}</div>
          <div class="input-field">
            <input v-model="location" class="input-field-input" type="text" />
            <button class="browse-button" @click="browse">{{ t("reportdownload.下载") }}</button>
          </div>
        </div>

        <div class="button-container">
          <button class="button button-cancel" @click="emit('close')">
            {{ t("reportdownload.取消") }}
          </button>
          <button class="button button-primary" @click="download">
            <Download :size="13" />
            <span>{{ t("reportdownload.下载") }}</span>
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
  width: min(460px, 92vw);
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
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.8rem;
  white-space: nowrap;
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
