<script setup>
/**
 * The model picker.
 *
 * The reference opens this from the chat's model chip, and lists the models
 * the Penligent service publishes. The selection is kept in the shared
 * store under `llmListChoosed`, so every window agrees on it.
 */
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";
import { useAiStore } from "@/stores/ai";

const { t } = useI18n();
const dialogStore = useDialogStore();
const aiStore = useAiStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close"]);

const models = ref([]);
const selected = ref("");

onMounted(async () => {
  models.value = await aiStore.fetchPenligentModels();
  selected.value = aiStore.selectedModel || models.value[0] || "";
});

async function choose(model) {
  selected.value = model;
  aiStore.setSelectedModel(model);
  emit("close");
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <span class="title">{{ t("chat.开始任务") }}</span>
        </div>

        <div class="model-list">
          <div
            v-for="model in models"
            :key="model"
            class="model-item"
            :class="{ selected: model === selected }"
            @click="choose(model)"
          >
            {{ model }}
          </div>
          <div v-if="!models.length" class="model-empty">
            {{ t("notice.提示") }}
          </div>
        </div>

        <div class="button-container">
          <button class="button" @click="emit('close')">
            {{ t("test-list.取消") }}
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
  max-height: calc(100vh - 60px);
  overflow-y: auto;
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

.model-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.model-item {
  padding: 8px 10px;
  border-radius: 5px;
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 0.86rem;
}

.model-item.selected {
  border-color: var(--accent);
  color: var(--accent);
}

.model-empty {
  font-size: 0.84rem;
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
</style>
