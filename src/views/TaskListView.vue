<script setup>
/**
 * Task list — the test plan of the current project.
 *
 * Reads the `test_lists` table. The reference stores the full plan as JSON in
 * `test_list`, the currently focused item in `focus_data` and its description
 * in `focus_description`.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  Check,
  Circle,
  CircleDot,
  Play,
  RotateCcw,
  Sparkles,
  Loader2,
  Radar,
  Bug
} from "lucide-vue-next";
import { useProjectStore } from "@/stores/project";
import { useAiStore } from "@/stores/ai";
import { useNoticeStore } from "@/stores/notice";
import { useDialogStore } from "@/stores/dialog";
import { useI18n } from "vue-i18n";

const projectStore = useProjectStore();
const aiStore = useAiStore();
const { t } = useI18n();
const noticeStore = useNoticeStore();
const dialogStore = useDialogStore();

const generating = ref(false);
const scanning = ref(false);
const crawling = ref(false);

const testList = computed(() => projectStore.currentTestList);

/**
 * The task tree.
 *
 * The reference stores it as a list of groups, each with a list of tasks:
 *
 *   [ { tasks: [ { id, title, description, target, status }, … ] } ]
 */
const planOf = computed(() => {
  const raw = testList.value?.test_list;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.items)) return parsed.items;
    return [];
  } catch {
    return [];
  }
});

/** The tree, as the reference stores it: groups containing tasks. */
const groups = computed(() => planOf.value);


const focusData = computed(() => {
  const raw = testList.value?.focus_data;
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
});

const focusId = computed(() => focusData.value?.id ?? null);

/**
 * The focused task's text.
 *
 * The reference compares the tasks with the focus on its `item`, which is
 * why its test and complete buttons are hidden for the focused task.
 */
const focusItem = computed(() => focusData.value?.item ?? null);

/**
 * Generate a test plan with the configured AI provider.
 *
 * The reference offers a "Test List Generate" flow that asks Penligent's
 * service for a task tree. Here the same plan is produced by the user's own
 * provider and persisted in the `test_lists` table exactly as the reference
 * stores it (JSON in `test_list`, the focused item in `focus_data`).
 */
/**
 * The focus description.
 *
 * The reference asks the service for it; here the provider is asked, and the
 * task's own description is the fallback.
 */


/** Tolerate prose or code fences around the JSON array. */

/**
 * Run the bundled vulnerability scanner (xray) against the project target.
 *
 * The reference invokes the same binary with the same argument shape; the
 * findings are written to the `scan_result` table by the main process.
 */
async function runScan() {
  if (scanning.value) return;
  const target = projectStore.currentTarget;
  if (!target) {
    noticeStore.warning("No Target", "Set a target for this project first.");
    return;
  }
  scanning.value = true;
  try {
    const result = await window.scannerAPI.runScanner(projectStore.currentProject.id, 0, target, {});
    if (result?.success) {
      noticeStore.info(
        "Scan Complete",
        `${result.count} finding${result.count === 1 ? "" : "s"} recorded.`
      );
    } else {
      noticeStore.error("Scan Failed", result?.error || "The scanner did not complete.");
    }
  } finally {
    scanning.value = false;
  }
}

/**
 * Crawl the project target with the bundled headless-browser crawler.
 * The discovered requests are written to the `crawler_result` table.
 */
async function runCrawl() {
  if (crawling.value) return;
  const target = projectStore.currentTarget;
  if (!target) {
    noticeStore.warning("No Target", "Set a target for this project first.");
    return;
  }
  crawling.value = true;
  try {
    const result = await window.crawlerAPI.runCrawler(
      projectStore.currentProject.id,
      [target],
      { maxRuntime: 60, maxCrawlCount: 100, logLevel: "error" }
    );
    if (result?.success) {
      noticeStore.info(
        "Crawl Complete",
        `${result.count} request${result.count === 1 ? "" : "s"} discovered.`
      );
    } else {
      noticeStore.error("Crawl Failed", result?.error || "The crawler did not complete.");
    }
  } finally {
    crawling.value = false;
  }
}

const showOnlyIncomplete = ref(false);
const addMenuOpen = ref(false);
/** The test type the plan is generated for. */
const testType = ref("GENERIC");
/** The group a new task is added to. */
const chosenGroup = ref(null);
/** Whether the "generate the task list" prompt has been dismissed. */
const skipped = ref(false);

/** Every task in the tree. */
const allTasks = computed(() => groups.value.flatMap((group) => group.tasks || []));

/** A task is complete when the reference says so. */
function isComplete(task) {
  return task.is_complete === true || task.is_complete === "true";
}

