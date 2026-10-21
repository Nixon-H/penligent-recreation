<script setup>
/**
 * Centre panel: the risk summary header, the five-section switch
 * (Task List / Target Overview / Threat Map / Security Findings / Tool
 * Results) and the active section's content.
 *
 * The reference renders a fixed 400px-wide `.center-container` inside a
 * `flex:1` pane that is only 246px wide at a 1000px window, so the content
 * is clipped. That behaviour is reproduced deliberately.
 */
import { ref, computed } from "vue";
import {
  PanelLeftClose,
  FileText,
  NotepadText,
  Server,
  Map,
  TriangleAlert,
  Terminal
} from "lucide-vue-next";
import TaskListView from "@/views/TaskListView.vue";
import TargetOverviewView from "@/views/TargetOverviewView.vue";
import ThreatMapView from "@/views/ThreatMapView.vue";
import SecurityFindingsView from "@/views/SecurityFindingsView.vue";
import ToolResultsView from "@/views/ToolResultsView.vue";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "@/stores/project";
import { useNavStore } from "@/stores/ui";

const { t } = useI18n();
const projectStore = useProjectStore();

const navStore = useNavStore();

/**
 * The centre views.
 *
 * The keys are the reference's `navStr` values, so the navigation is global
 * and anything can switch it.
 */
const SECTIONS = [
  { key: "test_list", label: "center.测试清单", icon: NotepadText, component: TaskListView },
  { key: "overview", label: "center.目标信息总览", icon: Server, component: TargetOverviewView },
  { key: "mapping", label: "center.攻击面测绘", icon: Map, component: ThreatMapView },
  { key: "risk", label: "center.发现的风险", icon: TriangleAlert, component: SecurityFindingsView },
  { key: "tool", label: "center.执行的工具结果", icon: Terminal, component: ToolResultsView }
];

const current = computed(
  () => SECTIONS.find((s) => s.key === navStore.navStr) ?? SECTIONS[0]
);
const counts = computed(() => projectStore.riskCounts);
</script>

<template>
  <div class="center-container">
    <div class="center-header">
      <div
        class="hidden-left-button"
        title="Collapse panel"
        @click="$bus('penligent:toggle-left')"
      >
        <PanelLeftClose :size="16" />
      </div>

      <div class="risk-count-container">
        <div class="risk-item">
          <span class="risk-item-title">{{ t("center.总计") }}:</span>
          <span class="risk-item-count">{{ counts.total }}</span>
        </div>
        <div class="risk-item">
          <span class="risk-item-title">{{ t("center.严重") }}:</span>
          <span class="risk-item-count-danger">{{ counts.critical }}</span>
        </div>
        <div class="risk-item">
          <span class="risk-item-title">{{ t("center.高危") }}:</span>
          <span class="risk-item-count-high">{{ counts.high }}</span>
        </div>
        <div class="risk-item">
          <span class="risk-item-title">{{ t("center.中危") }}:</span>
          <span class="risk-item-count-medium">{{ counts.medium }}</span>
        </div>
        <div class="risk-item">
          <span class="risk-item-title">{{ t("center.低危") }}:</span>
          <span class="risk-item-count-low">{{ counts.low }}</span>
        </div>
        <div class="risk-item">
          <span class="risk-item-title">{{ t("center.INFO") }}:</span>
          <span class="risk-item-count-info">{{ counts.info }}</span>
        </div>
      </div>

      <div v-if="projectStore.currentProject" class="target-container">
        <div class="target-label">{{ t("center.目标") }}:&nbsp;</div>
        <span class="target-value">{{ projectStore.currentProject.project_target }}</span>
      </div>

      <div class="export-button-container">
        <div class="export-button" @click="$bus('penligent:export-report')">
          <FileText :size="16" />
          <span class="export-button-text">{{ t("center.导出报告") }}</span>
        </div>
      </div>
    </div>

    <div class="nav-container-wrapper" />

    <div class="nav-container">
      <div
        v-for="section in SECTIONS"
        :key="section.key"
        class="nav-item"
        :class="{ active: navStore.navStr === section.key }"
        @click="navStore.setNav(section.key)"
      >
        <component :is="section.icon" :size="16" />
        <div>{{ t(section.label) }}</div>
        <span v-if="section.key === 'test_list'" class="test-list-count">
          {{
            projectStore.currentTestList
              ? `${projectStore.currentTestList.complete_count}/${projectStore.currentTestList.all_count}`
              : "/"
          }}
        </span>
      </div>
    </div>

    <div class="content-container">
      <component :is="current.component" />
    </div>
  </div>
</template>

<style scoped>
.center-container {
  min-width: 400px;
  width: calc(100% - 20px);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  align-items: center;
  padding: 0 10px;
}

.center-container .center-header {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 10px 0;
  gap: 10px;
  white-space: nowrap;
  flex-wrap: wrap;
}

.center-container .center-header .hidden-left-button {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 5px;
  border-radius: 5px;
}

.center-container .center-header .hidden-left-button:hover {
  background-color: var(--button-bg);
}

.center-container .center-header .risk-count-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.center-container .center-header .risk-count-container .risk-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.center-container .center-header .risk-count-container .risk-item .risk-item-title {
  color: var(--muted);
}

.center-container .center-header .risk-count-container .risk-item .risk-item-count {
  color: var(--foreground);
}

.center-container .center-header .risk-count-container .risk-item .risk-item-count-danger {
  color: var(--danger);
}

.center-container .center-header .risk-count-container .risk-item .risk-item-count-high {
  color: var(--warning);
}

.center-container .center-header .risk-count-container .risk-item .risk-item-count-medium {
  color: var(--success);
}

.center-container .center-header .risk-count-container .risk-item .risk-item-count-low {
  color: var(--accent);
}

.center-container .center-header .export-button-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.center-container .center-header .export-button-container .export-button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 5px;
  border-radius: 5px;
  cursor: pointer;
  background-color: var(--button-bg);
  white-space: nowrap;
}

.center-container .center-header .export-button-container .export-button:hover {
  background-color: var(--button-hover);
}

.center-container .center-header .export-button-container .export-button .export-button-text {
  white-space: nowrap;
}

.center-container .nav-container-wrapper {
  width: calc(100% + 20px);
  height: 1px;
  background-color: var(--border);
}

.center-container .nav-container {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 10px 0 0;
}

.center-container .nav-container .nav-item {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  gap: 5px;
  padding: 5px 10px;
}

.center-container .nav-container .nav-item:hover {
  background-color: var(--button-hover);
}

.center-container .nav-container .nav-item .test-list-count {
  font-size: 0.8rem;
  border: 1px solid var(--background);
  border-radius: 5px;
  padding: 0 5px;
}

.center-container .nav-container .nav-item:first-child {
  border-radius: 5px 0 0 5px;
}

.center-container .nav-container .nav-item:last-child {
  border-radius: 0 5px 5px 0;
}

.center-container .nav-container .active {
  background-color: var(--nav-active-bg);
}

.center-container .content-container {
  width: 100%;
  flex: 1;
  min-height: 0;
  padding-bottom: 10px;
}

@media (max-width: 1100px) {
  .center-container .center-header .risk-count-container {
    display: none;
  }
}

@media (min-width: 1100px) {
  .center-container {
    min-width: 690px;
  }
}
</style>
