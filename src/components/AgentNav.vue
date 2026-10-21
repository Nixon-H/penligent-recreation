<script setup>
/**
 * Agent security tools.
 *
 * The reference's `AgentNav` dialog lists two entries. The first opens the
 * security-toolbox dialog on its `agent-skills-detection` tab; the second
 * opens the task-creation dialog with the test type set to `AgentScan`.
 */
import { useI18n } from "vue-i18n";
import { ShieldCheck, ScanLine, X } from "lucide-vue-next";
import { useDialogStore } from "@/stores/dialog";
import { useToolsStore } from "@/stores/tools";

const { t } = useI18n();
const dialogStore = useDialogStore();
const toolsStore = useToolsStore();

function openSkillsAudit() {
  toolsStore.setActiveToolsNav("agent-skills-detection");
  dialogStore.openDialog("ai-tools");
}

function openAgentScan() {
  dialogStore.closeDialog();
  dialogStore.openDialog("task-create", { testType: "AgentScan" });
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title">
            <ShieldCheck :size="16" />
            <span>{{ t("agent-nav.Agent安全工具") }}</span>
          </div>
          <X class="close-button" :size="20" @click="dialogStore.closeDialog()" />
        </div>

        <div class="rows">
          <div class="input-label" @click="openSkillsAudit">
            <div class="row-title">{{ t("agent-nav.Skills审计工具") }}</div>
            <div class="row-description">{{ t("agent-nav.Skills审计工具描述") }}</div>
          </div>

          <div class="input-label" @click="openAgentScan">
            <div class="row-title">{{ t("agent-nav.OpenClaw安全扫描") }}</div>
            <div class="row-description">{{ t("agent-nav.OpenClaw安全扫描描述") }}</div>
          </div>
        </div>

        <div class="button-container">
          <button class="button" @click="dialogStore.closeDialog()">
            {{ t("agent-nav.取消") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.button-container {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
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
  width: min(460px, 92vw);
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1rem;
  font-weight: 700;
}

.close-button {
  cursor: pointer;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.input-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}

.input-label:hover {
  border-color: var(--button-bg);
}

.row-title {
  font-size: 0.92rem;
  font-weight: 700;
}

.row-description {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.45;
}
</style>