const doneCount = computed(() => allTasks.value.filter(isComplete).length);
const progressPercent = computed(() =>
  allTasks.value.length ? Math.round((doneCount.value / allTasks.value.length) * 100) : 0
);

/**
 * Add a task.
 *
 * The reference offers two entries here — a detection item and a custom test
 * task — and the dialog is rendered at the application root, so it is not
 * clipped by the centre panel.
 */
function openAddDialog(kind = "detection") {
  // A custom task goes into its own group, as the reference does.
  let group = groups.value[0];
  if (kind === "custom") {
    group =
      groups.value.find((entry) => entry.type === "custom") ||
      { id: `custom-${Date.now()}`, type: "custom", title: t("test-list.添加自定义测试任务"), tasks: [] };
    if (!groups.value.includes(group)) groups.value.push(group);
  }
  chosenGroup.value = group;
  dialogStore.openDialog("test-task-add", {
    payload: {
      mode: "create",
      kind,
      task: { title: "", description: "", target: projectStore.currentTarget || "" }
    }
  });
}

function openEditDialog(item) {
  dialogStore.openDialog("test-task-add", {
    payload: { mode: "edit", kind: "detection", task: { ...item } }
  });
}

async function onTaskSaved(event) {
  await saveTask(event.detail);
}

async function onTaskDeleted(event) {
  await deleteTask(event.detail);
}

async function saveTask(task) {
  const plan = planOf.value;
  const group = chosenGroup.value || plan.find((entry) => Array.isArray(entry.tasks));
  if (!group) return;
  if (task.id) {
    const existing = group.tasks.find((entry) => entry.id === task.id);
    if (existing) Object.assign(existing, task);
  } else {
    group.tasks.push({
      ...task,
      id: Date.now(),
      status: "todo",
      is_complete: false
    });
  }
  await persistPlan();
}

async function deleteTask(task) {
  const plan = planOf.value;
  const group = plan.find((entry) =>
    Array.isArray(entry.tasks) && entry.tasks.some((entryTask) => entryTask.id === task?.id)
  );
  if (group && task?.id) {
    group.tasks = group.tasks.filter((entry) => entry.id !== task.id);
    await persistPlan();
  }
}

async function persistPlan() {
  const list = testList.value;
  if (!list?.id) return;
  const payload = JSON.stringify(
    planOf.value.map((group) =>
      Array.isArray(group?.tasks) ? group : { tasks: [group] }
    )
  );
  await window.dbAPI.updateTestListTestList(list.id, payload);
}

/**
 * Delete a phase.
 *
 * The reference refuses when the phase holds the focused task.
 */
