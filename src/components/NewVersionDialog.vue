<script setup>
/**
 * Update notice.
 *
 * The reference asks Penligent's public version endpoint which release is
 * current and shows this dialog when the served version is newer than the
 * running one.
 */
import { useI18n } from "vue-i18n";
import { useNoticeStore } from "@/stores/notice";
import { useVersionStore } from "@/stores/version";
import { useDialogStore } from "@/stores/dialog";
import { CircleX, Download, Clock } from "lucide-vue-next";

const { t } = useI18n();
const noticeStore = useNoticeStore();
const versionStore = useVersionStore();
const dialogStore = useDialogStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close", "update", "later"]);

defineProps({
  version: { type: Object, default: () => ({}) }
});

/**
 * Go to the update.
 *
 * The reference re-checks the version endpoint and reports whether a newer
 * release is out; it does not open a download page of its own.
 */
async function update() {
  await versionStore.checkVersionManual();
  emit("update");
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title">
            <Download :size="18" />
            <span>{{ t("newversion.新版本更新") }}</span>
          </div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <div class="body">
          <div class="line">{{ t("newversion.有新版本更新，请及时更新。") }}</div>
          <div class="line">{{ t("newversion.更新后，您可以体验到更多新功能和优化。") }}</div>
          <div v-if="version.latest" class="versions">
            <span class="version-tag">v{{ version.current }}</span>
            <span class="version-arrow">→</span>
            <span class="version-tag latest">v{{ version.latest }}</span>
          </div>
        </div>

        <div class="button-container">
          <button class="button" @click="emit('later')">
            <Clock :size="13" />
            <span>{{ t("newversion.稍后更新") }}</span>
          </button>
          <button class="button button-primary" @click="update">
            <Download :size="13" />
            <span>{{ t("newversion.前往更新") }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.line {
  font-size: 0.9rem;
  line-height: 1.5;
}

.versions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.version-tag {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.78rem;
}

.version-tag.latest {
  border-color: var(--button-bg);
  color: var(--accent);
}

.version-arrow {
  color: var(--muted);
}

.button-container {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
}

.button:hover {
  background-color: var(--button-hover);
}

.button-primary {
  background-color: var(--button-bg);
}
</style>
