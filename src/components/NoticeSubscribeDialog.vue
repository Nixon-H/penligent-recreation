<script setup>
/**
 * Subscription notice.
 *
 * The reference shows this when the credits run out: a short pitch with four
 * points and a trial link.
 */
import { useI18n } from "vue-i18n";
import { CircleX, Sparkles, ExternalLink } from "lucide-vue-next";
import { useDialogStore } from "@/stores/dialog";

const { t } = useI18n();
const dialogStore = useDialogStore();

/** The subscription page. */
const SUBSCRIBE_URL = "https://www.penligent.ai/subscribe";

function openSubscribe() {
  window.systemAPI?.openExternal?.(SUBSCRIBE_URL);
}

const POINTS = [
  "notice-subscribe.input-label-1",
  "notice-subscribe.input-label-2",
  "notice-subscribe.input-label-3",
  "notice-subscribe.input-label-4"
];
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title">
            <Sparkles :size="18" />
            <span>{{ t("notice-subscribe.notice-subscribe-title") }}</span>
          </div>
          <CircleX class="close-button" :size="20" @click="dialogStore.closeDialog()" />
        </div>

        <div class="points">
          <div v-for="point in POINTS" :key="point" class="point">· {{ t(point) }}</div>
        </div>

        <div class="button-container">
          <button class="button" @click="dialogStore.closeDialog()">
            {{ t("notsubscribed.已订阅完成") }}
          </button>
          <button
            class="button button-primary"
            @click="dialogStore.closeDialog()"
          >
            <Sparkles :size="13" />
            <span>{{ t("notice-subscribe.试用一下") }}</span>
          </button>
          <button
            class="button button-primary"
            @click="openSubscribe"
          >
            <ExternalLink :size="13" />
            <span>{{ t("notsubscribed.前往订阅页面") }}</span>
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
  width: min(480px, 92vw);
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  font-size: 1.05rem;
  font-weight: 700;
}

.close-button {
  cursor: pointer;
}

.points {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.85rem;
  line-height: 1.5;
}

.button-container {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
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
  font-size: 0.85rem;
}

.button-primary {
  background-color: var(--button-bg);
}
</style>
