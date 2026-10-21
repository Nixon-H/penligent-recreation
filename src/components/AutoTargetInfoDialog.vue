<script setup>
/**
 * The target-information dialog.
 *
 * The reference gathers the target's basics with its own tools and shows
 * them as it finds them: the target itself, its type, the addresses, the
 * host names, the open ports and the subdomains. Each entry carries a type,
 * and the type decides the icon and how the content is laid out.
 */
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";
import {
  Target,
  Network,
  Globe,
  Plug,
  Search,
  LoaderCircle
} from "lucide-vue-next";
import { useProjectStore } from "@/stores/project";
import { useOverviewStore } from "@/stores/overview";

const { t } = useI18n();
const dialogStore = useDialogStore();
const projectStore = useProjectStore();
const overviewStore = useOverviewStore();

const items = ref([]);
const loading = ref(true);
let timer = null;

/** The icon each type carries. */
const ICONS = {
  target: Target,
  ips: Network,
  hostnames: Globe,
  openports: Plug,
  subdomains: Search
};

function add(id, type, title, content) {
  items.value.push({ id, type, title, content });
}

async function collect() {
  const project = projectStore.currentProject;
  if (!project) return;
  const target = project.project_target || "";
  add(1, "target", t("overview.测试目标"), target);

  const type = await window.targetToolsAPI?.detectInputType?.(target);
  if (type?.type === "invalid") {
    add(2, "target", t("overview.目标类型"), t("overview.无效目标"));
  } else {
    add(2, "target", t("overview.目标类型"), type?.type || t("overview.无效"));
  }

  const overview = await overviewStore.load(project.id);
  const ips = overview.target.identifiers.ips_list || [];
  if (ips.length) add(3, "ips", t("overview.IP地址列表"), ips);

  const domains = overview.target.identifiers.domains_list || [];
  if (domains.length) add(4, "hostnames", t("overview.域名列表"), domains);

  const ports = (overview.network.open_ports_services || []).flatMap((entry) =>
    (entry.ports || []).map((port) => ({
      port: port.port,
      service: port.service
    }))
  );
  if (ports.length) add(5, "openports", t("overview.开放端口与服务"), ports);
}

onMounted(async () => {
  await collect();
  loading.value = false;
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <LoaderCircle v-if="loading" class="loading-icon" :size="16" />
          <span class="title">{{ t("overview.自动获取目标基本信息中") }}</span>
        </div>

        <div class="target-list">
          <div v-for="item in items" :key="item.id" class="target-item">
            <div class="target-item-header">
              <component
                :is="ICONS[item.type] || Target"
                class="target-item-title-icon"
                :size="16"
              />
              <span class="target-item-title">{{ item.title }}</span>
            </div>
            <div v-if="item.type === 'target'" class="target-item-content">
              {{ item.content }}
            </div>
            <div
              v-else-if="item.type === 'openports'"
              class="target-item-content"
            >
              <div
                v-for="(port, index) in item.content"
                :key="index"
                class="target-item-content-item-mang-item"
              >
                {{ t("overview.端口") }}：{{ port.port }}
                {{ t("overview.服务") }}：{{ port.service }}
              </div>
            </div>
            <div v-else class="target-item-content">
              <div
                v-for="(entry, index) in item.content"
                :key="index"
                class="target-item-content-item-mang-item"
              >
                {{ entry }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-container {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.container {
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
  width: min(520px, 92vw);
  max-height: calc(100vh - 60px);
  overflow-y: auto;
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title {
  font-size: 1rem;
  font-weight: 700;
}

.loading-icon {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.target-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.target-item {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
}

.target-item-header {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
}

.target-item-title {
  font-size: 0.86rem;
  font-weight: 600;
}

.target-item-content {
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--foreground);
}

.target-item-content-item-mang-item {
  word-break: break-all;
}
</style>
