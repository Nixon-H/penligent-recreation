<script setup>
/**
 * Packet sniffer — the `#/proxy-list` route.
 *
 * The reference opens this view in its own window ("抓包详情 - 渗透测试工具")
 * and drives the MITM proxy child from it: the child forwards every
 * intercepted request and response, the operator releases or drops the ones
 * that match the interception rules, and the captured traffic is persisted in
 * the `proxy_history` table.
 *
 * This view reproduces that behaviour:
 *   - it starts the proxy and shows the address to point a client at;
 *   - it lists the captured requests live;
 *   - it lets a paused request be released (optionally modified) or dropped;
 *   - it stores every exchange in `proxy_history`.
 */
import { CircleHelp } from "lucide-vue-next";
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { Play, X, RefreshCw, ShieldCheck, Download } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useNoticeStore } from "@/stores/notice";
import ProxyHelpDialog from "@/components/ProxyHelpDialog.vue";

const { t } = useI18n();
const noticeStore = useNoticeStore();

/** The guide is shown inside the page, as the reference does. */
const showHelp = ref(false);

const status = ref({ running: false, port: 17890, caCertPath: "" });
const requests = ref([]);
const paused = ref([]);
const responses = ref([]);
const selected = ref(null);
const interceptEnabled = ref(false);
const rules = ref([]);
/** The interception timeout, in seconds. */
const timeoutSeconds = ref(300);
/** The address the proxy listens on. */
const address = ref("127.0.0.1:17890");
const showSettings = ref(false);
/** The rule the operator is editing. */
const draftRule = ref({ method: "", urlIncludes: "", all: false });
const dispose = ref(null);

const captureCount = computed(() => requests.value.length);

function recordRequest(payload) {
  const entry = {
    id: payload.id,
    url: payload.url,
    method: payload.method,
    headers: payload.headers || {},
    body: payload.body || "",
    time: Date.now()
  };
  requests.value.unshift(entry);
  if (requests.value.length > 500) requests.value.length = 500;
  // The reference writes every intercepted request as it arrives; the
  // response updates the same row.
  void persist(entry, null);
}

function recordResponse(payload) {
  const entry = requests.value.find((item) => item.id === payload.requestId);
  if (entry) void persist(entry, payload);
  responses.value.unshift({
    id: payload.requestId,
    url: payload.requestUrl,
    method: payload.requestMethod,
    statusCode: payload.statusCode,
    statusMessage: payload.statusMessage,
    headers: payload.headers || {},
    body: payload.body || "",
    time: Date.now()
  });
}

function onProxyEvent(message) {
  if (!message || !message.type) return;
  switch (message.type) {
    case "INTERCEPTED":
      recordRequest(message.payload || {});
      break;
    case "PAUSED": {
      const entry = {
        id: message.id,
        url: message.payload?.url,
        method: message.payload?.method,
        headers: message.payload?.headers || {},
        body: message.payload?.body || ""
      };
      paused.value.unshift(entry);
      selected.value = entry;
      break;
    }
    case "INTERCEPTED_RESPONSE":
      recordResponse(message.payload || {});
      break;
    case "INFO":
      noticeStore.info("Proxy", message.payload?.message || "");
      break;
    case "ERROR":
      noticeStore.error("Proxy Error", message.error || "");
      break;
    default:
      break;
  }
}

async function start() {
  const result = await window.proxyAPI.startProxy();
  status.value = await window.proxyAPI.status();
  if (result?.success) {
    noticeStore.info("Proxy Started", `Listening on 127.0.0.1:${status.value.port}`);
  }
}

async function stop() {
  await window.proxyAPI.stopProxy();
  status.value = await window.proxyAPI.status();
}

function release(entry, modified) {
  window.proxyAPI.sendForkProxyChildData({
    type: "RELEASE",
    id: entry.id,
    payload: modified || {}
  });
  paused.value = paused.value.filter((item) => item.id !== entry.id);
  if (selected.value?.id === entry.id) selected.value = null;
}

function drop(entry) {
  window.proxyAPI.sendForkProxyChildData({ type: "DROP", id: entry.id });
  paused.value = paused.value.filter((item) => item.id !== entry.id);
  if (selected.value?.id === entry.id) selected.value = null;
}

