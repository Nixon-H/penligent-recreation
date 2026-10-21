<script setup>
/**
 * Threat map.
 *
 * The reference lays the target's attack surface out as a node graph on Vue
 * Flow, in three columns:
 *
 *   x = 200   the target node
 *   x = 750   the group nodes: the APIs, the web app and the risks
 *   x = 1300  the children of those groups
 *
 * The heights, the spacing, the edge colours and the method ordering are
 * the reference's, recovered from its bundle.
 */
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { VueFlow, useVueFlow } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import { useOverviewStore } from "@/stores/overview";
import { useProjectStore } from "@/stores/project";
import { useNoticeStore } from "@/stores/notice";

const { t } = useI18n();
const overviewStore = useOverviewStore();
const projectStore = useProjectStore();
const noticeStore = useNoticeStore();
const { fitView } = useVueFlow();

const nodes = ref([]);
const edges = ref([]);
/** Whether the examples of an interface are shown. */
const examplesOpen = ref(false);
/** The risk whose details are shown. */
const expandedRisk = ref(null);

function toggleRisk(risk) {
  expandedRisk.value = expandedRisk.value === risk.id ? null : risk.id;
}

/** The order the reference sorts the API method groups in. */
const METHOD_ORDER = {
  GET: 1, POST: 2, PUT: 3, PATCH: 4, DELETE: 5, HEAD: 6, OPTIONS: 7, UNKNOWN: 99
};

const SEVERITIES = ["critical", "high", "medium", "low", "info"];

function technologiesHeight(list) {
  if (!list || list.length === 0 || list[0] === "-") return 0;
  return Math.min(28 + 45 + 12 + list.length * 40 + (list.length - 1) * 8, 600);
}

function tlsHeight(tls) {
  if (!tls || !tls.subject || tls.subject === "-") return 0;
  const fields = [tls.subject, tls.issuer, tls.san, tls.valid_from, tls.valid_to, tls.fingerprint];
  return Math.min(80 + fields.filter((field) => field && field !== "-").length * 50, 600);
}

function headersHeight(list) {
  if (!list || list.length === 0) return 0;
  return Math.min(80 + list.length * 50, 600);
}

function pathsHeight(list) {
  if (!list || list.length === 0) return 0;
  return Math.min(80 + list.length * 70, 600);
}

function targetHeight(target, network) {
  if (!target) return 150;
  let height = 85;
  height += 50;
  const waf = network?.waf_or_cdn;
  if (waf && waf.length > 0 && waf[0] !== "-") {
    height += 10 + 20 + 6;
    height += Math.ceil(waf.length / 3) * 28;
  }
  return height;
}

/** Copy a value and say so, as the reference does. */
/** The path of a URL, as the reference shows it. */
function pathOnly(url) {
  try {
    const parsed = new URL(String(url));
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return String(url || "");
  }
}

