<script setup>
/**
 * The phase deletion confirmation.
 *
 * The reference asks before a phase is removed, and refuses when the phase
 * is the one the analysis is focused on.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";

const { t } = useI18n();
const dialogStore = useDialogStore();
const props = defineProps({ group: { type: Object, default: null } });
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close", "deleted"]);

/** The focused phase cannot be removed. */
const isFocused = computed(() => Boolean(props.group?.focused));

function remove() {
  if (isFocused.value) return;
  emit("deleted", props.group);
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <span class="title">{{ t("test-list.全部删除") }}</span>
        </div>

        <p class="message">
          {{ isFocused ? t("notice.无法删除") : t("test-list.全部删除") }}
        </p>

        <div class="button-container">
          <button class="button" @click="emit('close')">
            {{ t("test-list.取消") }}
          </button>
          <button class="button button-danger" :disabled="isFocused" @click="remove">
            {{ t("test-list.全部删除") }}
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
  width: min(420px, 92vw);
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

.message {
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--foreground);
  margin: 0;
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

.button-danger {
  background-color: var(--danger);
  color: #fff;
  border-color: var(--danger);
}
</style>