function applyInterceptConfig() {
  window.proxyAPI.sendForkProxyChildData({
    type: "SET_INTERCEPT_CONFIG",
    payload: { enabled: interceptEnabled.value, rules: rules.value }
  });
}

/**
 * The settings.
 *
 * The reference keeps the address, the interception rules and the
 * interception timeout in the `proxy_settings` table, and loads them when
 * the view opens.
 */
async function loadSettings() {
  const api = window.proxyAPI;
  if (!api?.getInterceptRules) return;
  try {
    rules.value = (await api.getInterceptRules()) || [];
    interceptEnabled.value = rules.value.some((rule) => rule.all);
    timeoutSeconds.value = Number((await api.getTimeout()) || 300);
    address.value = (await api.getAddress()) || address.value;
  } catch {
    /* the proxy is not running */
  }
}

/** Add an interception rule. */
function addRule() {
  if (!draftRule.value.method && !draftRule.value.urlIncludes) return;
  rules.value.push({ ...draftRule.value });
  draftRule.value = { method: "", urlIncludes: "", all: false };
}

/** Save the interception rules. */
async function saveRules() {
  await window.proxyAPI.saveInterceptRules(rules.value);
  await window.proxyAPI.saveTimeout(timeoutSeconds.value);
  await window.proxyAPI.saveAddress(address.value);
  applyInterceptConfig();
  noticeStore.addNotice({
    title: t("notice.成功"),
    content: t("proxy.代理设置"),
    type: "success",
    duration: 5000
  });
}

/** Persist an exchange in the `proxy_history` table. */
async function persist(entry, response) {
  if (!entry) return;
  const api = window.dbAPI;
  if (!api?.addProxyHistory) return;
  await api.addProxyHistory({
    request_id: String(entry.id || ""),
    request_url: entry.url || "",
    request_method: entry.method || "GET",
    request_headers: JSON.stringify(entry.headers || {}),
    request_data: entry.body || "",
    request_time: String(entry.time || Date.now()),
    response_status: response ? String(response.statusCode ?? "") : "",
    response_status_message: response ? response.statusMessage || "" : "",
    response_headers: JSON.stringify(response?.headers || {}),
    response_body: response?.body || "",
    response_time: String(response?.time || Date.now())
  });
}

/** Load the recorded history, as the reference does when the view opens. */
async function loadHistory() {
  const api = window.dbAPI;
  if (!api?.getProxyHistoryAll) return;
  const rows = (await api.getProxyHistoryAll()) || [];
  for (const row of rows) {
    if (!requests.value.some((entry) => String(entry.id) === String(row.request_id))) {
      requests.value.push({
        id: row.request_id,
        url: row.request_url,
        method: row.request_method,
        headers: safeParse(row.request_headers),
        body: row.request_data || "",
        time: Number(row.request_time || 0)
      });
    }
    if (row.response_status && !responses.value.some((entry) => entry.id === row.request_id)) {
      responses.value.push({
        id: row.request_id,
        url: row.request_url,
        method: row.request_method,
        statusCode: row.response_status,
        statusMessage: row.response_status_message,
        headers: safeParse(row.response_headers),
        body: row.response_body || "",
        time: Number(row.response_time || 0)
      });
    }
  }
}

