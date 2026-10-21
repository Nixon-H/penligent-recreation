<script setup>
/**
 * Projects list.
 *
 * Reads the `projects` table through the main process. The reference renders
 * each project as a `.task-item` card (title / description / timestamp) inside
 * `.task-container > .task-list`; the empty state is simply an empty list.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Trash2, SquarePen } from "lucide-vue-next";
import { useProjectStore } from "@/stores/project";
import { useNoticeStore } from "@/stores/notice";
import { useDialogStore } from "@/stores/dialog";

const { t } = useI18n();
const projectStore = useProjectStore();
const noticeStore = useNoticeStore();
const dialogStore = useDialogStore();

const projects = computed(() => projectStore.projects);
/** The project whose hover popup is showing, as the reference does. */
const hovered = ref(null);

/**
 * Delete a project.
 *
 * The reference keeps at least one project and says so when the delete is
 * refused.
 */
async function remove(project) {
  if (projectStore.projects.length <= 1) {
    noticeStore.addNotice({
      title: t("notice.无法删除"),
      content: t("notice.至少保留一个任务"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  await projectStore.deleteProject(project.id);
  noticeStore.addNotice({
    title: t("notice.成功"),
    content: project.project_name,
    type: "success",
    duration: 5000
  });
}

/** The reference's task-set dialog, reached from the row's edit button. */
function edit(project) {
  dialogStore.openDialog("task-set", { payload: { project: { ...project } } });
}

function formatTime(seconds) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleString();
}
</script>

<template>
  <div class="task-container">
    <div class="task-list">
      <div
        v-for="project in projects"
        :key="project.id"
        class="task-item"
        :class="{ 'task-item-active': projectStore.currentProject?.id === project.id }"
        @click="projectStore.selectProject(project)"
        @mouseenter="hovered = project.id"
        @mouseleave="hovered = null"
      >
        <div class="task-item-title">{{ project.project_name }}</div>
        <div v-if="project.project_target" class="task-item-target">
          {{ t("task.目标") }}：{{ project.project_target }}
        </div>
        <div class="task-item-time">{{ formatTime(project.updated_at) }}</div>
        <div v-if="hovered === project.id" class="task-item-popup">
          <div v-if="project.project_description" class="task-item-description-container">
            <pre class="task-item-description">
              {{ t("task.备注") }}：{{ project.project_description }}
            </pre>
          </div>
          <div class="task-item-set-buttons">
            <button
              class="task-item-set-button"
              :title="t('taskset.修改任务')"
              @click.stop="edit(project)"
            >
              <SquarePen :size="16" />
            </button>
            <button
              class="task-item-set-button"
              :title="t('notice.无法删除')"
              @click.stop="remove(project)"
            >
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-item {
  position: relative;
}

.task-item-target {
  font-size: 0.75rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-item-popup {
  position: absolute;
  z-index: 5;
  top: 100%;
  left: 0;
  right: 0;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: var(--background);
  box-shadow: 0 4px 12px #0003;
}

.task-item-description-container {
  margin-bottom: 5px;
}

.task-item-description {
  margin: 0;
  font-family: inherit;
  font-size: 0.75rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.task-item-set-buttons {
  display: flex;
  gap: 6px;
}

.task-item-set-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: none;
  color: var(--muted);
  cursor: pointer;
}

.task-item-set-button:hover {
  color: var(--foreground);
}

.create-task-button {
  width: calc(100% - 22px);
  margin: 0 11px 6px;
  padding: 6px 10px;
  border: 1px dashed var(--border);
  border-radius: 5px;
  cursor: pointer;
  text-align: center;
  font-size: 0.85rem;
  color: var(--muted);
}

.create-task-button:hover {
  border-color: var(--button-bg);
  color: var(--foreground);
}

.task-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: calc(100% - 10px);
}

.task-container .task-list {
  width: 100%;
  height: 100%;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-container .task-list .task-item {
  width: calc(100% - 22px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  border-radius: 5px;
  padding: 5px 10px;
}

.task-container .task-list .task-item:hover {
  background-color: var(--nav-active-bg-project);
  border: 1px solid var(--nav-active-border);
}

.task-container .task-list .task-item .task-item-title {
  width: 100%;
  overflow: hidden;
  font-size: 1.2rem;
  font-weight: 700;
}

.task-container .task-list .task-item .task-item-description-container {
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-container .task-list .task-item .task-item-description-container .task-item-description {
  max-height: 100px;
  font-size: 0.8rem;
  color: var(--muted);
  overflow-y: auto;
}

.task-container .task-list .task-item .task-item-time {
  font-size: 0.8rem;
  width: 100%;
  color: var(--muted);
}

.task-container .task-list .task-item-active {
  background-color: var(--nav-active-bg-project);
  border: 1px solid var(--nav-active-border);
}
</style>
