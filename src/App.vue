<script setup>
/**
 * Application shell.
 *
 * Layout, class names and measurements reproduced from the reference
 * application (verified against the live renderer at 1000x600):
 *
 *   .app-container        1000 x 600, flex column
 *   .header-container     30px tall, 1px bottom border
 *   .header               29px tall, flex row, space-between
 *   .header-left          800px, flex row, gap 10px, max-width 80%
 *   .header-right         186px, flex row, gap 5px
 *   .body-container       570px tall
 *
 * The three-pane body (left sidebar / centre / agent panel) lives in
 * HomeView, matching the reference component split.
 */
import { onMounted } from "vue";
import { RouterView } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import NoticeStack from "@/components/NoticeStack.vue";
import { useThemeStore, useFontSizeStore } from "@/stores/ui";
import { useProjectStore } from "@/stores/project";
import { useUserStore } from "@/stores/user";

const themeStore = useThemeStore();
const fontSizeStore = useFontSizeStore();
const projectStore = useProjectStore();
const userStore = useUserStore();

onMounted(async () => {
  themeStore.initTheme();
  fontSizeStore.initFontSize();
  await userStore.loadUser();
  await userStore.loadSettings();
  await projectStore.loadProjects();
  // The reference selects the first project when the application starts.
  const first = projectStore.projects[0];
  if (first) await projectStore.selectProject(first);
});
</script>

<template>
  <div class="app-container">
    <AppHeader />

    <div class="body-container">
      <RouterView />
      <NoticeStack />
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--background);
  color: var(--foreground);
}

.body-container {
  flex: 1;
  width: 100%;
  height: calc(100% - 30px);
}
</style>
