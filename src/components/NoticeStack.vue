<script setup>
/**
 * Notification stack.
 *
 * The reference renders toasts into `.notice-container` — absolutely
 * positioned at top:30px / right:.5vw, 25vw wide, with an `info`,
 * `warning` or `error` background and a close control in the corner.
 */
import { CircleX } from "lucide-vue-next";
import { useNoticeStore } from "@/stores/notice";

const noticeStore = useNoticeStore();
</script>

<template>
  <div class="notice-container">
    <TransitionGroup name="notice-item">
      <div
        v-for="item in noticeStore.noticeList"
        :key="item.id"
        class="notice-item"
        :class="`notice-item-${item.type}`"
      >
        <div class="notice-item-close-button" @click="noticeStore.removeNotice(item.id)">
          <CircleX :size="16" />
        </div>
        <div class="notice-item-title">{{ item.title }}</div>
        <div v-if="item.content" class="notice-item-message">{{ item.content }}</div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notice-container {
  position: absolute;
  z-index: 1000;
  top: 30px;
  right: 0.5vw;
  display: flex;
  flex-direction: column;
  max-height: calc(100% - 30px);
  overflow-y: auto;
  gap: 10px;
}

.notice-container .notice-item {
  width: 25vw;
  border-radius: 5px;
  padding: 10px 18px 10px 10px;
  display: flex;
  flex-direction: column;
  position: relative;
}

.notice-container .notice-item .notice-item-close-button {
  position: absolute;
  top: 3px;
  right: 3px;
  cursor: pointer;
}

.notice-container .notice-item .notice-item-title {
  font-weight: 700;
}

.notice-container .notice-item .notice-item-message {
  font-size: 0.9rem;
}

.notice-container .notice-item-success {
  background-color: var(--success);
}

.notice-item-info {
  background-color: var(--accent);
}

.notice-container .notice-item-warning {
  background-color: var(--warning);
}

.notice-container .notice-item-error {
  background-color: var(--danger);
}

.notice-item-enter-active,
.notice-item-leave-active {
  transition: all 0.3s ease;
}

.notice-item-enter-from,
.notice-item-leave-to {
  opacity: 0;
  transform: translate(30px);
}

.notice-item-move {
  transition: transform 0.3s ease;
}
</style>
