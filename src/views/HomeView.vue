<script setup>
/**
 * Home view — the three-pane workspace.
 *
 *   .home-content-left    250px  (width 25%, max-width 250px)
 *   .home-content-center  flex:1 (246px at a 1000px window)
 *   .drag-line            2px, col-resize
 *   .home-content-right   500px
 *
 * The centre pane's content is a fixed 400px-wide `.center-container`
 * inside a narrower flex pane, so it is clipped exactly as in the reference.
 */
import { ref, onMounted, onBeforeUnmount } from "vue";
import LeftPanel from "@/components/LeftPanel.vue";
import CenterPanel from "@/components/CenterPanel.vue";
import ChatPanel from "@/components/ChatPanel.vue";
import OnboardingDialog from "@/components/OnboardingDialog.vue";
import AiSettingsDialog from "@/components/AiSettingsDialog.vue";
import AiToolsDialog from "@/components/AiToolsDialog.vue";
import TestListCreateDialog from "@/components/TestListCreateDialog.vue";
import ScanPipelineDialog from "@/components/ScanPipelineDialog.vue";
import ProxyHelpDialog from "@/components/ProxyHelpDialog.vue";
import DialogHost from "@/components/DialogHost.vue";
import NewVersionDialog from "@/components/NewVersionDialog.vue";
import CreditDialog from "@/components/CreditDialog.vue";
import ReportDialog from "@/components/ReportDialog.vue";
import { useUserStore } from "@/stores/user";
import { useNoticeStore } from "@/stores/notice";
import { useProjectStore } from "@/stores/project";
import { useAgentStore } from "@/stores/agent";
import { useDialogStore } from "@/stores/dialog";
import { useWindowStore } from "@/stores/window";
import { useVersionStore } from "@/stores/version";
import { useAiStore } from "@/stores/ai";

const userStore = useUserStore();
const noticeStore = useNoticeStore();
const projectStore = useProjectStore();
const agentStore = useAgentStore();
const dialogStore = useDialogStore();
const windowStore = useWindowStore();
const versionStore = useVersionStore();
const aiStore = useAiStore();

const leftVisible = ref(true);
const rightVisible = ref(true);
const leftWidth = ref(250);
const rightWidth = ref(500);

const showOnboarding = ref(false);
const versionInfo = ref({});

/** Window listeners registered by this view, detached on unmount. */
let homeListeners = [];

/** Register a window listener and remember it, so it can be removed. */
function on(name, handler) {
  window.addEventListener(name, handler);
  homeListeners.push([name, handler]);
}

let dragging = null;

function startDrag(side, event) {
  dragging = {
    side,
    startX: event.clientX,
    startWidth: side === "left" ? leftWidth.value : rightWidth.value
  };
  window.addEventListener("mousemove", onDrag);
  window.addEventListener("mouseup", stopDrag);
}

function onDrag(event) {
  if (!dragging) return;
  const delta = event.clientX - dragging.startX;
  // The reference lets the panels take at most seven tenths of the window,
  // and hides the left one when it is pushed past that.
  const max = window.innerWidth * 0.7;
  if (dragging.side === "left") {
    const next = dragging.startWidth + delta;
    if (next >= max && leftVisible.value) leftVisible.value = false;
    leftWidth.value = Math.max(180, Math.min(max, next));
    document.body.style.cursor = "col-resize";
  } else {
    const next = dragging.startWidth - delta;
    rightWidth.value = Math.max(250, Math.min(max, next));
    document.body.style.cursor = "col-resize";
  }
}

function stopDrag() {
  dragging = null;
  document.body.style.cursor = "";
  window.removeEventListener("mousemove", onDrag);
  window.removeEventListener("mouseup", stopDrag);
}

/** The reference keeps the right panel within seven tenths of the window. */
function onResize() {
  const max = window.innerWidth * 0.7;
  if (rightWidth.value > max) rightWidth.value = max;
}

/*
 * The reference gates project creation and report export behind a Penligent
 * account and shows the amber "Not Logged In" notice when the session is
 * missing. That service is not available here, so nothing is gated: the
 * application uses a local profile and works entirely offline apart from the
 * AI provider the user configures.
 */
function requestNewProject() {
  // The reference opens its task-creation dialog for a new project.
  dialogStore.openDialog("task-create");
}

function onExportReport() {
  if (!projectStore.currentProject) {
    noticeStore.addNotice({
      title: t("notice.错误"),
      content: t("notice.请先创建任务"),
      type: "error",
      duration: 5000
    });
    return;
  }
  // The reference opens its report dialog from the centre header
  // (`openDialog("report")`), so the reconstruction does the same. The report
  // is generated locally and stored in `report_exports`.
  dialogStore.openDialog("report");
}

