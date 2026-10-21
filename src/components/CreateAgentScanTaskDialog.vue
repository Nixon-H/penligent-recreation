<script setup>
/**
 * The agent scan task dialog.
 *
 * The reference creates an OpenClaw security scan as its own task: a name,
 * the path to scan and a remark. The path is optional — the scan then runs
 * over the whole machine.
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";
import { useNoticeStore } from "@/stores/notice";
import { useProjectStore } from "@/stores/project";

const { t } = useI18n();
const dialogStore = useDialogStore();
const noticeStore = useNoticeStore();
const projectStore = useProjectStore();

const emit = defineEmits(["close"]);

const name = ref("");
const path = ref("");
const remark = ref("");
const creating = ref(false);

async function create() {
  if (creating.value) return;
  if (!name.value.trim()) {
    noticeStore.addNotice({
      title: t("notice.错误"),
      content: t("notice.请填写完整信息"),
      type: "error",
      duration: 5000
    });
    return;
  }
  creating.value = true;
  try {
    await projectStore.createProject({
      name: name.value.trim(),
      description: remark.value.trim(),
      target: path.value.trim(),
      testType: "AgentScan",
      taskMode: "Agent"
    });
    noticeStore.addNotice({
      title: t("notice.成功"),
      content: name.value.trim(),
      type: "success",
      duration: 5000
    });
    dialogStore.closeDialog();
  } catch (error) {
    noticeStore.addNotice({
      title: t("notice.错误"),
      content: error.message,
      type: "error",
      duration: 5000
    });
  } finally {
    creating.value = false;
  }
}

/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <span class="title">创建 Agent 安全扫描 任务</span>
        </div>

        <label class="field">
          <span class="field-label">项目名称</span>
          <input v-model="name" class="field-input" type="text" />
        </label>

        <div class="field">
          <span class="field-label">OpenClaw 安全扫描</span>
        </div>

        <label class="field">
          <span class="field-label">目标路径</span>
          <input v-model="path" class="field-input" type="text" />
        </label>

        <label class="field">
          <span class="field-label">扫描路径 <span class="optional">( 可选 )</span></span>
          <input v-model="remark" class="field-input" type="text" />
        </label>

        <label class="field">
          <span class="field-label">备注信息</span>
          <textarea
            v-model="remark"
            class="field-input field-textarea"
            rows="3"
            :placeholder="t('taskcreate.输入任务相关的说明信息（可选）')"
          />
        </label>

        <div class="note">
          {{ t("test-list-generate.大约需要1-2分钟请耐心等待") }}
        </div>

        <div class="button-container">
          <button class="button" @click="emit('close')">暂不创建</button>
          <button
            class="button button-primary"
            :disabled="creating"
            @click="create"
          >
            {{ t("taskcreate.创建测试") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-container {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.container {
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
  width: min(500px, 92vw);
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

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: 1.05rem;
  font-weight: 700;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 0.82rem;
  color: var(--muted);
}

.optional {
  opacity: 0.7;
}

.field-input {
  padding: 7px 9px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background-color: var(--background);
  color: var(--foreground);
  font-size: 0.88rem;
  font-family: inherit;
}

.field-textarea {
  resize: vertical;
}

.note {
  font-size: 0.78rem;
  color: var(--muted);
}

.button-container {
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

.button:disabled {
  opacity: 0.5;
  cursor: default;
}

.button-primary {
  background-color: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
</style>