function safeParse(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

async function saveHistory() {
  for (const entry of requests.value) {
    const response = responses.value.find((r) => r.id === entry.id);
    await persist(entry, response);
  }
  noticeStore.info("History Saved", `${requests.value.length} exchanges written.`);
}

function clear() {
  requests.value = [];
  responses.value = [];
  paused.value = [];
  selected.value = null;
}

onMounted(async () => {
  await loadSettings();
  await loadHistory();
  dispose.value = window.proxyAPI.onProxyEvent(onProxyEvent);
  status.value = await window.proxyAPI.status();
});

onBeforeUnmount(() => {
  if (dispose.value) dispose.value();
});
</script>

<template>
  <div class="proxy-list-container">
    <div class="proxy-toolbar">
      <button class="toolbar-button" @click="status.running ? stop() : start()">
        <Play :size="13" />
        <span>{{ t("proxy.抓包详情") }}</span>
      </button>
      <span class="proxy-address">
        {{ t("proxy.代理地址") }} 127.0.0.1:{{ status.port }}
        <span class="proxy-state" :class="{ on: status.running }">
          {{ status.running ? t("proxy.拦截") : t("proxy.代理设置") }}
        </span>
      </span>

      <label class="intercept-toggle">
        <input v-model="interceptEnabled" type="checkbox" @change="applyInterceptConfig" />
        <span>{{ t("proxy.拦截") }}</span>
      </label>

      <button class="toolbar-button" @click="saveHistory">
        {{ t("proxy.历史请求") }}
      </button>
      <button class="toolbar-button" @click="clear">
        {{ t("proxy.取消") }}
      </button>
      <button class="toolbar-button" @click="showSettings = !showSettings">
        <ShieldCheck :size="13" />
        <span>{{ t("proxy.代理设置") }}</span>
      </button>
      <button class="toolbar-button" @click="showHelp = !showHelp">
        <CircleHelp :size="13" />
        <span>{{ t("proxy.帮助") }}</span>
      </button>
    </div>

    <ProxyHelpDialog v-if="showHelp" class="proxy-help-panel" @close="showHelp = false" />

    <div v-if="showSettings" class="proxy-settings">
      <div class="proxy-settings-row">
        <span class="proxy-settings-label">{{ t("proxy.代理地址") }}</span>
        <input v-model="address" class="proxy-settings-input" type="text" />
      </div>
      <div class="proxy-settings-row">
        <span class="proxy-settings-label">{{ t("proxy.拦截放行时间") }}</span>
        <input
          v-model.number="timeoutSeconds"
          class="proxy-settings-input"
          type="number"
          min="1"
        />
      </div>
      <div class="proxy-settings-row column">
        <span class="proxy-settings-label">{{ t("proxy.拦截规则") }}</span>
        <div
          v-for="(rule, index) in rules"
          :key="index"
          class="proxy-settings-rule"
        >
          <span class="proxy-settings-rule-method">{{ rule.method || "*" }}</span>
          <span class="proxy-settings-rule-url">{{ rule.urlIncludes || "*" }}</span>
          <button
            class="proxy-settings-remove"
            @click="rules.splice(index, 1)"
          >
            {{ t("proxy.取消") }}
          </button>
        </div>
        <div class="proxy-settings-rule draft">
          <input
            v-model="draftRule.method"
            class="proxy-settings-input"
            :placeholder="t('proxy.操作')"
          />
          <input
            v-model="draftRule.urlIncludes"
            class="proxy-settings-input"
            :placeholder="t('proxy.请求报文测试')"
          />
          <button class="proxy-settings-add" @click="addRule">
            {{ t("proxy.添加拦截规则") }}
          </button>
        </div>
      </div>
      <div class="proxy-settings-actions">
        <button class="toolbar-button" @click="showSettings = false">
          {{ t("proxy.取消") }}
        </button>
        <button class="toolbar-button" @click="saveRules">
          {{ t("proxy.保存") }}
        </button>
      </div>
    </div>

    <div class="proxy-body">
      <div class="proxy-list">
        <div
          v-for="entry in requests"
          :key="entry.id"
          class="proxy-row"
          :class="{ paused: paused.some((p) => p.id === entry.id) }"
          @click="selected = entry"
        >
          <span class="proxy-method">{{ entry.method }}</span>
          <span class="proxy-url">{{ entry.url }}</span>
          <span
            v-if="responses.find((r) => r.id === entry.id)"
            class="proxy-status"
          >
            {{ responses.find((r) => r.id === entry.id).statusCode }}
          </span>
        </div>
        <div v-if="requests.length === 0" class="proxy-empty">
          No traffic captured yet. Point a client at 127.0.0.1:{{ status.port }}.
        </div>
      </div>

      <div class="proxy-detail">
        <template v-if="selected">
          <div class="detail-header">
            <span>{{ selected.method }} {{ selected.url }}</span>
            <span class="detail-actions">
              <button
                v-if="paused.some((p) => p.id === selected.id)"
                class="toolbar-button"
                @click="release(selected)"
              >
                <ShieldCheck :size="13" /> Release
              </button>
              <button
                v-if="paused.some((p) => p.id === selected.id)"
                class="toolbar-button danger"
                @click="drop(selected)"
              >
                <X :size="13" /> Drop
              </button>
            </span>
          </div>
          <div class="detail-section">
            <div class="detail-label">Request headers</div>
            <pre>{{ JSON.stringify(selected.headers, null, 2) }}</pre>
          </div>
          <div v-if="selected.body" class="detail-section">
            <div class="detail-label">Request body</div>
            <pre>{{ selected.body }}</pre>
          </div>
          <template
            v-if="responses.find((r) => r.id === selected.id)"
          >
            <div class="detail-section">
              <div class="detail-label">
                Response {{ responses.find((r) => r.id === selected.id).statusCode }}
              </div>
              <pre>{{ responses.find((r) => r.id === selected.id).body }}</pre>
            </div>
          </template>
        </template>
        <div v-else class="proxy-empty">Select a request to inspect it.</div>
      </div>
    </div>

    <div class="proxy-statusbar">
      <span>{{ captureCount }} captured</span>
      <span>{{ paused.length }} awaiting a decision</span>
      <span v-if="status.caCertPath" class="proxy-ca">
        <Download :size="11" /> {{ status.caCertPath }}
      </span>
      <RefreshCw :size="11" />
    </div>
  </div>
</template>

<style scoped>
.proxy-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid var(--border);
}