async function clearGroup(group) {
  const focused = groups.value.some(
    (entry) =>
      entry.id === group.id &&
      entry.tasks.some((task) => task.id === focusId.value)
  );
  if (focused) {
    noticeStore.addNotice({
      title: t("notice.执行中"),
      content: t("notice.当前有正在执行的任务，请等待执行完成"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  group.tasks = [];
  await persistPlan();
}

/** Clear the whole task list. */
async function clearTasks() {
  const plan = planOf.value;
  for (const group of plan) {
    if (Array.isArray(group?.tasks)) group.tasks = [];
  }
  await persistPlan();
}

function markRunning(item) {
  item.status = "running";
}

/**
 * Complete a task.
 *
 * The reference sets `is_complete`, clears the focus when the completed task
 * was the focused one, and writes the focus data, the focus description and
 * the task list back.
 */
async function markDone(item) {
  const group = groups.value.find((entry) => entry.tasks.some((task) => task.id === item.id));
  if (!group) return;
  const task = group.tasks.find((entry) => entry.id === item.id);
  if (!task) return;
  task.is_complete = true;
  item.status = "done";

  const list = projectStore.currentTestList;
  if (!list) return;
  if (focusId.value === task.id) {
    await window.dbAPI.updateTestListFocusData(list.id, JSON.stringify(null));
    await window.dbAPI.updateTestListFocusDescription(list.id, "");
    focusId.value = null;
  }
  await window.dbAPI.updateTestListTestList(list.id, JSON.stringify(groups.value));
  await projectStore.selectProject(projectStore.currentProject);
}

/** Mark a task as not complete, as the reference's per-task button does. */
async function markIncomplete(item) {
  const group = groups.value.find((entry) => entry.tasks.some((task) => task.id === item.id));
  if (!group) return;
  const task = group.tasks.find((entry) => entry.id === item.id);
  if (!task) return;
  task.is_complete = false;
  const list = projectStore.currentTestList;
  if (list) {
    await window.dbAPI.updateTestListTestList(list.id, JSON.stringify(groups.value));
    await projectStore.selectProject(projectStore.currentProject);
  }
}

/** The reference opens its own dialog to generate the plan. */
function openGenerateDialog() {
  dialogStore.openDialog("test-list-generate", { testType: testType.value });
}

async function setFocus(item) {
  const api = window.dbAPI;
  if (!api || !testList.value) return;
  // The reference stores the whole task as the focus, so the tree can be
  // compared with it.
  await api.updateTestListFocusData(testList.value.id, JSON.stringify({ ...item }));
  await api.updateTestListFocusDescription(
    testList.value.id,
    item.description || item.title || ""
  );
  await projectStore.selectProject(projectStore.currentProject);
}

onMounted(() => {
  projectStore.loadProjects();
  window.addEventListener("penligent:task-saved", onTaskSaved);
  window.addEventListener("penligent:task-deleted", onTaskDeleted);
});

onBeforeUnmount(() => {
  window.removeEventListener("penligent:task-saved", onTaskSaved);
  window.removeEventListener("penligent:task-deleted", onTaskDeleted);
});
</script>

<template>
  <div class="test-list-container">
    <div v-if="projectStore.currentProject" class="test-list-toolbar">
      <button class="generate-button" :disabled="generating" @click="openGenerateDialog">
        <Loader2 v-if="generating" class="spin" :size="13" />
        <Sparkles v-else :size="13" />
        <span>
          {{ generating ? t("fun-string.稍等片刻") : t("test-list-generate.生成当前项目的任务清单") }}
        </span>
      </button>

      <button
        class="generate-button"
        :disabled="crawling || !projectStore.currentTarget"
        title="Crawl the project target"
        @click="runCrawl"
      >
        <Loader2 v-if="crawling" class="spin" :size="13" />
        <Radar v-else :size="13" />
        <span>{{ crawling ? t("test-list-generate.大约需要1-2分钟请耐心等待") : "Crawl" }}</span>
      </button>

      <button
        class="generate-button"
        :disabled="scanning || !projectStore.currentTarget"
        title="Scan the project target for vulnerabilities"
        @click="runScan"
      >
        <Loader2 v-if="scanning" class="spin" :size="13" />
        <Bug v-else :size="13" />
        <span>{{ scanning ? "Scanning..." : "Scan" }}</span>
      </button>
    </div>

    <div v-if="projectStore.currentProject" class="tree-header">
      <div class="tree-title">
        <Network :size="16" />
        <span>{{ t("test-list.渗透测试任务树") }}</span>
      </div>
      <div v-if="allTasks.length > 0" class="tree-progress">
        <span class="progress-label">{{ t("test-list.总进度") }}</span>
        <span class="progress-value">
          {{ doneCount }}/{{ allTasks.length }} ({{ progressPercent }}%)
        </span>
        <span class="progress-unit">{{ t("test-list.项") }}</span>
      </div>
      <div class="tree-actions">
        <button
          class="tree-button"
          :class="{ active: showOnlyIncomplete }"
          @click="showOnlyIncomplete = !showOnlyIncomplete"
        >
          {{ t("test-list.未完成") }}
        </button>
        <div class="tree-menu">
          <button class="tree-button" @click="addMenuOpen = !addMenuOpen">
            <Plus :size="13" />
            <span>{{ t("test-list.添加") }}</span>
          </button>
          <div v-if="addMenuOpen" class="tree-menu-list">
            <button class="tree-menu-item" @click="addMenuOpen = false; openAddDialog('detection')">
              {{ t("test-list.添加检测项") }}
            </button>
            <button class="tree-menu-item" @click="addMenuOpen = false; openAddDialog('custom')">
              {{ t("test-list.添加自定义测试任务") }}
            </button>
          </div>
        </div>
        <button class="tree-button" @click="clearTasks">
          <span>{{ t("test-list.全部删除") }}</span>
        </button>
        <button class="tree-button" @click="openGenerateDialog">
          <span>{{ t("test-list-generate.开始生成") }}</span>
        </button>
      </div>
    </div>

    <div v-if="projectStore.currentProject && allTasks.length === 0 && !skipped" class="empty-tree">
      <div class="empty-line">
        {{ t("test-list.未找到当前任务的任务清单请点击下方按钮开始生成") }}
      </div>
      <div class="empty-line">
        {{ t("test-list.未生成无法继续分析可以重新创建/开始生成任务清单") }}
      </div>
      <div class="empty-actions">
        <button class="generate-button" :disabled="generating" @click="openGenerateDialog">
          <Loader2 v-if="generating" class="spin" :size="13" />
          <Sparkles v-else :size="13" />
          <span>{{ t("test-list.开始生成") }}</span>
        </button>
      </div>
    </div>

    <div v-if="groups.length > 0" class="test-content">
      <div v-for="group in groups" :key="group.id" class="test-content-item">
        <div class="phase-content">
          <div class="phase-header">
            <span class="phase-name">{{ group.phase_name || group.title || "" }}</span>
            <span class="phase-count">
              {{ group.complete_count }}/{{ group.all_count }}
            </span>
            <span
              class="task-button-item edit"
              :title="t('test-list.编辑测试任务')"
              @click.stop="openEditDialog(group)"
            >
              <Pencil :size="12" />
            </span>
            <span
              class="task-button-item retest"
              :title="t('test-list.全部删除')"
              @click.stop="clearGroup(group)"
            >
              <Trash2 :size="12" />
            </span>
          </div>

          <div
            v-for="item in group.tasks"
            :key="item.id"
            class="task-item"
          >
            <div class="task-item-title">
              <span class="task-line" />
              <span class="task-icon">
                <Check v-if="item.is_complete" class="icon-complete" :size="14" />
                <CircleDot v-else-if="item.item === focusItem" class="icon-dot" :size="12" />
                <Circle v-else class="icon-all" :size="12" />
              </span>
              <span class="task-title-text">{{ item.title }}</span>
              <span v-if="item.item === focusItem" class="current-task">
                ({{ t("test-list.当前任务") }})
              </span>
              <span class="task-button">
                <span
                  v-if="item.item !== focusItem && !isComplete(item)"
                  class="task-button-item play"
                  :title="t('test-list.测试')"
                  @click.stop="setFocus(item); markRunning(item)"
                >
                  <Play :size="11" />
                  <span>{{ t("test-list.测试") }}</span>
                </span>
                <span
                  v-if="item.item !== focusItem && !isComplete(item)"
                  class="task-button-item complete"
                  :title="t('test-list.完成')"
                  @click.stop="markDone(item)"
                >
                  <Check :size="11" />
                  <span>{{ t("test-list.完成") }}</span>
                </span>
                <span
                  v-if="isComplete(item)"
                  class="task-button-item retest"
                  :title="t('test-list.未完成')"
                  @click.stop="markIncomplete(item)"
                >
                  <RotateCcw :size="11" />
                  <span>{{ t("test-list.未完成") }}</span>
                </span>
                <span
                  class="task-button-item edit"
                  :title="t('test-list.编辑测试任务')"
                  @click.stop="openEditDialog(item)"
                >
                  <Pencil :size="12" />
                </span>
              </span>
            </div>
            <div class="task-dialog">
              <div class="task-dialog-text">
                {{ item.result || item.description || "" }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.tree-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.tree-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.95rem;
  font-weight: 700;
}

.tree-progress {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: 0.8rem;
  color: var(--muted);
}

.progress-value {
  color: var(--foreground);
  font-weight: 700;
}

.tree-menu {
  position: relative;
}

.tree-menu-list {
  position: absolute;
  top: calc(100% + 3px);
  right: 0;
  z-index: 20;
  min-width: 150px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: var(--background);
  box-shadow: 0 4px 12px #0003;
}

.tree-menu-item {
  padding: 6px 10px;
  border: none;
  background: none;
  color: var(--foreground);
  cursor: pointer;
  text-align: left;
  font-size: 0.8rem;
}

.tree-menu-item:hover {
  background-color: var(--nav-active-bg-project);
}

.tree-actions {
  margin-left: auto;
  display: flex;
  gap: 5px;
}

.tree-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.78rem;
}

.tree-button.active {
  background-color: var(--nav-active-bg);
  border-color: var(--nav-active-border);
}

.empty-actions {
  display: flex;
  gap: 8px;
}

.empty-tree {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--muted);
  font-size: 0.85rem;
}

.test-list-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-top: 10px;
}

.test-list-toolbar {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px 6px;
}

.generate-button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--foreground);
}

.generate-button:hover {
  background-color: var(--button-hover);
}

.generate-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.test-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.phase-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-item {
  width: calc(100% - 40px);
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 5px 10px;
  cursor: pointer;
}

.task-item:hover {
  background-color: var(--nav-active-bg-project);
}

.task-item-title {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
}

.task-line {
  width: 20px;
  height: 2px;
  background-color: var(--border);
}

.task-title-text {
  flex: 1;
  font-size: 0.9rem;
}

.task-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  opacity: 0;
  gap: 5px;
}

.task-item:hover .task-button {
  opacity: 1;
}

.task-button-item {
  display: flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 5px;
}

.task-button-item.play {
  color: var(--accent);
}

.task-button-item.retest {
  color: var(--danger);
}

.task-button-item.complete {
  color: var(--success);
}

.task-dialog {
  width: calc(100% - 40px);
  padding-left: 40px;
}

.task-dialog-text {
  font-size: 0.8rem;
  color: var(--muted);
  border-left: 1px solid var(--border);
  padding: 4px 8px;
}
</style>
