<script setup>
/**
 * Target overview.
 *
 * The reference's view reads the `overview` store directly and lays it out
 * as a set of labelled sections. The section order, the labels and the
 * two-column label/value rows are reproduced here; the values come from
 * what the local tools established, and are left empty where this build
 * cannot determine them.
 */
import { ref, computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Target, Globe, ShieldCheck, Loader2, KeyRound } from "lucide-vue-next";
import { useOverviewStore } from "@/stores/overview";
import { useProjectStore } from "@/stores/project";

const { t } = useI18n();
const overviewStore = useOverviewStore();
const projectStore = useProjectStore();

const overview = computed(() => overviewStore.overView);
const loading = computed(() => overviewStore.getTargetInfoStatus);

const CONTEXT_FIELDS = [
  { key: "purpose", label: "overview.业务背景与应用目的" },
  { key: "scope", label: "overview.测试范围与方法偏好" },
  { key: "assets", label: "overview.关键资产与高价值目标" },
  { key: "history", label: "overview.已知问题与历史发现" },
  { key: "compliance", label: "overview.合规要求" }
];

const credentials = ref([]);
const headers = ref([]);
const context = ref({});

/**
 * The last update.
 *
 * The reference formats the project's `updated_at` with dayjs and shows
 * "Invalid Date" when it is missing.
 */
/**
 * What the target is.
 *
 * The reference asks its target tools what kind of input the target is, what
 * it resolves back to and which of its ports answer, and shows the answers in
 * this panel.
 */
const targetInfo = ref(null);

async function inspectTarget() {
  const target = projectStore.currentProject?.project_target;
  if (!target) return;
  const api = window.targetToolsAPI;
  if (!api) return;
  const [kind, reverse] = await Promise.all([
    api.detectInputType(target).catch(() => null),
    api.reverseIP(target).catch(() => null)
  ]);
  targetInfo.value = {
    type: kind?.type || "",
    valid: kind?.valid ?? false,
    version: kind?.version || "",
    hostnames: reverse?.hostnames || [],
    primary: reverse?.primary || ""
  };
}

const updatedAt = computed(() => {
  const project = projectStore.currentProject;
  const stamp = project?.updated_at;
  if (!stamp) return "Invalid Date";
  const date = new Date(Number(stamp) * 1000);
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
});

/**
 * The detail of a host.
 *
 * The reference opens one when a subdomain is picked.
 */
const hostDetail = ref(null);

function openHost(ip) {
  hostDetail.value = {
    subdomain: ip,
    protocol: "http",
    statusCode: "",
    ip
  };
}

function value(text) {
  return String(text ?? "").trim();
}

async function load() {
  const projectId = projectStore.currentProject?.id;
  if (!projectId) return;
  await overviewStore.load(projectId);
  credentials.value = (await window.dbAPI.getProjectAuthParameters(projectId)) || [];
  headers.value = (await window.dbAPI.getProjectHeaderParameters(projectId)) || [];
  const remarks = (await window.dbAPI.getProjectRemarks(projectId)) || [];
  const row = remarks[0] || {};
  context.value = {
    purpose: row.background || "",
    scope: row.range || "",
    assets: row.assets || "",
    history: row.history || "",
    compliance: row.compliance || ""
  };
}

onMounted(async () => {
  await load();
  await inspectTarget();
});

watch(() => projectStore.currentProject?.id, async () => {
  await load();
  await inspectTarget();
});
</script>

