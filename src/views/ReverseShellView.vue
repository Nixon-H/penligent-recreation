<script setup>
/**
 * Reverse shell generator.
 *
 * The reference bundles the payloads as a local template table — nothing is
 * requested from a service — so the whole table was recovered and is used
 * here. The reference's own defaults and listener types are preserved:
 *
 *   ip 10.10.10.101 · port 9002 · payloadType Reverse · os All ·
 *   shell bash · encoding none
 *   listener types: Reverse, Bind, MSFVenom, HoaxShell
 */
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { Copy } from "lucide-vue-next";
import data from "@/data/reverse-shells.json";

const { t } = useI18n();

const ip = ref(data.defaults.ip);
const port = ref(data.defaults.port);
const payloadType = ref(data.defaults.payloadType);
const os = ref(data.defaults.os);
const shell = ref(data.defaults.shell);
const encoding = ref(data.defaults.encoding);
const selected = ref(data.payloads[0]?.name || "");
const copied = ref(false);

const listenerTypes = data.listenerTypes;
const shells = data.shells;
const operatingSystems = data.operatingSystems;

const visible = computed(() =>
  data.payloads.filter((entry) => {
    if (payloadType.value && entry.type !== payloadType.value) return false;
    if (os.value && os.value !== "All" && entry.os !== os.value) return false;
    if (shell.value && entry.shell !== shell.value) return false;
    return true;
  })
);

const payload = computed(() => {
  const entry = data.payloads.find((item) => item.name === selected.value);
  if (!entry) return "";
  return entry.template
    .replace(/\{0\}/g, String(ip.value))
    .replace(/\{1\}/g, String(port.value));
});

/** The listener command the reference shows for the selected type. */
const listenerCommand = computed(() => {
  switch (payloadType.value) {
    case "Bind":
      return `nc -lvnp ${port.value}`;
    case "MSFVenom":
      return `msfvenom -p ${port.value} LHOST=${ip.value} -f "${selected.value}" -e`;
    case "HoaxShell":
      return `hoaxshell -l ${port.value} -i ${ip.value}`;
    default:
      return `nc -lvnp ${port.value}`;
  }
});

function choose(entry) {
  selected.value = entry.name;
  if (entry.shell) shell.value = entry.shell;
  if (entry.os) os.value = entry.os;
}

async function copy() {
  if (!payload.value) return;
  await navigator.clipboard.writeText(payload.value).catch(() => {});
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}
</script>

<template>
  <div class="reverse-shell-container">
    <div class="header">
      <div class="title">{{ t("reverse-shell.反向Shell生成") }}</div>
    </div>

    <div class="main-layout">
      <div class="top-config">
        <div class="config-section ip-port-group">
          <label class="config-label">{{ t("reverse-shell.IP和端口") }}</label>
          <div class="config-row">
            <input v-model="ip" class="config-input" type="text" />
            <input v-model="port" class="config-input port" type="number" />
          </div>
        </div>

        <div class="config-section listener-config">
          <label class="config-label">{{ t("reverse-shell.监听器类型") }}</label>
          <div class="config-row">
            <select v-model="payloadType" class="config-input">
              <option v-for="type in listenerTypes" :key="type" :value="type">{{ type }}</option>
            </select>
            <select v-model="encoding" class="config-input">
              <option value="none">none</option>
              <option value="base64">base64</option>
            </select>
          </div>
          <div class="listener-command">
            <code>{{ listenerCommand }}</code>
          </div>
          <div class="listener-actions">
            <span class="hint">{{ t("reverse-shell.使用 HoaxShell 监听器") }}</span>
          </div>
        </div>
      </div>

      <div class="middle-config">
        <div class="config-tabs">
          <div
            v-for="type in listenerTypes"
            :key="type"
            class="config-filter"
            :class="{ active: payloadType === type }"
            @click="payloadType = type"
          >
            {{ type }}
          </div>
        </div>
        <div class="config-filters">
          <div
            v-for="system in ['All', ...operatingSystems]"
            :key="system"
            class="filter-item"
            :class="{ active: os === system }"
            @click="os = system"
          >
            {{ system }}
          </div>
        </div>
      </div>

      <div class="main-content">
        <div class="payload-list-sidebar">
          <div class="payload-list">
            <div
              v-for="entry in visible"
              :key="entry.name"
              class="payload-item"
              :class="{ active: selected === entry.name }"
              @click="choose(entry)"
            >
              <div class="payload-name">{{ entry.name }}</div>
              <div class="payload-desc">{{ entry.description }}</div>
            </div>
            <div v-if="visible.length === 0" class="payload-empty">
              No payload matches this filter.
            </div>
          </div>
        </div>

        <div class="payload-output">
          <div class="output-header">
            <div class="output-title">{{ t("reverse-shell.生成的 Payload") }}</div>
            <div class="output-actions">
              <button class="copy-button" @click="copy">
                <Copy :size="13" />
                <span>{{ copied ? "Copied" : t("reverse-shell.复制") }}</span>
              </button>
            </div>
          </div>
          <pre class="payload-controls">{{ payload || t("reverse-shell.显示在这里") }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reverse-shell-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.header .title {
  font-size: 1.2rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 5px;
}

.main-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.top-config {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.config-label {
  font-size: 0.85rem;
  color: var(--muted);
}

.config-row {
  display: flex;
  gap: 5px;
}

.config-input {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: var(--background);
  color: var(--foreground);
  font-size: 0.85rem;
}

.config-input.port {
  width: 90px;
}

.listener-command code {
  font-family: "Courier New", monospace;
  font-size: 0.78rem;
  color: var(--muted);
}

.listener-actions .hint {
  font-size: 0.75rem;
  color: var(--muted);
}

.middle-config {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.config-tabs,
.config-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.config-filter,
.filter-item {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.8rem;
}

.config-filter.active,
.filter-item.active {
  background-color: var(--nav-active-bg);
  border-color: var(--nav-active-border);
}

.main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}

.payload-list-sidebar {
  width: 40%;
  min-width: 180px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 5px;
}

.payload-item {
  padding: 5px 8px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.payload-item.active {
  background-color: var(--nav-active-bg-project);
}

.payload-name {
  font-size: 0.85rem;
  font-weight: 700;
}

.payload-desc {
  font-size: 0.72rem;
  color: var(--muted);
}

.payload-empty {
  padding: 10px;
  color: var(--muted);
  font-size: 0.8rem;
  text-align: center;
}

.payload-output {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 8px;
}

.output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.output-title {
  font-weight: 700;
  font-size: 0.9rem;
}

.copy-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.78rem;
}

.payload-controls {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 8px;
  background-color: var(--frontground);
  border: 1px solid var(--border);
  border-radius: 5px;
  font-family: "Courier New", monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
