<script setup>
/**
 * The test-plan generation dialog.
 *
 * The reference opens this from the task tree, asks for the test type, and
 * then streams the progress into a `<pre>` while the plan is generated. The
 * type is part of the request, the log carries the reference's own lines, and
 * the two error codes that mean "no credits" open the matching notice.
 */
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { ListChecks } from "lucide-vue-next";
import { useDialogStore } from "@/stores/dialog";
import { useNoticeStore } from "@/stores/notice";
import { useProjectStore } from "@/stores/project";
import { useAiStore } from "@/stores/ai";
import { generateTestPlan } from "@/agent/planGeneration";

const { t } = useI18n();
const dialogStore = useDialogStore();
const noticeStore = useNoticeStore();
const projectStore = useProjectStore();
const aiStore = useAiStore();

/** The test types the reference offers. */
const TEST_TYPES = [
  "GENERIC",
  "Recon",
  "Vuln",
  "Auth",
  "API",
  "Logic",
  "CVE",
  "Infra",
  "AgentScan"
];

const testType = ref(dialogStore.testType || "");
const log = ref("");
const generating = ref(false);
const typeOpen = ref(false);

const typeLabel = computed(() =>
  testType.value ? t(`taskcreate.${testType.value}`) : t("taskcreate.请选择测试类型")
);

function choose(type) {
  testType.value = type;
  dialogStore.testType = type;
  typeOpen.value = false;
}

async function start() {
  if (!testType.value) {
    noticeStore.addNotice({
      title: t("notice.测试类型"),
      content: t("notice.请选择测试类型"),
      type: "error",
      duration: 5000
    });
    return;
  }
  const project = projectStore.currentProject;
  if (!project) {
    noticeStore.addNotice({
      title: t("notice.错误"),
      content: t("notice.请先创建任务"),
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

  generating.value = true;
  log.value += t("test-list-generate.开始生成测试计划清单") + "\n";
  log.value += t(`taskcreate.${testType.value}`) + "\n";
  try {
    await generateTestPlan(project, testType.value);
    log.value += t("test-list-generate.测试计划清单生成成功") + "\n";
    await projectStore.selectProject(project);
    dialogStore.closeDialog();
  } catch (error) {
    if (error?.code === 80001) {
      noticeStore.addNotice({
        title: t("notice.SSE ERROR"),
        content: t("notice.当前免费积分已用完，请前往订阅页面"),
        type: "error",
        duration: 5000
      });
      dialogStore.openDialog("not-subscribed");
    } else if (error?.code === 80002) {
      noticeStore.addNotice({
        title: t("notice.SSE ERROR"),
        content: t("notice.当前积分不足，请充值"),
        type: "error",
        duration: 5000
      });
      dialogStore.openDialog("not-limit");
    }
    log.value += t("test-list-generate.生成失败") + "\n";
  } finally {
    generating.value = false;
  }
}

function cancel() {
  if (generating.value) return;
  dialogStore.closeDialog();
}
</script>

<template>
  <div class="container-test-list-add" @click.stop>
    <div class="panel">
      <div class="panel-header">
        <div class="panel-header-icon">
          <ListChecks :size="16" />
          <span>{{ t("test-list-generate.生成当前项目的任务清单") }}</span>
        </div>
      </div>

      <div v-if="!generating" class="type-select" :class="{ 'input-selected-none': !testType }">
        <div class="type-select-value" @click="typeOpen = !typeOpen">
          <span v-if="testType" class="type-select-text">{{ typeLabel }}</span>
          <span v-else class="type-select-text type-select-placeholder">
            {{ t("taskcreate.请选择测试类型") }}
          </span>
        </div>
        <div v-if="typeOpen" class="type-select-options">
          <div
            v-for="type in TEST_TYPES"
            :key="type"
            class="type-select-option"
            @click="choose(type)"
          >
            {{ t(`taskcreate.${type}`) }}
          </div>
        </div>
      </div>

      <div class="panel-note">
        {{ t("test-list-generate.大约需要1-2分钟请耐心等待") }}
      </div>
      <pre class="panel-log">{{ log }}</pre>

      <div class="panel-actions">
        <button v-if="!generating" class="button" @click="cancel">
          {{ t("test-list-generate.暂不生成") }}
        </button>
        <button v-if="!generating" class="button button-primary" @click="start">
          {{ t("test-list-generate.开始生成") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container-test-list-add {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background-color: #00000080;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px;
  box-sizing: border-box;
}

.panel {
  width: min(560px, 92vw);
  max-height: calc(100vh - 60px);
  overflow-y: auto;
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-header-icon {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 700;
}

.type-select {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
}

.input-selected-none {
  opacity: 0.7;
}

.type-select-value {
  font-size: 0.88rem;
}

.type-select-placeholder {
  color: var(--muted);
}

.type-select-options {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background-color: var(--background);
  max-height: 220px;
  overflow-y: auto;
  z-index: 2;
}

.type-select-option {
  padding: 8px 10px;
  font-size: 0.85rem;
  cursor: pointer;
}

.type-select-option:hover {
  background-color: var(--button-hover);
}

.panel-note {
  font-size: 0.8rem;
  color: var(--muted);
}

.panel-log {
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  background-color: var(--button-hover);
  font-size: 0.8rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 90px;
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.button {
  padding: 6px 12px;
  border-radius: 5px;
  border: 1px solid var(--border);
  cursor: pointer;
  color: var(--foreground);
  background: transparent;
  font-size: 0.85rem;
}

.button-primary {
  background-color: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
</style>