/** The fallback the reference uses when the clipboard is refused. */
function legacyCopy(text) {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "absolute";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

async function copy(text) {
  if (!text) {
    noticeStore.addNotice({
      title: t("notice.提示"),
      content: t("notice.没有可复制的内容"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  // The reference keeps a fallback for the browsers that refuse the
  // asynchronous clipboard, and only reports the copy when one of the two
  // paths worked.
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = legacyCopy(text);
  }
  if (!copied) {
    noticeStore.addNotice({
      title: t("notice.提示"),
      content: t("notice.没有可复制的内容"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  noticeStore.addNotice({
    title: t("mapping.已复制"),
    content: text,
    type: "success",
    duration: 5000
  });
}

function build(overView, risks) {
  const built = [];
  const builtEdges = [];
  const target = overView?.target || {};
  const network = overView?.network || {};
  const apis = overView?.apis || [];
  const webApp = overView?.web_app || {};

  const groups = [];
  if (apis && apis.length > 0) groups.push({ type: "apis-group", height: 66, data: { apis } });
  if (webApp && Object.keys(webApp).length > 0) {
    groups.push({ type: "webapp-group", height: 66, data: { webApp } });
  }
  if (risks && risks.length > 0) {
    groups.push({
      type: "risks-group",
      height: 66,
      data: { label: t("mapping.安全风险"), count: risks.length }
    });
  }

  const GAP = 100;
  let cursor = 400 - (groups.reduce((sum, group) => sum + group.height, 0) + (groups.length - 1) * GAP) / 2;
  const sourceY = {};
  const column = [];

  for (const group of groups) {
    const y = cursor;
    sourceY[group.type] = y;
    if (group.type === "apis-group") {
      built.push({
        id: "apis-group",
        type: "apis-group",
        position: { x: 750, y },
        data: { label: "Web APIs", count: group.data.apis.length }
      });
    } else if (group.type === "webapp-group") {
      built.push({
        id: "webapp-group",
        type: "webapp-group",
        position: { x: 750, y },
        data: { label: t("mapping.Web应用") }
      });
    } else {
      built.push({
        id: "risks-group",
        type: "risks-group",
        position: { x: 750, y },
        data: { label: group.data.label, count: group.data.count }
      });
    }
    column.push({ y, height: group.height });
    cursor += group.height + GAP;
  }

  const height = targetHeight(target, network);
  let targetY = 400 - height / 2;
  if (column.length > 0) {
    const top = Math.min(...column.map((entry) => entry.y));
    const bottom = Math.max(...column.map((entry) => entry.y + entry.height));
    targetY = (top + bottom) / 2 - height / 2;
  }
  built.push({
    id: "target",
    type: "target",
    position: { x: 200, y: targetY },
    data: { target, network }
  });

  const EDGE = {
    "apis-group": { stroke: "#8b5cf6", marker: "url(#arrow-purple)" },
    "webapp-group": { stroke: "#10b981", marker: "url(#arrow-green)" },
    "risks-group": { stroke: "#ef4444", marker: "url(#arrow-red)" }
  };
  for (const group of groups) {
    const style = EDGE[group.type];
    builtEdges.push({
      id: `e-target-${group.type}`,
      source: "target",
      target: group.type,
      animated: true,
      markerEnd: style.marker,
      style: { stroke: style.stroke, strokeWidth: 2.5 }
    });
  }

  // The children.
  const children = [];
  if (apis && apis.length > 0) {
    const byMethods = new Map();
    for (const api of apis) {
      const key = api.methods && api.methods.length ? [...api.methods].sort().join(",") : "UNKNOWN";
      if (!byMethods.has(key)) byMethods.set(key, []);
      byMethods.get(key).push(api);
    }
    [...byMethods.entries()]
      .sort((a, b) => {
        const left = a[0].split(",")[0] || "UNKNOWN";
        const right = b[0].split(",")[0] || "UNKNOWN";
        return (METHOD_ORDER[left] || 99) - (METHOD_ORDER[right] || 99);
      })
      .forEach(([key, group], index) => {
        children.push({
          type: "api-method-group",
          id: `api-method-group-${index}`,
          sourceId: "apis-group",
          sourceY: sourceY["apis-group"],
          data: { group: { methods: key === "UNKNOWN" ? ["UNKNOWN"] : key.split(","), apis: group } }
        });
      });
  }

  if (webApp && Object.keys(webApp).length > 0) {
    if (webApp.web_technologies?.length && webApp.web_technologies[0] !== "-") {
      children.push({
        type: "web-technologies",
        id: "web-technologies",
        sourceId: "webapp-group",
        sourceY: sourceY["webapp-group"],
        data: { technologies: webApp.web_technologies }
      });
    }
    if (webApp.tls?.subject && webApp.tls.subject !== "-") {
      children.push({
        type: "tls",
        id: "tls",
        sourceId: "webapp-group",
        sourceY: sourceY["webapp-group"],
        data: { tls: webApp.tls }
      });
    }
    if (webApp.security_http_headers?.length) {
      children.push({
        type: "security-headers",
        id: "security-headers",
        sourceId: "webapp-group",
        sourceY: sourceY["webapp-group"],
        data: { headers: webApp.security_http_headers }
      });
    }
    if (webApp.sensitive_paths?.length) {
      children.push({
        type: "sensitive-paths",
        id: "sensitive-paths",
        sourceId: "webapp-group",
        sourceY: sourceY["webapp-group"],
        data: { paths: webApp.sensitive_paths }
      });
    }
  }

  if (risks && risks.length > 0 && sourceY["risks-group"] !== undefined) {
    const bySeverity = new Map();
    for (const risk of risks) {
      const severity = (risk.severity || risk.risk_level || "medium").toLowerCase();
      if (!bySeverity.has(severity)) bySeverity.set(severity, []);
      bySeverity.get(severity).push(risk);
    }
    for (const severity of SEVERITIES) {
      const group = bySeverity.get(severity) || [];
      if (!group.length) continue;
      children.push({
        type: "risk-severity-group",
        id: `risk-severity-group-${severity}`,
        sourceId: "risks-group",
        sourceY: sourceY["risks-group"],
        data: { group: { severities: [severity.toUpperCase()], risks: group } }
      });
    }
  }

  if (children.length > 0) {
    const sized = children.map((child) => {
      let height = 200;
      if (child.type === "api-method-group") height = child.data.group?.apis ? 146 : 150;
      else if (child.type === "risk-severity-group") height = 146;
      else if (child.type === "web-technologies") height = technologiesHeight(child.data.technologies);
      else if (child.type === "tls") height = tlsHeight(child.data.tls);
      else if (child.type === "security-headers") height = headersHeight(child.data.headers);
      else if (child.type === "sensitive-paths") height = pathsHeight(child.data.paths);
      return { ...child, height: Math.min(height, 600) };
    });

    const CHILD_GAP = 100;
    const total = sized.reduce((sum, child) => sum + child.height, 0) + (sized.length - 1) * CHILD_GAP;
    const anchors = sized.map((child) => ({ y: child.sourceY, height: 66 }));
    const top = Math.min(...anchors.map((entry) => entry.y));
    const bottom = Math.max(...anchors.map((entry) => entry.y + entry.height));
    let cursorY = (top + bottom) / 2 - total / 2;

    for (const child of sized) {
      built.push({
        id: child.id,
        type: child.type,
        position: { x: 1300, y: cursorY },
        data: child.data
      });
      const isApi = child.type === "api-method-group";
      const isRisk = child.type === "risk-severity-group";
      builtEdges.push({
        id: `e-${child.sourceId}-${child.id}`,
        source: child.sourceId,
        target: child.id,
        animated: true,
        markerEnd: isApi ? "url(#arrow-purple)" : isRisk ? "url(#arrow-red)" : "url(#arrow-green)",
        style: {
          stroke: isApi ? "#8b5cf6" : isRisk ? "#ef4444" : "#10b981",
          strokeWidth: 2.5
        }
      });
      cursorY += child.height + CHILD_GAP;
    }
  }

  nodes.value = built;
  edges.value = builtEdges;
}

async function reload() {
  const projectId = projectStore.currentProject?.id;
  if (!projectId) return;
  await overviewStore.load(projectId);
  const risks = ((await window.dbAPI.getRiskItems(projectId)) || []).filter(
    (item) => item.status !== "ignored"
  );
  build(overviewStore.overView, risks);
  await nextTick();
  setTimeout(() => {
    fitView({ padding: 0.15, duration: 600, includeHiddenNodes: false, minZoom: 0.2, maxZoom: 1.5 });
  }, 300);
}

onMounted(reload);
watch(() => projectStore.currentProject?.id, reload);
</script>

<template>
  <div class="threat-map-container">
    <svg class="arrow-defs" width="0" height="0">
      <defs>
        <marker id="arrow-purple" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill="#8b5cf6" />
        </marker>
        <marker id="arrow-green" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill="#10b981" />
        </marker>
        <marker
          id="arrow-blue"
          markerWidth="12.5"
          markerHeight="12.5"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 6 L 0 12 z" fill="#3b82f6" />
        </marker>
        <marker
          id="arrow-green"
          markerWidth="12.5"
          markerHeight="12.5"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 6 L 0 12 z" fill="#10b981" />
        </marker>
        <marker
          id="arrow-purple"
          markerWidth="12.5"
          markerHeight="12.5"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 6 L 0 12 z" fill="#8b5cf6" />
        </marker>
        <marker
          id="arrow-red"
          markerWidth="12.5"
          markerHeight="12.5"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 6 L 0 12 z" fill="#ef4444" />
        </marker>
      </defs>
    </svg>

    <VueFlow
      :nodes="nodes"
      :edges="edges"
      fit-view-on-init
      :min-zoom="0.2"
      :max-zoom="2"
      class="scan-flow"
    >
      <Background :gap="20" :size="1" pattern-color="var(--border)" />
      <Controls :show-interactive="false" />

      <template #node-target="props">
        <div class="map-node target-node">
          <div class="node-title">{{ t("mapping.目标") }}</div>
          <div class="node-row">
            <span class="node-label">{{ t("mapping.目标") }}</span>
            <span class="node-value">{{ props.data.target.target || "—" }}</span>
          </div>
          <div class="node-row">
            <span class="node-label">{{ t("mapping.类型") }}</span>
            <span class="node-value">{{ props.data.target.target_type || "—" }}</span>
          </div>
          <div
            v-if="props.data.network.waf_or_cdn && props.data.network.waf_or_cdn.length"
            class="node-row"
          >
            <span class="node-label">{{ t("mapping.WAF/CDN检测") }}</span>
            <span class="node-value">{{ props.data.network.waf_or_cdn.join(", ") }}</span>
          </div>
        </div>
      </template>

      <template #node-apis-group="props">
        <div class="map-node group-node purple">
          <div class="node-title">{{ props.data.label }}</div>
          <div class="node-count">{{ props.data.count }}</div>
          <div class="node-subtitle">{{ t("mapping.接口") }}</div>
        </div>
      </template>

      <template #node-api-method-group="props">
        <div class="map-node child-node purple">
          <div class="node-title">{{ t("mapping.接口列表") }}</div>
          <div class="node-chips">
            <span v-for="method in props.data.group.methods" :key="method" class="chip">
              {{ method }}
            </span>
          </div>
          <div class="node-list">
            <div
              v-for="(api, index) in props.data.group.apis"
              :key="index"
              class="node-list-item"
            >
              <div class="api-head">
                <span class="api-path">{{ pathOnly(api.path || api.url) }}</span>
                <span class="api-auth" :class="{ required: api.auth_required }">
                  {{ api.auth_required ? t("mapping.需要认证") : t("mapping.不需要认证") }}
                </span>
              </div>
              <div v-if="api.description" class="api-description">
                {{ api.description }}
              </div>
              <div
                v-if="api.examples && api.examples.length"
                class="api-examples"
                @click.stop="examplesOpen = !examplesOpen"
              >
                {{ t("mapping.示例") }} ({{ api.examples.length }})
                <div v-if="examplesOpen" class="api-example-list">
                  <div
                    v-for="(example, i) in api.examples"
                    :key="i"
                    class="api-example"
                  >
                    {{ example }}
                  </div>
                </div>
              </div>
              <button class="copy-button" @click.stop="copy(api.path || api.url)">
                {{ t("mapping.复制") }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <template #node-webapp-group="props">
        <div class="map-node group-node green">
          <div class="node-title">{{ props.data.label }}</div>
        </div>
      </template>

      <template #node-web-technologies="props">
        <div class="map-node child-node green">
          <div class="node-title">
            {{ t("mapping.技术栈") }} ({{ props.data.technologies.length }})
          </div>
          <div class="node-chips">
            <span v-for="item in props.data.technologies" :key="item" class="chip">{{ item }}</span>
          </div>
        </div>
      </template>

      <template #node-tls="props">
        <div class="map-node child-node green">
          <div class="node-title">{{ t("mapping.TLS证书") }}</div>
          <div class="tls-info">
            <div
              v-if="props.data.tls.subject && props.data.tls.subject !== '-'"
              class="tls-info-row"
            >
              <div class="info-label">Subject:</div>
              <div class="info-value">{{ props.data.tls.subject }}</div>
            </div>
            <div
              v-if="props.data.tls.issuer && props.data.tls.issuer !== '-'"
              class="tls-info-row"
            >
              <div class="info-label">Issuer:</div>
              <div class="info-value">{{ props.data.tls.issuer }}</div>
            </div>
            <div
              v-if="props.data.tls.san && props.data.tls.san.length"
              class="tls-info-row"
            >
              <div class="info-label">SAN:</div>
              <div class="info-value">{{ props.data.tls.san.join(", ") }}</div>
            </div>
            <div
              v-if="props.data.tls.valid_from && props.data.tls.valid_from !== '-'"
              class="tls-info-row"
            >
              <div class="info-label">Valid From:</div>
              <div class="info-value">{{ props.data.tls.valid_from }}</div>
            </div>
            <div
              v-if="props.data.tls.valid_to && props.data.tls.valid_to !== '-'"
              class="tls-info-row"
            >
              <div class="info-label">Valid To:</div>
              <div class="info-value">{{ props.data.tls.valid_to }}</div>
            </div>
            <div
              v-if="props.data.tls.fingerprint && props.data.tls.fingerprint !== '-'"
              class="tls-info-row"
            >
              <div class="info-label">Fingerprint:</div>
              <div class="info-value">{{ props.data.tls.fingerprint }}</div>
            </div>
          </div>
        </div>
      </template>

      <template #node-security-headers="props">
        <div class="map-node child-node green">
          <div class="node-title">
            {{ t("mapping.安全HTTP头") }}
            <span class="node-count">({{ props.data.headers.length }})</span>
          </div>
          <div class="node-list">
            <div v-for="header in props.data.headers" :key="header.name" class="node-list-item">
              {{ header.name }}: {{ header.value }}
            </div>
          </div>
        </div>
      </template>

      <template #node-sensitive-paths="props">
        <div class="map-node child-node green">
          <div class="node-title">
            {{ t("mapping.敏感路径") }}
            <span class="node-count">({{ props.data.paths.length }})</span>
          </div>
          <div class="node-list">
            <div v-for="path in props.data.paths" :key="path" class="node-list-item">{{ path }}</div>
          </div>
        </div>
      </template>

      <template #node-risks-group="props">
        <div class="map-node group-node red">
          <div class="node-title">{{ props.data.label }}</div>
          <div class="node-count">{{ props.data.count }}</div>
          <div class="node-subtitle">{{ t("mapping.风险列表") }}</div>
        </div>
      </template>

      <template #node-risk-severity-group="props">
        <div class="map-node child-node red">
          <div class="node-title">{{ props.data.group.severities.join(", ") }}</div>
          <div class="node-list">
            <div
              v-for="risk in props.data.group.risks"
              :key="risk.id"
              class="node-list-item"
              :title="risk.description || risk.title || ''"
              @click.stop="toggleRisk(risk)"
            >
              <span class="risk-dot" :class="risk.severity || risk.risk_level" />
              <span v-if="!(risk.severity || risk.risk_level)" class="risk-unknown">
                {{ t("mapping.未知风险") }}
              </span>
              {{ risk.title || risk.name || t("mapping.未知风险") }}
              <div v-if="expandedRisk === risk.id" class="risk-detail">
                <div v-if="risk.affected_target" class="risk-detail-target">
                  {{ risk.affected_target }}
                </div>
                <div v-if="risk.description" class="risk-detail-description">
                  <div class="risk-detail-label">{{ t("mapping.描述") }}:</div>
                  <div class="risk-detail-value">{{ risk.description }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </VueFlow>
  </div>
</template>

<style scoped>
.threat-map-container {
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
}

.arrow-defs {
  position: absolute;
  width: 0;
  height: 0;
}

.map-node {
  border: 1px solid var(--border);
  border-radius: 6px;
  background-color: var(--background);
  padding: 6px 8px;
  font-size: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 180px;
}

.node-title {
  font-weight: 700;
  font-size: 0.8rem;
}

.node-row {
  display: flex;
  gap: 6px;
}

.node-label {
  color: var(--muted);
  flex: 0 0 88px;
}

.node-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-count {
  font-size: 1.1rem;
  font-weight: 700;
}

.node-subtitle {
  font-size: 0.68rem;
  color: var(--muted);
}

.group-node {
  align-items: center;
  text-align: center;
  min-width: 130px;
}

.group-node.purple {
  border-color: #8b5cf6;
}

.group-node.green {
  border-color: #10b981;
}

.group-node.red {
  border-color: #ef4444;
}

.child-node.purple {
  border-left: 3px solid #8b5cf6;
}

.child-node.green {
  border-left: 3px solid #10b981;
}

.child-node.red {
  border-left: 3px solid #ef4444;
}

.node-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.chip {
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.68rem;
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 160px;
  overflow-y: auto;
}

.node-list-item {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
}

.copy-button {
  border: none;
  background: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.68rem;
  margin-left: 4px;
}

.copy-button:hover {
  color: var(--foreground);
}

.risk-unknown {
  color: var(--muted);
}

.api-auth {
  color: var(--muted);
  margin-right: 4px;
}

.api-auth.required {
  color: var(--warning);
}

.risk-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
  background-color: var(--muted);
}

.risk-dot.critical {
  background-color: #ef4444;
}

.risk-dot.high {
  background-color: #f97316;
}

.risk-dot.medium {
  background-color: #eab308;
}

.risk-dot.low {
  background-color: #10b981;
}
</style>
