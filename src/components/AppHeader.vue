<script setup>
/**
 * Top application header.
 *
 * The nine navigation entries and their lucide icons were recovered from the
 * reference renderer's live DOM:
 *
 *   New Project (plus) · Settings (settings) · Skills Library (book-open) ·
 *   Toolbox (wrench) · Website (external-link) · Feedback (message-square-share) ·
 *   User Guide (github) · OpenClaw Security Tools (shield-check) ·
 *   Packet Sniffer (network)
 *
 * The right-hand cluster holds two panel toggles, the Login button and the
 * three window controls (minimize / restore / close).
 */
import {
  Plus,
  Settings,
  BookOpen,
  Wrench,
  ExternalLink,
  MessageSquareShare,
  Github,
  ShieldCheck,
  Network,
  PanelLeft,
  PanelRight,
  Minus,
  Square,
  X
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useUserStore } from "@/stores/user";
import { useWindowStore } from "@/stores/window";
import { useDialogStore } from "@/stores/dialog";

const { t } = useI18n();
const userStore = useUserStore();
const windowStore = useWindowStore();
const dialogStore = useDialogStore();

const NAV_ITEMS = [
  { key: "new-project", label: "header.新建项目", icon: Plus },
  { key: "settings", label: "header.环境配置", icon: Settings },
  { key: "skills", label: "header.技站法库", icon: BookOpen },
  { key: "toolbox", label: "header.工具箱", icon: Wrench },
  { key: "website", label: "header.官网", icon: ExternalLink },
  { key: "feedback", label: "header.反馈", icon: MessageSquareShare },
  { key: "user-guide", label: "header.用户指南", icon: Github },
  { key: "openclaw", label: "header.OpenClaw安全工具", icon: ShieldCheck },
  { key: "packet-sniffer", label: "header.抓包工具", icon: Network }
];

const EXTERNAL_LINKS = {
  website: "https://www.penligent.ai/",
  "user-guide": "https://github.com/penligent"
};

function onNav(item) {
  const link = EXTERNAL_LINKS[item.key];
  if (link) {
    window.systemAPI?.openExternal?.(link);
    return;
  }
  if (item.key === "new-project") {
    // The reference opens its task-creation dialog directly.
    dialogStore.openDialog("task-create");
    return;
  }
  if (item.key === "settings") {
    // The reference's "环境配置" entry opens the environment dialog, not the
    // provider settings.
    window.dispatchEvent(new CustomEvent("penligent:env-path"));
    return;
  }
  if (item.key === "skills") {
    window.dispatchEvent(new CustomEvent("penligent:skills"));
    return;
  }
  if (item.key === "toolbox") {
    window.dispatchEvent(new CustomEvent("penligent:toolbox"));
    return;
  }
  if (item.key === "feedback") {
    window.dispatchEvent(new CustomEvent("penligent:feed-back"));
    return;
  }
  if (item.key === "openclaw") {
    window.dispatchEvent(new CustomEvent("penligent:agent-nav"));
    return;
  }
  if (item.key === "packet-sniffer") {
    window.proxyAPI?.openProxyWindow?.();
  }
}

/*
 * The reference's header carries a "Login" button that opens the Penligent
 * account flow and gates the whole application. This reconstruction has no
 * account system, so the control opens the AI provider settings instead and
 * shows the local profile name.
 */
function onAccount() {
  window.dispatchEvent(new CustomEvent("penligent:ai-settings"));
}
</script>

<template>
  <div class="header-container">
    <div class="header">
      <div class="header-left">
        <div
          v-for="item in NAV_ITEMS"
          :key="item.key"
          class="header-left-botton-item"
          :title="t(item.label)"
          @click="onNav(item)"
        >
          <component :is="item.icon" :size="14" :stroke-width="2" />
          <div>{{ t(item.label) }}</div>
        </div>
      </div>

      <div class="header-right">
        <div
          class="header-right-button settings-button"
          title="Toggle left panel"
          @click="$bus('penligent:toggle-left')"
        >
          <PanelLeft :size="14" />
        </div>
        <div
          class="header-right-button settings-button"
          title="Toggle right panel"
          @click="$bus('penligent:toggle-right')"
        >
          <PanelRight :size="14" />
        </div>
        <div class="login-button" title="Local profile — click for AI settings" @click="onAccount">
          {{ userStore.displayName }}
        </div>
        <div
          class="header-right-button minimize-button"
          title="Minimize"
          @click="windowStore.minimize()"
        >
          <Minus :size="14" />
        </div>
        <div
          class="header-right-button restore-button"
          title="Maximize"
          @click="windowStore.restore()"
        >
          <Square :size="14" />
        </div>
        <div
          class="header-right-button close-button"
          title="Close"
          @click="windowStore.close()"
        >
          <X :size="14" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-container {
  min-height: 29px;
  width: 100%;
  border-bottom: 1px solid var(--border);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  width: 100%;
  -webkit-app-region: drag;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 5px;
  max-width: 80%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-left .header-left-botton-item {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  -webkit-app-region: no-drag;
  padding: 2px 5px;
  border-radius: 5px;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.header-left .header-left-botton-item:hover {
  background-color: var(--button-bg);
}

.header-left .header-left-botton-item div {
  max-width: 100px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.header-right {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-right: 5px;
  cursor: pointer;
  font-size: 16px;
  -webkit-app-region: no-drag;
}

.header-right .header-right-button {
  cursor: pointer;
  -webkit-app-region: no-drag;
  width: 25px;
  height: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  transition: all 0.3s ease;
}

.header-right .login-button {
  font-size: 0.9rem;
  background-color: var(--button-bg);
  padding: 2px 5px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.3s ease;
  -webkit-app-region: no-drag;
}

.header-right .login-button:hover {
  background-color: var(--button-hover);
}

.header-right .settings-button:hover {
  color: var(--muted);
}

.header-right .minimize-button:hover,
.header-right .restore-button:hover {
  background-color: var(--muted);
  color: var(--background);
}

.header-right .close-button:hover {
  background-color: var(--danger);
  color: var(--background);
}
</style>
