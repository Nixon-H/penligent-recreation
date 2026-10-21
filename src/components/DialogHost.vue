<script setup>
/**
 * Dialog host.
 *
 * The reference renders its dialogs from one place: the `dialog` store holds
 * the name of the open dialog and the shell renders whichever component
 * that name refers to. This host does the same, so a dialog can be opened
 * from anywhere — including the agent's own error handling — by name.
 */
import { computed } from "vue";
import { useDialogStore } from "@/stores/dialog";
import { useVersionStore } from "@/stores/version";

import AiSettingsDialog from "@/components/AiSettingsDialog.vue";
import AiToolsDialog from "@/components/AiToolsDialog.vue";
import TestListCreateDialog from "@/components/TestListCreateDialog.vue";
import ScanPipelineDialog from "@/components/ScanPipelineDialog.vue";
import ProxyHelpDialog from "@/components/ProxyHelpDialog.vue";
import NewVersionDialog from "@/components/NewVersionDialog.vue";
import CreditDialog from "@/components/CreditDialog.vue";
import ReportDialog from "@/components/ReportDialog.vue";
import RichTextEditDialog from "@/components/RichTextEditDialog.vue";
import SkillsLibraryView from "@/views/SkillsLibraryView.vue";
import AgentNav from "@/components/AgentNav.vue";
import ReportDownloadDialog from "@/components/ReportDownloadDialog.vue";
import FeedBackDialog from "@/components/FeedBackDialog.vue";
import EnvPathDialog from "@/components/EnvPathDialog.vue";
import ToolAddDialog from "@/components/ToolAddDialog.vue";
import AuthAddDialog from "@/components/AuthAddDialog.vue";
import HeaderAddDialog from "@/components/HeaderAddDialog.vue";
import TacLibCreateDialog from "@/components/TacLibCreateDialog.vue";
import RiskDownloadDialog from "@/components/RiskDownloadDialog.vue";
import NoticeSubscribeDialog from "@/components/NoticeSubscribeDialog.vue";
import TestTaskDialog from "@/components/TestTaskDialog.vue";
import TestListGenerateDialog from "@/components/TestListGenerateDialog.vue";
import TestPhaseEditDialog from "@/components/TestPhaseEditDialog.vue";
import TestPhaseDeleteDialog from "@/components/TestPhaseDeleteDialog.vue";
import ChatModelDialog from "@/components/ChatModelDialog.vue";
import OnboardingDialog from "@/components/OnboardingDialog.vue";
import AutoTargetInfoDialog from "@/components/AutoTargetInfoDialog.vue";
import TaskSetDialog from "@/components/TaskSetDialog.vue";
import CreateAgentScanTaskDialog from "@/components/CreateAgentScanTaskDialog.vue";

const dialogStore = useDialogStore();

/** The component each dialog name refers to. */
const COMPONENTS = {
  setting: AiSettingsDialog,
  "ai-tools": AiToolsDialog,
  "task-create": TestListCreateDialog,
  "create-process": ScanPipelineDialog,
  "proxy-help": ProxyHelpDialog,
  "new-version": NewVersionDialog,
  "not-subscribed": CreditDialog,
  "not-limit": CreditDialog,
  report: ReportDialog,
  edit: RichTextEditDialog,
  "tactics-library": SkillsLibraryView,
  "agent-nav": AgentNav,
  "report-download": ReportDownloadDialog,
  "feed-back": FeedBackDialog,
  "env-path": EnvPathDialog,
  "tool-add": ToolAddDialog,
  "tool-set-add": ToolAddDialog,
  "auth-add": AuthAddDialog,
  "header-add": HeaderAddDialog,
  "tac-lib-create": TacLibCreateDialog,
  "risk-download": RiskDownloadDialog,
  "notice-subscribe": NoticeSubscribeDialog,
  "notice-subscribe-report": NoticeSubscribeDialog,
  "notice-subscribe-risk": NoticeSubscribeDialog,
  "task-add": TestTaskDialog,
  // The reference's names.
  "test-task-add": TestTaskDialog,
  "test-list-add": TestTaskDialog,
  "test-list-generate": TestListGenerateDialog,
  "test-phase-edit": TestPhaseEditDialog,
  "test-phase-delete": TestPhaseDeleteDialog,
  "chat-model": ChatModelDialog,
  "auto-target-info": AutoTargetInfoDialog,
  "task-set": TaskSetDialog,
  // The reference opens the technique dialog under both names.
  create: TacLibCreateDialog,
  "create-agent-scan-task": CreateAgentScanTaskDialog,
  "auto-target-scan": AutoTargetInfoDialog,
  onboarding: OnboardingDialog
};

const current = computed(() => COMPONENTS[dialogStore.dialogStr] || null);
const testType = computed(() => dialogStore.testType || "");

/**
 * The dialog's save.
 *
 * Each dialog has its own path: the task dialogs save a test task, the
 * technique library saves a technique, and the rest are dispatched so the
 * view that owns them can act.
 */
function onSaved(payload) {
  const name = dialogStore.dialogStr;
  if (name === "test-task-add" || name === "test-list-add") {
    window.dispatchEvent(new CustomEvent("penligent:task-saved", { detail: payload }));
  } else if (name === "tactics-library") {
    window.dispatchEvent(new CustomEvent("penligent:tac-lib-saved", { detail: payload }));
  } else {
    window.dispatchEvent(new CustomEvent(`penligent:${name}-saved`, { detail: payload }));
  }
  dialogStore.closeDialog();
}

/**
 * The "later" on a new version.
 *
 * The reference records the version the operator declined, so the notice
 * does not come back.
 */
async function onLater() {
  await useVersionStore().clickLaterUpdate();
}

/** And so is its delete. */
function onDeleted(payload) {
  const name = dialogStore.dialogStr;
  if (name === "test-task-add" || name === "test-list-add") {
    window.dispatchEvent(new CustomEvent("penligent:task-deleted", { detail: payload }));
  } else {
    window.dispatchEvent(new CustomEvent(`penligent:${name}-deleted`, { detail: payload }));
  }
  dialogStore.closeDialog();
}
const isLibrary = computed(() => dialogStore.dialogStr === "tactics-library");
</script>

<template>
  <div v-if="isLibrary" class="skills-overlay">
    <component :is="current" @close="dialogStore.closeDialog()" />
  </div>
  <component
    v-else-if="current"
    :is="current"
    :mode="dialogStore.payload?.mode || 'create'"
    :test-type="testType"
    :task="dialogStore.payload?.task || null"
    :project="dialogStore.payload?.project || null"
    :version="dialogStore.payload || null"
    :group="dialogStore.payload?.group || null"
    @close="dialogStore.closeDialog()"
    @saved="onSaved"
    @delete="onDeleted"
    @later="onLater"
  />
</template>

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
