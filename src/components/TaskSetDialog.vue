<script setup>
/**
 * The project editor.
 *
 * The reference opens this from a project's edit button: it changes the
 * name, the target and the description, and writes them back.
 */
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";
import { useNoticeStore } from "@/stores/notice";
import { useProjectStore } from "@/stores/project";

const { t } = useI18n();
const dialogStore = useDialogStore();
const noticeStore = useNoticeStore();
const projectStore = useProjectStore();

const props = defineProps({
  project: { type: Object, default: null }
});

/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const name = ref("");
const target = ref("");
const description = ref("");
const saving = ref(false);

const canSave = computed(
  () => Boolean(name.value.trim()) && Boolean(target.value.trim())
);

onMounted(() => {
  name.value = props.project?.project_name || "";
  target.value = props.project?.project_target || "";
  description.value = props.project?.project_description || "";
});

async function save() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  try {
    await projectStore.updateProject(props.project.id, {
      project_name: name.value.trim(),
      project_target: target.value.trim(),
      project_description: description.value.trim()
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
    saving.value = false;
  }
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <span class="title">{{ t("taskset.修改任务") }}</span>
        </div>

        <label class="field">
          <span class="field-label">{{ t("taskcreate.任务名称") }}</span>
          <input v-model="name" class="field-input" :placeholder="t('taskcreate.例如：公司官网安全测试')" />
        </label>

        <label class="field">
          <span class="field-label">{{ t("taskcreate.测试目标") }}</span>
          <input v-model="target" class="field-input" :placeholder="t('taskcreate.例如：text')" />
        </label>

        <label class="field">
          <span class="field-label">{{ t("taskcreate.任务备注") }}</span>
          <textarea v-model="description" class="field-input field-textarea" rows="3" />
        </label>

        <div class="button-container">
          <button class="button" @click="dialogStore.closeDialog()">
            {{ t("taskset.取消") }}
          </button>
          <button
            class="button button-primary"
            :disabled="!canSave || saving"
            @click="save"
          >
            {{ t("taskset.提交修改") }}
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
  width: min(480px, 92vw);
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
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
