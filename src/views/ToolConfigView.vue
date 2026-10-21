<script setup>
/**
 * Tool configuration.
 *
 * The reference lists the project's tool sets — the name, the type (a command
 * or an API), the path and the command — and offers a delete button on the
 * row that is hovered. Below the list it shows the four tool-compatibility
 * notes from the onboarding.
 */
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { SquarePlus, Trash2 } from "lucide-vue-next";
import { useProjectStore } from "@/stores/project";
import { useDialogStore } from "@/stores/dialog";
import { useNoticeStore } from "@/stores/notice";

const { t } = useI18n();
const projectStore = useProjectStore();
const dialogStore = useDialogStore();
const noticeStore = useNoticeStore();

const hovered = ref(null);

const NOTES = [
  "onboarding.工具兼容内容1",
  "onboarding.工具兼容内容2",
  "onboarding.工具兼容内容3",
  "onboarding.工具兼容内容4"
];

const toolSets = computed(() => projectStore.toolSets || []);

async function load() {
  await projectStore.selectProject(projectStore.currentProject);
}

async function remove(toolSet) {
  await window.dbAPI.deleteSets(toolSet.id);
  noticeStore.addNotice({
    title: t("notice.成功"),
    content: toolSet.set_name,
    type: "success",
    duration: 5000
  });
  await load();
}

onMounted(load);
</script>

<template>
  <div class="tool-set-container">
    <div class="tool-set-container-header">
      <div
        class="tool-set-add-button-container"
        @click="dialogStore.openDialog('tool-set-add')"
      >
        <SquarePlus class="tool-set-add-button" :size="16" />
        <span>{{ t("toolset.添加新工具") }}</span>
      </div>

      <div
        v-for="toolSet in toolSets"
        :key="toolSet.id"
        class="tool-item"
        @mouseenter="hovered = toolSet.id"
        @mouseleave="hovered = null"
      >
        <div class="tool-item-name">{{ toolSet.set_name }}</div>
        <div
          class="tool-item-type"
          :class="{
            'tool-item-type-command': toolSet.tool_type === 'command',
            'tool-item-type-api': toolSet.tool_type === 'api'
          }"
        >
          {{ toolSet.tool_type }}
        </div>
        <div class="tool-item-command-path">{{ toolSet.command_path }}</div>
        <div class="tool-item-command-command">{{ toolSet.command_command }}</div>
        <div class="tool-item-api-config">{{ toolSet.api_config }}</div>
        <div v-if="hovered === toolSet.id" class="tool-item-delete-button-container">
          <button class="tool-item-delete-button" @click.stop="remove(toolSet)">
            <Trash2 :size="16" />
          </button>
        </div>
      </div>
    </div>

    <div class="tool-description-container">
      <div v-for="note in NOTES" :key="note" class="tool-description-item">
        <div class="tool-description-item-content">{{ t(note) }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-set-container {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tool-set-container .tool-item {
  width: calc(100% - 22px);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  gap: 5px;
  cursor: pointer;
}

.tool-set-container .tool-item:hover {
  background-color: var(--nav-active-bg-project);
  border: 1px solid var(--nav-active-border);
}

.tool-set-container .tool-item .tool-item-name {
  font-size: 1.1rem;
  font-weight: 700;
}

.tool-set-container .tool-item .tool-item-type {
  border: 1px solid var(--border);
  font-size: 0.8rem;
  padding: 1px 5px;
  border-radius: 5px;
}

.tool-set-container .tool-item .tool-item-type-command {
  border: 1px solid var(--success);
  color: var(--success);
}

.tool-set-container .tool-item .tool-item-type-api {
  border: 1px solid var(--accent);
  color: var(--accent);
}

.tool-set-container .tool-item .tool-item-command-path,
.tool-set-container .tool-item .tool-item-command-command,
.tool-set-container .tool-item .tool-item-api-config {
  width: 100%;
  padding: 2px 5px;
  font-size: 0.9rem;
}

.tool-set-container .tool-item .tool-item-delete-button-container {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.tool-set-container .tool-item .tool-item-delete-button {
  cursor: pointer;
  color: var(--danger);
}

.tool-set-container .tool-item .tool-item-delete-button:hover {
  opacity: 0.8;
}

.tool-set-container .tool-set-container-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  flex: 1 1 auto;
}

.tool-set-container .tool-set-add-button-container {
  width: calc(100% - 22px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
  gap: 5px;
}

.tool-set-container .tool-set-add-button-container:hover {
  background-color: var(--button-hover);
}

.tool-set-container .tool-description-container {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border: 1px solid var(--border);
  border-radius: 5px;
  justify-content: flex-start;
  padding: 10px;
  background-color: var(--nav-active-bg-project);
}

.tool-set-container .tool-description-container .tool-description-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.tool-set-container .tool-description-container .tool-description-item .tool-description-item-content {
  font-size: 0.8rem;
  color: var(--muted);
}
</style>
