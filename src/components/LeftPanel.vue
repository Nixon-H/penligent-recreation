<script setup>
/**
 * Left sidebar: brand, "New Project" action, Projects / Tool Config switch
 * and the selected panel's content.
 */
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { Target, Wrench } from "lucide-vue-next";
import ProjectsView from "@/views/ProjectsView.vue";
import ToolConfigView from "@/views/ToolConfigView.vue";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "@/stores/project";
import { useDialogStore } from "@/stores/dialog";
import { useNoticeStore } from "@/stores/notice";

const { t } = useI18n();
const projectStore = useProjectStore();
const dialogStore = useDialogStore();
const noticeStore = useNoticeStore();

const active = ref("projects");

const panels = { projects: ProjectsView, toolconfig: ToolConfigView };
const currentPanel = computed(() => panels[active.value]);

/**
 * New project.
 *
 * The reference opens its task-creation dialog directly
 * (`openDialog("task-create")`). It must not go through a window event: the
 * left panel both dispatched and listened for the event, and
 * `dispatchEvent` is synchronous, so the click recursed until the stack
 * overflowed.
 */
function onNewProject() {
  dialogStore.openDialog("task-create");
}
</script>

<template>
  <div class="left-container">
    <div class="header-container">
      <div class="logo-container">
        <div class="logo logo-light" />
        <span>Penligent</span>
      </div>

      <div class="header-button" @click="onNewProject">
        <Target :size="14" />
        <span>{{ t("left.新建项目") }}</span>
      </div>
    </div>

    <div class="nav-container">
      <div
        class="nav-item"
        :class="{ active: active === 'projects' }"
        @click="active = 'projects'"
      >
        <Target :size="14" />
        <span>{{ t("left.项目列表") }}</span>
      </div>
      <div
        class="nav-item"
        :class="{ active: active === 'toolconfig' }"
        @click="active = 'toolconfig'"
      >
        <Wrench :size="14" />
        <span>{{ t("left.工具配置") }}</span>
      </div>
    </div>

    <div class="content-container">
      <component :is="currentPanel" />
    </div>
  </div>
</template>

<style scoped>
.left-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  flex-direction: column;
}

.left-container .header-container {
  width: calc(100% - 20px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 0;
}

.logo-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 700;
  font-size: 1.2rem;
}

.logo-container .logo {
  margin-left: 2px;
  width: 25px;
  height: 25px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.left-container .header-container .header-button {
  cursor: pointer;
  background-color: var(--button-bg);
  padding: 5px 10px;
  border-radius: 5px;
  gap: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.left-container .header-container .header-button:hover {
  background-color: var(--button-hover);
}

.left-container .nav-container {
  border-top: 1px solid var(--border);
  width: calc(100% - 20px);
  display: flex;
  align-items: center;
  padding: 5px 10px;
}

.left-container .nav-container .nav-item {
  height: calc(100% - 10px);
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  padding: 5px 10px;
  white-space: nowrap;
}

.left-container .nav-container .nav-item:hover {
  background-color: var(--button-hover);
}

.left-container .nav-container .nav-item:first-child {
  border-radius: 5px 0 0 5px;
}

.left-container .nav-container .nav-item:last-child {
  border-radius: 0 5px 5px 0;
}

.left-container .nav-container .active {
  background-color: var(--nav-active-bg);
}

.logo-container .logo.logo-light {
  background-image: url("@/assets/logo-black.png");
}

.left-container .content-container {
  width: calc(100% - 20px);
  flex: 1;
  min-height: 0;
}
</style>
