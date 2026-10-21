<script setup>
/**
 * The proxy usage guide.
 *
 * The reference shows this inside the proxy page rather than in a dialog: the
 * proxy view switches to the guide, the guide walks through four pages, and
 * the `proxy_help_view` setting remembers that it has been seen.
 *
 * The text is the reference's own, in all eleven languages.
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Download } from "lucide-vue-next";
import { useNoticeStore } from "@/stores/notice";

const { t } = useI18n();
const noticeStore = useNoticeStore();
const emit = defineEmits(["close"]);

/** The four pages, in the reference's order. */
const PAGES = [
  { title: "环境配置", items: ["环境配置1", "环境配置2", "环境配置3"] },
  { title: "拦截与篡改", items: ["拦截与篡改1", "拦截与篡改2", "拦截与篡改3"] },
  { title: "历史记录与AI分析", items: ["历史记录与AI分析1", "历史记录与AI分析2", "历史记录与AI分析3"] },
  { title: "代理策略管理", items: ["代理策略管理1", "代理策略管理2", "代理策略管理3"] }
];

const page = ref(0);
const status = ref(null);

async function loadCa() {
  const info = await window.proxyAPI.status();
  status.value = info;
  if (!info?.caCertPath) {
    noticeStore.error(t("notice.错误"), t("notice.提示"));
    return;
  }
  await window.proxyAPI.downloadCaCertificate();
}

function next() {
  if (page.value < PAGES.length - 1) page.value += 1;
}

function previous() {
  if (page.value > 0) page.value -= 1;
}

/** Leaving the guide remembers that it has been seen. */
function close() {
  window.dbAPI.setUserSetting("proxy_help_view", "true", "string", "Proxy help view");
  emit("close");
}
</script>

<template>
  <div class="proxy-help">
    <div class="proxy-help-header">
      <span class="proxy-help-title">{{ t("proxy-how-use.帮助") }}</span>
      <span class="proxy-help-step">{{ page + 1 }} / {{ PAGES.length }}</span>
    </div>

    <div class="proxy-help-section">
      <div class="proxy-help-section-title">
        {{ t(`proxy-how-use.${PAGES[page].title}`) }}
      </div>
      <div
        v-for="item in PAGES[page].items"
        :key="item"
        class="proxy-help-item"
      >
        {{ t(`proxy-how-use.${item}`) }}
      </div>
    </div>

    <div v-if="status?.caCertPath" class="proxy-help-ca">
      <span class="proxy-help-ca-label">{{ t("proxy.获取CA证书") }}</span>
      <span class="proxy-help-ca-path">{{ status.caCertPath }}</span>
    </div>

    <div class="proxy-help-actions">
      <button class="button" @click="loadCa">
        <Download :size="13" />
        <span>{{ t("proxy.获取CA证书") }}</span>
      </button>
      <button class="button" :disabled="page === 0" @click="previous">
        {{ t("proxy-how-use.上一步") }}
      </button>
      <button
        v-if="page < PAGES.length - 1"
        class="button"
        @click="next"
      >
        {{ t("proxy-how-use.下一步") }}
      </button>
      <button class="button" @click="close">
        {{ t("proxy.取消") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.proxy-help {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.proxy-help-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.proxy-help-title {
  font-size: 1rem;
  font-weight: 700;
}

.proxy-help-step {
  font-size: 0.78rem;
  color: var(--muted);
}

.proxy-help-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.proxy-help-section-title {
  font-weight: 700;
  font-size: 0.92rem;
  color: var(--accent);
}

.proxy-help-item {
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--foreground);
}

.proxy-help-ca {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.78rem;
  color: var(--muted);
  word-break: break-all;
}

.proxy-help-ca-label {
  flex: 0 0 auto;
}

.proxy-help-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
}

.button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid var(--border);
  cursor: pointer;
  color: var(--foreground);
  background: transparent;
  font-size: 0.82rem;
}

.button:hover:not(:disabled) {
  background-color: var(--button-hover);
}

.button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