function openAiSettings() {
  dialogStore.openDialog("setting");
}

onMounted(async () => {
  await windowStore.initWindowInfo();
  // The reference checks the version every thirty seconds.
  versionStore.startAutoCheck();
  await userStore.loadSettings();
  await aiStore.load();
  await agentStore.loadSystemInfo();
  // The reference shows the walkthrough while the `onboarding_status` user
  // setting is empty.
  if (!userStore.settings.onboarding_status) {
    showOnboarding.value = true;
  }
  const onSkills = () => {
    dialogStore.openDialog("tactics-library");
  };
  const onToolbox = () => {
    dialogStore.openDialog("ai-tools");
  };
  const onToggleLeft = () => {
    leftVisible.value = !leftVisible.value;
  };
  const onToggleRight = () => {
    rightVisible.value = !rightVisible.value;
  };

  // Every listener is registered through `on`, so all of them are detached
  // when the view goes away.
  on("penligent:new-project", requestNewProject);
  on("penligent:export-report", onExportReport);
  on("penligent:settings", openAiSettings);
  on("penligent:ai-settings", openAiSettings);
  on("penligent:skills", onSkills);
  on("penligent:new-version", (event) => {
    versionInfo.value = event.detail || {};
    dialogStore.openDialog("new-version", { payload: versionInfo.value });
  });
  on("penligent:credit", (event) => {
    dialogStore.openDialog(event.detail?.mode || "not-limit");
  });
  on("penligent:toolbox", onToolbox);
  on("penligent:agent-nav", () => {
    dialogStore.openDialog("agent-nav");
  });
  on("penligent:feed-back", () => {
    dialogStore.openDialog("feed-back");
  });
  on("penligent:tool-add", () => {
    dialogStore.openDialog("tool-add");
  });
  on("penligent:auth-add", () => {
    dialogStore.openDialog("auth-add");
  });
  on("penligent:header-add", () => {
    dialogStore.openDialog("header-add");
  });
  on("penligent:tac-lib-create", () => {
    dialogStore.openDialog("tac-lib-create");
  });
  on("penligent:risk-download", () => {
    dialogStore.openDialog("risk-download");
  });
  on("penligent:report-download", () => {
    dialogStore.openDialog("report-download");
  });
  on("penligent:env-path", () => {
    dialogStore.openDialog("env-path");
  });
  on("penligent:notice-subscribe", () => {
    dialogStore.openDialog("notice-subscribe");
  });
  on("penligent:create-task", (event) => {
    dialogStore.openDialog("task-create", { testType: event.detail?.testType || "" });
  });
  on("penligent:toggle-left", onToggleLeft);
  on("penligent:toggle-right", onToggleRight);
  on("resize", onResize);
});

onBeforeUnmount(() => {
  // The drag and the resize listener are detached here too, so the view
  // leaves nothing behind.
  stopDrag();
  versionStore.stopAutoCheck();
  for (const [event, handler] of homeListeners) {
    window.removeEventListener(event, handler);
  }
  homeListeners = [];
});
</script>

<template>
  <div class="home-container">
    <div class="home-content">
      <div
        v-if="leftVisible"
        class="home-content-left"
        :style="{ width: leftWidth + 'px', maxWidth: leftWidth + 'px' }"
      >
        <LeftPanel />
      </div>

      <div class="home-content-center">
        <CenterPanel />
      </div>

      <div class="drag-line" @mousedown="startDrag('right', $event)" />

      <div
        v-if="rightVisible"
        class="home-content-right"
        :style="{ width: rightWidth + 'px' }"
      >
        <ChatPanel />
      </div>
    </div>

    <OnboardingDialog
      v-if="showOnboarding"
      @close="showOnboarding = false"
      @completed="showOnboarding = false"
    />
    <DialogHost />
  </div>
</template>

<style scoped>
.home-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  font-size: 1rem;
}

.home-container .home-content {
  width: 100%;
  height: 100%;
  display: flex;
}

.home-content-left {
  height: 100%;
  border-right: 1px solid var(--border);
  flex: 0 0 auto;
}

.home-content-center {
  flex: 1;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}

.home-content-right {
  height: 100%;
  border-left: 1px solid var(--border);
  flex: 0 0 auto;
}

.drag-line {
  width: 2px;
  height: 100%;
  background-color: var(--background);
  cursor: col-resize;
  flex: 0 0 auto;
}

.drag-line:hover {
  background-color: var(--button-bg);
}
</style>

<style scoped>
.skills-overlay {
  position: absolute;
  z-index: 2;
  inset: 0;
  background-color: var(--background);
  padding: 12px;
  overflow: auto;
}
</style>