.proxy-settings-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.proxy-settings-row.column {
  flex-direction: column;
  align-items: stretch;
}

.proxy-settings-label {
  font-size: 0.8rem;
  color: var(--muted);
  min-width: 110px;
}

.proxy-settings-input {
  flex: 1;
  padding: 5px 8px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background-color: var(--background);
  color: var(--foreground);
  font-size: 0.82rem;
}

.proxy-settings-rule {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  padding: 4px 0;
}

.proxy-settings-rule-method {
  min-width: 60px;
  font-weight: 600;
}

.proxy-settings-rule-url {
  flex: 1;
  word-break: break-all;
  color: var(--muted);
}

.proxy-settings-remove,
.proxy-settings-add {
  padding: 4px 9px;
  border-radius: 5px;
  border: 1px solid var(--border);
  cursor: pointer;
  color: var(--foreground);
  background: transparent;
  font-size: 0.78rem;
}

.proxy-settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.proxy-list-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background-color: var(--background);
  color: var(--foreground);
}

.proxy-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.8rem;
}

.toolbar-button:hover {
  background-color: var(--button-hover);
}

.toolbar-button.danger {
  color: var(--danger);
  border-color: var(--danger);
}

.proxy-address {
  font-size: 0.8rem;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.proxy-state {
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.7rem;
}

.proxy-state.on {
  color: var(--success);
  border-color: var(--success);
}

.intercept-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
}

.proxy-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}

.proxy-list {
  width: 45%;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 4px;
}

.proxy-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 5px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.proxy-row:hover {
  background-color: var(--nav-active-bg-project);
}

.proxy-row.paused {
  border-left: 3px solid var(--warning);
}

.proxy-method {
  font-weight: 700;
  min-width: 48px;
}

.proxy-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.proxy-status {
  color: var(--success);
}

.proxy-detail {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 8px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  margin-bottom: 6px;
}

.detail-actions {
  display: flex;
  gap: 5px;
}

.detail-section {
  margin-top: 8px;
}

.detail-label {
  font-size: 0.75rem;
  color: var(--muted);
  margin-bottom: 3px;
}

.detail-section pre {
  margin: 0;
  font-size: 0.72rem;
  font-family: "Courier New", monospace;
  white-space: pre-wrap;
  word-break: break-all;
  background-color: var(--frontground);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px;
}

.proxy-empty {
  color: var(--muted);
  font-size: 0.85rem;
  padding: 10px;
  text-align: center;
}

.proxy-statusbar {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.75rem;
  color: var(--muted);
  border-top: 1px solid var(--border);
  padding-top: 6px;
}

.proxy-ca {
  display: flex;
  align-items: center;
  gap: 4px;
  word-break: break-all;
}
</style>