<template>
  <div class="overview-container">
    <div class="overview-header">
      <div>{{ t("overview.最后更新") }}</div>
      <div>{{ updatedAt }}</div>
    </div>

    <!-- The reference shows the body only once the target information has
         been gathered; while it is being gathered the view carries nothing
         but the last-updated row. -->
    <template v-if="!loading">

    <div v-if="hostDetail" class="section host-detail">
      <div class="row">
        <div class="label">{{ t("overview.子域名") }}:</div>
        <div class="value">{{ hostDetail.subdomain }}</div>
      </div>
      <div class="row">
        <div class="label">{{ t("overview.协议") }}:</div>
        <div class="value">{{ hostDetail.protocol }}</div>
      </div>
      <div class="row">
        <div class="label">{{ t("overview.状态码") }}:</div>
        <div class="value">{{ hostDetail.statusCode }}</div>
      </div>
      <div class="row">
        <div class="label">{{ t("overview.IP地址列表") }}:</div>
        <div class="value">{{ hostDetail.ip }}</div>
      </div>
    </div>

    <!-- Target info -->
    <div class="section">
      <div class="section-title">
        <Target :size="16" />
        <span>{{ t("overview.目标信息") }}</span>
      </div>
      <div class="grid">
        <div class="row">
          <div class="label">{{ t("overview.测试目标") }}</div>
          <div class="value">{{ value(overview.target.target) }}</div>
        </div>
        <div class="row">
          <div class="label">{{ t("overview.目标类型") }}</div>
          <div class="value">
            {{ value(overview.target.target_type) }}
            <span v-if="targetInfo?.type" class="target-tool-result">
              ({{ targetInfo.type }}<template v-if="targetInfo.version">/{{ targetInfo.version }}</template>)
            </span>
          </div>
        </div>
        <div v-if="targetInfo?.primary" class="row">
          <div class="label">{{ t("overview.反向DNS") }}</div>
          <div class="value">{{ targetInfo.primary }}</div>
        </div>
        <div class="row">
          <div class="label">{{ t("overview.地理位置") }}</div>
          <div class="value">{{ value(overview.target.location.geo) }}</div>
        </div>
        <div class="row">
          <div class="label">{{ t("overview.云服务器") }}</div>
          <div class="value">{{ value(overview.target.location.cloud_provider) }}</div>
        </div>
        <div class="row">
          <div class="label">{{ t("overview.区域") }}</div>
          <div class="value">{{ value(overview.target.location.region) }}</div>
        </div>
        <div class="row">
          <div class="label">{{ t("overview.ASN") }}</div>
          <div class="value">{{ value(overview.target.location.asn) }}</div>
        </div>
        <div class="row">
          <div class="label">{{ t("overview.子网") }}</div>
          <div class="value">{{ value(overview.target.location.subnet) }}</div>
        </div>
        <div class="row column">
          <div class="label">{{ t("overview.IP地址列表") }}</div>
          <div class="value">
            <div
              v-for="ip in overview.target.identifiers.ips_list"
              :key="ip"
              class="item-content-text"
            >
              {{ ip }}
            </div>
          </div>
        </div>
        <div class="row column">
          <div class="label">{{ t("overview.域名列表") }}</div>
          <div class="value">
            <div
              v-for="domain in overview.target.identifiers.domains_list"
              :key="domain"
              class="item-content-text"
            >
              {{ domain }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Network info -->
    <div class="section">
      <div class="section-title">
        <Globe :size="16" />
        <span>{{ t("overview.网络信息") }}</span>
      </div>

      <div class="subsection">
        <div class="subsection-title">{{ t("overview.开放端口与服务") }}</div>
        <div
          v-for="entry in overview.network.open_ports_services"
          :key="entry.ip"
          class="port-container"
        >
          <div v-if="entry.ports && entry.ports.length" class="port-group">
            <div class="port-ip">ip:{{ entry.ip }}</div>
            <div v-for="port in entry.ports" :key="port.port" class="network-item">
              <div class="network-item-head">
                <div v-if="port.port" class="network-item-port">{{ port.port }}</div>
                <div v-if="port.proto" class="network-item-proto">{{ port.proto }}</div>
                <div v-if="port.state" class="network-item-state">{{ port.state }}</div>
              </div>
              <div v-if="port.service" class="network-item-row">
                <div class="network-item-label">{{ t("overview.服务") }}：</div>
                <div class="network-item-value">{{ port.service }}</div>
              </div>
              <div v-if="port.version" class="network-item-row">
                <div class="network-item-label">{{ t("overview.版本") }}：</div>
                <div class="network-item-value">{{ port.version }}</div>
              </div>
              <div v-if="port.banner" class="network-item-row">
                <div class="network-item-label">{{ t("overview.Banner") }}：</div>
                <div class="network-item-value">{{ port.banner }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="subsection">
        <div class="subsection-title">{{ t("overview.DNS记录") }}</div>
        <div class="network-tags">
          <span
            v-for="(record, index) in overview.network.dns_records"
            :key="index"
            class="network-tag"
          >
            {{ record }}
          </span>
        </div>
      </div>

      <div class="subsection">
        <div class="subsection-title">{{ t("overview.反向DNS") }}</div>
        <div class="network-tags">
          <span
            v-for="(record, index) in overview.network.reverse_dns"
            :key="index"
            class="network-tag"
          >
            {{ record }}
          </span>
        </div>
      </div>

      <div class="subsection">
        <div class="subsection-title">{{ t("overview.WAF/CDN检测") }}</div>
        <div class="grid">
          <div class="row">
            <div class="value">{{ value(overview.network.waf_or_cdn.join(", ")) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Web app info -->
    <div class="section">
      <div class="section-title">
        <ShieldCheck :size="16" />
        <span>{{ t("overview.Web应用信息") }}</span>
      </div>

      <div class="subsection">
        <div class="subsection-title">{{ t("overview.识别到的技术栈") }}</div>
        <div class="chip-row">
          <span v-for="item in overview.web_app.web_technologies" :key="item" class="chip">{{ item }}</span>
        </div>
      </div>

      <div class="subsection">
        <div class="subsection-title">{{ t("overview.TLS证书信息") }}</div>
        <div class="grid">
          <div class="row">
            <div class="label">{{ t("overview.主题") }}:</div>
            <div class="value">{{ value(overview.web_app.tls.subject) }}</div>
          </div>
          <div class="row">
            <div class="label">{{ t("overview.签发者") }}:</div>
            <div class="value">{{ value(overview.web_app.tls.issuer) }}</div>
          </div>
          <div class="row">
            <div class="label">{{ t("overview.生效时间") }}:</div>
            <div class="value">{{ value(overview.web_app.tls.valid_from) }}</div>
          </div>
          <div class="row">
            <div class="label">{{ t("overview.到期时间") }}:</div>
            <div class="value">{{ value(overview.web_app.tls.valid_to) }}</div>
          </div>
          <div class="row">
            <div class="label">{{ t("overview.指纹") }}:</div>
            <div class="value">{{ value(overview.web_app.tls.fingerprint) }}</div>
          </div>
          <div class="row column">
            <div class="label">{{ t("overview.SAN列表") }}:</div>
            <div class="value">
              <div v-for="name in overview.web_app.tls.san" :key="name" class="item-content-text">{{ name }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="subsection">
        <div class="subsection-title">{{ t("overview.安全响应头") }}</div>
        <div class="grid">
          <div v-for="header in overview.web_app.security_http_headers" :key="header.name" class="row">
            <div class="label">{{ header.name }}</div>
            <div class="value">{{ header.value }}</div>
          </div>
        </div>
      </div>

      <div class="subsection">
        <div class="subsection-title">{{ t("overview.敏感路径") }}</div>
        <div class="value">
          <div v-for="path in overview.web_app.sensitive_paths" :key="path" class="item-content-text">
            {{ path }}
          </div>
        </div>
      </div>

      <div class="subsection">
        <div class="subsection-title">
          {{ t("overview.API接口") }}
        </div>
        <div class="api-count">({{ overview.apis.length }})</div>
        <div class="api-list">
          <div v-for="(api, index) in overview.apis" :key="index" class="api-item">
            <div class="api-head">
              <span class="api-url">{{ api.path }}</span>
              <span
                v-for="method in api.methods"
                :key="method"
                class="api-method"
              >
                {{ method }}
              </span>
              <span class="api-auth" :class="{ required: api.auth_required }">
                {{ api.auth_required ? t("overview.需要认证") : t("overview.不需要认证") }}
              </span>
            </div>
            <div v-if="api.description" class="api-description">
              {{ api.description }}
            </div>
            <div v-if="api.examples && api.examples.length" class="api-example">
              <span class="api-example-label">{{ t("overview.示例") }}:</span>
              <div v-for="(example, i) in api.examples" :key="i" class="api-example-value">
                {{ example }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pre-filled info -->
    <div class="section">
      <div class="section-title">
        <KeyRound :size="16" />
        <span>{{ t("overview.预置信息") }}</span>
      </div>
      <div class="grid">
        <div v-for="(item, index) in credentials" :key="`c-${index}`" class="row">
          <div class="label">{{ t("overview.认证凭证") }}</div>
          <div class="value">{{ item.username }} {{ item.description }}</div>
        </div>
        <div v-for="(item, index) in headers" :key="`h-${index}`" class="row">
          <div class="label">{{ t("overview.自定义请求头") }}</div>
          <div class="value">{{ item.header_value }}</div>
        </div>
      </div>
    </div>

    <!-- Intelligence and context -->
    <div class="section">
      <div class="grid">
        <div
          v-for="field in CONTEXT_FIELDS"
          :key="field.key"
          class="row column"
          v-show="context[field.key]"
        >
          <div class="label">{{ t(field.label) }}</div>
          <div class="value">{{ context[field.key] }}</div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<style scoped>
.overview-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 10px 12px;
  box-sizing: border-box;
}

.overview-header {
  display: flex;
  gap: 10px;
  font-size: 0.8rem;
  color: var(--muted);
}

.loading-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: var(--muted);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.95rem;
  font-weight: 700;
}

.subsection {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.subsection-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--muted);
}

.grid {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.row {
  display: flex;
  gap: 8px;
  font-size: 0.8rem;
}

.row.column {
  flex-direction: column;
  gap: 2px;
}

.label {
  flex: 0 0 140px;
  color: var(--muted);
}

.value {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.prefilled-actions {
  display: flex;
  gap: 5px;
}

.mini-button {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.75rem;
}

.ip-item {
  cursor: pointer;
}

.ip-item:hover {
  color: var(--accent);
}

.host-detail {
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
}

.target-tool-result {
  color: var(--accent);
  font-size: 0.72rem;
}

.item-content-text {
  font-size: 0.78rem;
  padding: 1px 0;
}

.chip-row {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.chip {
  padding: 1px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.72rem;
}

.port-entry {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.data-table th,
.data-table td {
  border: 1px solid var(--border);
  padding: 3px 6px;
  text-align: left;
}

.data-table th {
  background-color: var(--border);
  font-weight: 700;
}

.api-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.api-item {
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 5px 7px;
}

.api-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.78rem;
}

.api-method {
  font-weight: 700;
  color: var(--accent);
}

.api-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-auth {
  font-size: 0.7rem;
  color: var(--muted);
}

.api-auth.required {
  color: var(--warning);
}

.api-example {
  display: flex;
  gap: 5px;
  font-size: 0.72rem;
  color: var(--muted);
  margin-top: 2px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
