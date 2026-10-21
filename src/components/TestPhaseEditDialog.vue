<script setup>
/**
 * The phase editor.
 *
 * The reference opens this to rename a phase of the test tree.
 */
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";

const { t } = useI18n();
const dialogStore = useDialogStore();
const props = defineProps({ group: { type: Object, default: null } });
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close", "saved"]);

const name = ref("");

watch(
  () => props.group,
  (group) => {
    name.value = group?.phase_name || group?.title || "";
  },
  { immediate: true }
);

function save() {
  if (!name.value.trim()) return;
  emit("saved", { ...props.group, phase_name: name.value.trim() });
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <span class="title">{{ t("test-list.编辑测试任务") }}</span>
        </div>

        <label class="field">
          <span class="field-label">{{ t("test-list.任务标题") }}</span>
          <input v-model="name" class="field-input" :placeholder="t('test-list.任务标题示例')" />
        </label>

        <div class="button-container">
          <button class="button" @click="emit('close')">
            {{ t("test-list.取消") }}
          </button>
          <button class="button button-primary" @click="save">
            {{ t("test-list.保存测试任务") }}
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

.button-primary {
  background-color: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
</style>
