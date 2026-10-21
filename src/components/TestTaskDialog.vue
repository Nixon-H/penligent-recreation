<script setup>
/**
 * Add or edit a test task.
 *
 * The reference's dialog carries a title, a description and a target, and it
 * refuses to save an incomplete entry.
 */
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";
import { CircleX, Save, Trash2 } from "lucide-vue-next";

const { t } = useI18n();
const dialogStore = useDialogStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close", "saved", "delete"]);

const props = defineProps({
  task: { type: Object, default: null },
  mode: { type: String, default: "create" }
});

const title = ref("");
const description = ref("");
const target = ref("");
const error = ref("");

watch(
  () => props.task,
  (task) => {
    title.value = task?.title || "";
    description.value = task?.description || "";
    target.value = task?.target || "";
    error.value = "";
  },
  { immediate: true }
);

function save() {
  if (!title.value.trim() || !description.value.trim() || !target.value.trim()) {
    error.value = t("test-list.请填写完整信息");
    return;
  }
  emit("saved", {
    ...(props.task || {}),
    title: title.value.trim(),
    description: description.value.trim(),
    target: target.value.trim()
  });
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title">
            <span>
              {{ mode === "edit" ? t("taskset.修改任务") : t("test-list.添加测试任务") }}
            </span>
          </div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <div class="input-container">
          <div class="input-label">
            {{ t("test-list.任务标题") }}
            <span class="input-label-required">required</span>
          </div>
          <div class="input-field">
            <input
              v-model="title"
              class="input-field-input"
              type="text"
              :placeholder="t('test-list.任务标题示例')"
            />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">
            {{ t("test-list.任务描述") }}
            <span class="input-label-required">required</span>
          </div>
          <div class="input-field">
            <textarea
              v-model="description"
              class="input-field-input"
              rows="3"
              :placeholder="t('test-list.任务描述示例')"
            />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">
            {{ t("test-list.任务目标") }}
            <span class="input-label-required">required</span>
          </div>
          <div class="input-field">
            <input
              v-model="target"
              class="input-field-input"
              type="text"
              :placeholder="t('test-list.任务目标示例')"
            />
          </div>
        </div>

        <div v-if="error" class="error-line">{{ error }}</div>

        <div class="button-container">
          <button
            v-if="mode === 'edit'"
            class="button button-danger"
            @click="emit('delete')"
          >
            <Trash2 :size="13" />
            <span>{{ t("test-list.删除测试任务") }}</span>
          </button>
          <button class="button button-cancel" @click="emit('close')">
            {{ t("taskset.取消") }}
            <span class="save-hint">{{ t("test-list.取消") }}</span>
          </button>
          <button class="button button-primary" @click="save">
            <Save :size="13" />
            <span>
              {{
                mode === "edit"
                  ? t("taskset.提交修改")
                  : t("test-list.添加测试任务")
              }}
              <span v-if="mode === 'edit'" class="save-hint">
                {{ t("test-list.保存测试任务") }}
              </span>
            </span>
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
  width: min(520px, 92vw);
  max-height: calc(100vh - 60px);
  overflow-y: auto;
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

.input-field-input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  font-family: inherit;
  font-size: 0.85rem;
}

.input-field-input:focus {
  outline: none;
}

.error-line {
  font-size: 0.8rem;
  color: var(--danger);
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

.button-danger {
  margin-right: auto;
  color: var(--danger);
}

.button-primary {
  background-color: var(--button-bg);
}
</style>
