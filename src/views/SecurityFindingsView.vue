<script setup>
/**
 * Security findings.
 *
 * Markup and styling reproduced from the reference renderer:
 *
 *   .risk-container
 *     .nav-container
 *       .nav-item[.active] × 7   (All / Critical / High / Medium / Low / INFO / Ignored)
 *     .content-container
 *       .risk-item-empty         ("No risks found." when there are no findings)
 */
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { Play, Ban, RotateCcw, ShieldQuestion, Download } from "lucide-vue-next";
import { useProjectStore } from "@/stores/project";
import { useNoticeStore } from "@/stores/notice";
import { useDialogStore } from "@/stores/dialog";
import { useAiStore } from "@/stores/ai";

const { t } = useI18n();
const projectStore = useProjectStore();
const noticeStore = useNoticeStore();
const dialogStore = useDialogStore();
const aiStore = useAiStore();

/**
 * The filters.
 *
 * The reference labels them with the locale keys; "All" and "INFO" are the
 * same in every language.
 */
const FILTERS = [
  { key: "all", label: "risk.全部" },
  { key: "critical", label: "risk.严重" },
  { key: "high", label: "risk.高危" },
  { key: "medium", label: "risk.中危" },
  { key: "low", label: "risk.低危" },
  { key: "info", label: "center.INFO" },
  { key: "ignored", label: "risk.忽略" }
];
const activeFilter = ref("all");

/**
 * The verification states.
 *
 * The reference stores them in `verify_status` with these exact values:
 *
 *   open          待手动验证   pending verification
 *   verifing      验证中       verifying
 *   failed        验证失败     verification interrupted
 *   risk_confirm  风险确认     confirmed
 *   risk_exclude  风险排除     not sure
 *   risk_doubt    风险存疑     needs verification
 *   stopped       —            the verification was stopped
 */
const VERIFY_LABELS = {
  open: "risk.待手动验证",
  verifing: "risk.验证中",
  failed: "risk.验证失败",
  risk_confirm: "risk.风险确认",
  risk_exclude: "risk.风险排除",
  risk_doubt: "risk.风险存疑",
  stopped: "risk.停止验证"
};

const verifyLabel = (status) => t(VERIFY_LABELS[status] || "risk.待手动验证");

/**
 * The verifications in flight.
 *
 * The reference runs at most three at a time and says so when the limit is
 * reached.
 */
const verifying = ref([]);
const activeRisk = ref(null);
const expanded = ref(null);

/**
 * Verify a finding.
 *
 * The reference sends the finding and its evidence for verification, takes
 * the model's verdict, records the transcript in `verify_context`, and — when
 * the finding is confirmed — saves the technique to the Skills Library.
 */
async function verify(risk) {
  if (verifying.value.length >= 3) {
    noticeStore.addNotice({
      title: t("notice.验证中"),
      content: t("notice.最多有三个验证同时进行"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  if (verifying.value.find((item) => item.id === risk.id)) {
    noticeStore.addNotice({
      title: t("notice.验证中"),
      content: t("notice.当前风险项正在验证中"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  if (!aiStore.configured) {
    noticeStore.addNotice({
      title: t("notice.错误"),
      content: t("notice.请填写完整的环境配置"),
      type: "error",
      duration: 5000
    });
    dialogStore.openDialog("setting");
    return;
  }

  verifying.value.push(risk);
  risk.verify_status = "verifing";
  await window.dbAPI.updateRiskItemVerifyStatus(risk.id, "verifing");
  noticeStore.addNotice({
    title: t("notice.开始验证"),
    content: risk.title,
    type: "info",
    duration: 5000
  });

  const transcript = String(risk.verify_context || "");
  const prompt = [
    "You are verifying a penetration-test finding. Decide whether it is real.",
    "",
    `Title: ${risk.title || ""}`,
    `Severity: ${risk.severity || ""}`,
    `Target: ${risk.affected_target || ""}`,
    `Description: ${risk.description || ""}`,
    `Evidence: ${risk.evidence || ""}`,
    "",
    'Reply with a JSON object: {"verdict": "risk_confirm" | "risk_exclude" | "risk_doubt",',
    ' "reason": "<why>", "technique": {"title": "", "overview": "", "detection_method": ""}}'
  ].join("\n");

  try {
    const result = await window.aiAPI.complete({
      system:
        "You verify penetration-test findings. You answer only with a JSON object and no prose.",
      messages: [{ role: "user", content: prompt }],
      id: `verify-${risk.id}`,
      taskId: `verify-${risk.id}`
    });
    if (!result?.success) throw new Error(result?.error || "the provider returned nothing");

    const verdict = parseVerdict(result.content);
    risk.verify_status = verdict.verdict;
    risk.verify_context = `${transcript}### Verify Result\n${result.content}\n`;
    await window.dbAPI.updateRiskItemVerifyStatus(risk.id, verdict.verdict);
    await window.dbAPI.updateRiskItemVerifyContext(risk.id, risk.verify_context);
    await window.dbAPI.updateRiskItemVerifyContextHis(risk.id, risk.verify_context);

    if (verdict.verdict === "risk_confirm" && verdict.technique?.title) {
      await window.dbAPI.addTtp({
        title: verdict.technique.title,
        ttp_type: risk.risk_type || "",
        ttp_level: "high",
        ttp_priority: 5,
        overview: verdict.technique.overview || "",
        detection_method: verdict.technique.detection_method || "",
        waf_bypass: "",
        verification: "",
        false_positive: "",
        priority: "",
        notes: ""
      });
      noticeStore.addNotice({
        title: t("notice.TTP保存成功"),
        content: verdict.technique.title,
        type: "info",
        duration: 5000
      });
    }
    noticeStore.info(verifyLabel(verdict.verdict), risk.title);
  } catch (error) {
    risk.verify_status = "failed";
    risk.verify_context = `${transcript}### Verify Failed\n`;
    await window.dbAPI.updateRiskItemVerifyStatus(risk.id, "failed");
    await window.dbAPI.updateRiskItemVerifyContext(risk.id, risk.verify_context);
    noticeStore.addNotice({
      title: t("notice.验证失败"),
      content: t("notice.风险验证失败"),
      type: "error",
      duration: 5000
    });
  } finally {
    verifying.value = verifying.value.filter((item) => item.id !== risk.id);
    await projectStore.selectProject(projectStore.currentProject);
  }
}

/** The verdict the model returned. */
function parseVerdict(content) {
  const text = String(content || "");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      const verdict = ["risk_confirm", "risk_exclude", "risk_doubt"].includes(parsed.verdict)
        ? parsed.verdict
        : "risk_doubt";
      return { verdict, reason: parsed.reason || "", technique: parsed.technique || null };
    } catch {
      /* fall through to the text scan */
    }
  }
  if (/confirm|确认|真实|成立/i.test(text)) return { verdict: "risk_confirm", reason: text };
  if (/exclude|排除|不成立|误报/i.test(text)) return { verdict: "risk_exclude", reason: text };
  return { verdict: "risk_doubt", reason: text };
}

/** Set the verification state the reference's buttons set. */
async function setVerifyStatus(risk, status) {
  if (status === "verifing") {
    await verify(risk);
    return;
  }
  await window.dbAPI.updateRiskItemVerifyStatus(risk.id, status);
  risk.verify_status = status;
  noticeStore.info(verifyLabel(status), risk.title);
}

/**
 * The evidence of a risk.
 *
 * The reference keeps the tool executions that produced the finding and
 * shows them under the risk.
 */
/** The time the finding was raised. */
function riskTime(risk) {
  const stamp = risk?.created_at;
  if (!stamp) return "";
  const date = new Date(Number(stamp) * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The time an execution started. */
function toolTime(tool) {
  const stamp = tool?.created_at || tool?.start_time;
  if (!stamp) return "";
  const date = new Date(Number(stamp) * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The time an execution took, in the reference's four parts. */
function duration(item) {
  const start = Number(item?.created_at ?? item?.start_time ?? 0);
  const end = Number(item?.updated_at ?? item?.end_time ?? 0);
  if (!start || !end || end <= start) {
    const seconds = Number(item?.duration ?? 0);
    return { days: 0, hours: 0, minutes: 0, seconds: seconds || 0 };
  }
  let rest = Math.floor((end - start) / 1000);
  const days = Math.floor(rest / 86400);
  rest -= days * 86400;
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  const seconds = rest - minutes * 60;
  return { days, hours, minutes, seconds };
}

/** Whether an execution took any time at all. */
function hasDuration(item) {
  const parts = duration(item);
  return parts.days > 0 || parts.hours > 0 || parts.minutes > 0 || parts.seconds > 0;
}

/** The evidence list, parsed from the finding's `evidence` column. */
function evidenceList(risk) {
  const raw = risk?.evidence;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * The tool executions behind a finding.
 *
 * The reference assembles them from the `risk_items_execution_results` link
 * table joined with the execution results.
 */
const toolExecutions = ref([]);

async function loadToolExecutions(risk) {
  const projectId = projectStore.currentProject?.id;
  if (!projectId || !risk?.id) {
    toolExecutions.value = [];
    return;
  }
  const links = (await window.dbAPI.getRiskItemsExecutionResults(projectId)) || [];
  const mine = links.filter((link) => link.risk_item_id === risk.id);
  const results = (await window.dbAPI.getExecutionResults(projectId)) || [];
  toolExecutions.value = mine
    .map((link) => results.find((row) => row.id === link.execution_id))
    .filter(Boolean);
}

function toggleExpanded(risk) {
  expanded.value = expanded.value === risk.id ? null : risk.id;
  if (expanded.value) void loadToolExecutions(risk);
  else toolExecutions.value = [];
}

/** Export one risk. The reference opens its export dialog with the risk set. */
function exportRisk(risk) {
  activeRisk.value = risk;
  dialogStore.openDialog("risk-download", { activeRiskItem: risk });
}

/** Record the operator's verdict on a finding. */
async function setLikeStatus(risk, status) {
  // The reference toggles: the same status clears it.
  const next = risk.like_status === status ? "neutral" : status;
  risk.like_status = next;
  await window.dbAPI.updateRiskItemLikeStatus(risk.id, next);
}

/** Stop a verification that is in flight. */
async function stopRiskVerify(risk) {
  await window.aiAPI.stopTask?.(`verify-${risk.id}`);
  risk.verify_status = "stopped";
  await window.dbAPI.updateRiskItemVerifyStatus(risk.id, "stopped");
  verifying.value = verifying.value.filter((item) => item.id !== risk.id);
  noticeStore.info(t("risk.停止验证"), risk.title);
}

async function toggleIgnore(risk) {
  const ignored = isIgnored(risk);
  await window.dbAPI.updateRiskItemIgnoreStatus(risk.id, ignored ? "open" : "ignored");
  risk.status = ignored ? "open" : "ignored";
  risk.ignored_status = risk.status;
  noticeStore.info(
    ignored ? t("risk.取消忽略") : t("risk.已忽略此风险"),
    risk.title
  );
}

/**
 * A finding is ignored when the reference's `ignored_status` says so.
 *
 * The reference maps the finding's `status` column onto `ignored_status`
 * when it loads the list, and its toggle only ever writes "open" or
 * "ignored".
 */
function isIgnored(risk) {
  return (risk.ignored_status ?? risk.status) === "ignored";
}

/**
 * The counters.
 *
 * The reference excludes the ignored findings from every bucket except the
 * ignored one.
 */
const counts = computed(() => {
  const base = { all: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, ignored: 0 };
  for (const risk of projectStore.risks) {
    if (isIgnored(risk)) {
      base.ignored += 1;
      continue;
    }
    base.all += 1;
    const severity = String(risk.severity || "info").toLowerCase();
    if (severity in base) base[severity] += 1;
  }
  return base;
});

const visible = computed(() => {
  const filter = activeFilter.value;
  if (filter === "ignored") return projectStore.risks.filter(isIgnored);
  const live = projectStore.risks.filter((risk) => !isIgnored(risk));
  if (filter === "all") return live;
  return live.filter(
    (risk) => String(risk.severity || "info").toLowerCase() === filter
  );
});
</script>

<template>
  <div class="risk-container">
    <div class="nav-container">
      <div
        v-for="filter in FILTERS"
        :key="filter"
        class="nav-item"
        :class="{ active: activeFilter === filter.key }"
        @click="activeFilter = filter"
      >
        {{ t(filter.label) }}({{ counts[filter.key] }})
      </div>
    </div>

    <div class="content-container">
      <div v-if="visible.length === 0" class="risk-item-empty">
        {{ t("risk.暂无发现的风险") }}
      </div>

      <div
        v-for="risk in visible"
        :key="risk.id"
        class="risk-item"
        :class="`severity-${String(risk.severity || 'info').toLowerCase()}`"
        @click="toggleExpanded(risk)"
      >
        <div class="item-status">
          <span class="status-badge" :class="risk.verify_status || 'open'">
            {{ verifyLabel(risk.verify_status) }}
          </span>
          <span class="status-actions">
            <button
              v-if="risk.verify_status === 'verifing'"
              class="status-action"
              :title="t('risk.停止验证')"
              @click.stop="stopRiskVerify(risk)"
            >
              <Square :size="12" />
            </button>
            <button
              v-else
              class="status-action"
              :title="t('risk.验证')"
              @click.stop="setVerifyStatus(risk, 'verifing')"
            >
              <Play :size="12" />
            </button>
            <button
              v-if="risk.like_status !== 'like' && risk.like_status !== 'dislike'"
              class="like-status-button-item"
              @click.stop="setLikeStatus(risk, 'like')"
            >
              <ThumbsUp :size="15" />
            </button>
            <button
              v-else-if="risk.like_status === 'like'"
              class="like-status-button-item like-status-button-item-active"
              @click.stop="setLikeStatus(risk, 'like')"
            >
              <ThumbsUp :size="15" />
            </button>
            <button
              v-if="risk.like_status !== 'like' && risk.like_status !== 'dislike'"
              class="like-status-button-item"
              @click.stop="setLikeStatus(risk, 'dislike')"
            >
              <ThumbsDown :size="15" />
            </button>
            <button
              v-else-if="risk.like_status === 'dislike'"
              class="like-status-button-item like-status-button-item-active"
              @click.stop="setLikeStatus(risk, 'dislike')"
            >
              <ThumbsDown :size="15" />
            </button>
            <button
              class="status-action"
              :title="t('risk.风险确认')"
              @click.stop="setVerifyStatus(risk, 'risk_confirm')"
            >
              <ShieldQuestion :size="12" />
            </button>
            <button
              class="status-action"
              :title="t('risk.风险排除')"
              @click.stop="setVerifyStatus(risk, 'risk_exclude')"
            >
              <Ban :size="12" />
            </button>
            <button
              class="status-action"
              :title="t('risk.忽略风险')"
              @click.stop="toggleIgnore(risk)"
            >
              <RotateCcw :size="12" />
            </button>
            <button
              class="status-action"
              :title="t('risk-download.导出风险信息')"
              @click.stop="exportRisk(risk)"
            >
              <Download :size="12" />
            </button>
          </span>
        </div>
        <div class="item-header">
          <div class="item-content">
            <div class="item-content-title">
              <span class="item-content-title-name">{{ risk.title }}</span>
              <span
                class="item-content-title-severity"
                :class="`severity-${String(risk.severity || 'info').toLowerCase()}`"
              >
                {{ String(risk.severity || "info").toUpperCase() }}
              </span>
            </div>
            <div class="item-content-description">{{ risk.description }}</div>
            <div class="item-content-target">
              <span class="item-content-target-item">
                {{ risk.affected_target || "—" }}
              </span>
              <span class="item-content-target-time">
                <Clock :size="12" />
                <span class="item-content-target-time-text">{{ riskTime(risk) }}</span>
              </span>
            </div>
            <div class="item-content-hint">
              {{
                risk.status === "ignored" || risk.status === "false_positive"
                  ? t("risk.点击可取消忽略此风险")
                  : t("risk.点击可忽略此风险")
              }}
            </div>
          </div>
        </div>

        <div v-if="expanded === risk.id" class="item-detail">
          <div
            v-if="risk.verify_status && risk.verify_status !== 'open'"
            class="item-detail-section"
          >
            <div class="item-detail-title">{{ t("risk.结果摘要") }}</div>
            <pre v-if="risk.verify_context" class="item-detail-output">{{ risk.verify_context }}</pre>
            <div v-else class="item-detail-empty">{{ t("risk.验证信息为空") }}</div>
          </div>

          <div class="item-detail-section">
            <div class="item-detail-title">{{ t("risk.修复建议") }}</div>
            <pre class="item-detail-output">{{ risk.recommendation || "—" }}</pre>
          </div>

          <div class="item-detail-section">
            <div class="item-detail-title">
              {{ t("risk.风险证据") }}({{ evidenceList(risk).length }})
            </div>
            <div
              v-for="(item, index) in evidenceList(risk)"
              :key="`e-${index}`"
              class="item-detail-entry"
            >
              <div class="item-detail-label">{{ item.title }}</div>
              <div class="item-detail-value">{{ item.description }}</div>
              <pre class="item-detail-output">{{ item.evidence }}</pre>
            </div>
          </div>

          <div class="item-detail-section">
            <div class="item-detail-title">
              {{ t("risk.工具执行结果") }}({{ toolExecutions.length }})
            </div>
            <div
              v-for="(tool, index) in toolExecutions"
              :key="`t-${index}`"
              class="item-detail-entry"
            >
              <div class="item-detail-label">{{ tool.tool_name }}</div>
              <div class="item-detail-time">
                <span>{{ toolTime(tool) }}</span>
                <span
                  v-if="hasDuration(tool)"
                  class="item-detail-duration-label"
                >
                  {{ t("risk.耗时") }}:
                </span>
                <span v-if="duration(tool).days > 0" class="item-detail-duration">
                  {{ duration(tool).days }} {{ t("risk.天") }}
                </span>
                <span v-if="duration(tool).hours > 0" class="item-detail-duration">
                  {{ duration(tool).hours }} {{ t("risk.小时") }}
                </span>
                <span v-if="duration(tool).minutes > 0" class="item-detail-duration">
                  {{ duration(tool).minutes }} {{ t("risk.分钟") }}
                </span>
                <span v-if="duration(tool).seconds > 0" class="item-detail-duration">
                  {{ duration(tool).seconds }} {{ t("risk.秒") }}
                </span>
              </div>
              <div class="item-detail-label">{{ t("risk.执行命令") }}:</div>
              <div class="item-detail-value">{{ tool.command }}</div>
              <div class="item-detail-label">{{ t("risk.结果摘要") }}:</div>
              <div class="item-detail-value">{{ tool.summary }}</div>
              <div class="item-detail-label">{{ t("risk.输出结果") }}:</div>
              <pre class="item-detail-output">{{ tool.result_data || tool.result }}</pre>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.item-content-hint {
  font-size: 0.7rem;
  color: var(--muted);
  margin-top: 3px;
}

.item-detail {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.item-detail-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--muted);
}

.item-detail-entry {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
}

.item-detail-label {
  font-size: 0.75rem;
  color: var(--muted);
}

.item-detail-value {
  font-size: 0.78rem;
  word-break: break-word;
}

.item-detail-output {
  margin: 0;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background-color: var(--frontground);
  font-family: "Courier New", monospace;
  font-size: 0.72rem;
  white-space: pre-wrap;
  max-height: 160px;
  overflow: auto;
}

.item-detail-empty {
  font-size: 0.75rem;
  color: var(--muted);
}

.item-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 3px;
}

.status-badge {
  font-size: 0.68rem;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
}

.status-badge.verifing {
  border-color: var(--warning);
  color: var(--warning);
}

.status-badge.risk_confirm {
  border-color: #ef4444;
  color: #ef4444;
}

.status-badge.risk_exclude {
  border-color: #10b981;
  color: #10b981;
}

.status-actions {
  display: flex;
  gap: 3px;
}

.status-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}

.status-action:hover {
  color: var(--foreground);
  border-color: var(--button-bg);
}

.risk-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.risk-container .nav-container {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 10px 0;
}

.risk-container .nav-container .nav-item {
  padding: 5px 10px;
  cursor: pointer;
  align-items: center;
  white-space: nowrap;
}

.risk-container .nav-container .nav-item:hover {
  background-color: var(--button-hover);
}

.risk-container .nav-container .nav-item:first-child {
  border-radius: 5px 0 0 5px;
}

.risk-container .nav-container .nav-item:last-child {
  border-radius: 0 5px 5px 0;
}

.risk-container .nav-container .active {
  background-color: var(--nav-active-bg);
}

.risk-container .content-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  gap: 10px;
}

.risk-item {
  padding: 10px;
  background-color: var(--background);
  border: 1px solid var(--border);
  border-radius: 6px;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.risk-item .item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.risk-item .item-header .item-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.risk-item .item-header .item-content .item-content-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.risk-item .item-header .item-content .item-content-title .item-content-title-name {
  font-size: 1.2rem;
  font-weight: 700;
}

.risk-item .item-header .item-content .item-content-title .item-content-title-severity {
  padding: 3px 5px;
  border-radius: 5px;
}

.risk-item .item-header .item-content .item-content-title .item-content-title-severity.severity-critical {
  background-color: var(--danger);
}

.risk-item .item-header .item-content .item-content-title .item-content-title-severity.severity-high {
  background-color: var(--warning);
}

.risk-item .item-header .item-content .item-content-title .item-content-title-severity.severity-medium {
  background-color: var(--success);
}

.risk-item .item-header .item-content .item-content-title .item-content-title-severity.severity-low {
  background-color: var(--accent);
}

.risk-item .item-header .item-content .item-content-description {
  color: var(--muted);
  font-size: 0.8rem;
}

.risk-item .item-header .item-content .item-content-target {
  display: flex;
  align-items: center;
  color: var(--muted);
  font-size: 0.8rem;
  gap: 10px;
  flex-wrap: wrap;
}

.risk-item .item-header .item-content .item-content-target .item-content-target-item {
  display: flex;
  align-items: center;
  gap: 2px;
}

.risk-container .content-container .risk-item-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  color: var(--muted);
}
</style>
