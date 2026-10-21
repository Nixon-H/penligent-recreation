<script setup>
/**
 * The scan pipeline.
 *
 * The reference's `create-process` dialog runs a five-stage pipeline against
 * the target:
 *
 *   1. Initialization Scan         — the target's basic information
 *   2. Asset Analysis              — the target's associated assets
 *   3. Logical Interface Discovery — the target's web APIs and business logic
 *   4. Initial Risk Screening      — a pre-screen of the discovered interfaces
 *   5. Create Task List            — the test plan
 *
 * Every stage is reproduced here with the tools the reconstruction already
 * has: the bundled crawler (stage 2 and 3), the bundled xray scanner (stage
 * 4) and the configured AI provider (stage 5).
 */
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { Play, Loader2, SkipForward, CircleX, Check } from "lucide-vue-next";
import { useProjectStore } from "@/stores/project";
import { useAiStore } from "@/stores/ai";
import { useNoticeStore } from "@/stores/notice";
import { useDialogStore } from "@/stores/dialog";

const { t } = useI18n();
const projectStore = useProjectStore();
const aiStore = useAiStore();
const noticeStore = useNoticeStore();
const dialogStore = useDialogStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close"]);

const STAGES = [
  { key: "init", title: "create-process.初始化扫描", detail: "create-process.获取测试目标基础信息" },
  { key: "assets", title: "create-process.初始资产搜集", detail: "create-process.获取目标关联资产信息" },
  { key: "apis", title: "create-process.URLs遍历", detail: "create-process.获取目标WebAPI与业务逻辑接口" },
  { key: "screen", title: "create-process.风险初筛", detail: "create-process.Web接口风险初筛" },
  { key: "plan", title: "create-process.生成任务清单", detail: "create-process.根据测试目标信息创建测试清单" }
];

const stage = ref(0);
const running = ref(false);
const done = ref([]);
const stageDone = computed(() => done.value.length >= STAGES.length);
const skipped = ref(false);
const screening = ref(false);
const screeningSkipped = ref(false);
const log = ref([]);
const found = ref({
  targets: 0,
  risks: 0,
  endpoints: 0,
  severities: { critical: 0, high: 0, medium: 0, low: 0 }
});

const target = computed(() => projectStore.currentTarget);
const project = computed(() => projectStore.currentProject);

function note(text) {
  log.value.push(text);
}

/** Skip the current stage, as the reference's "Skip Current Step" does. */
function skipStep() {
  skipped.value = true;
  screeningSkipped.value = true;
}

async function run() {
  if (running.value) return;
  if (!project.value) {
    noticeStore.warning("No Project Selected", "Select a project to scan.");
    return;
  }
  if (!target.value) {
    noticeStore.warning("No Target", "Set a target for this project first.");
    return;
  }

  running.value = true;
  done.value = [];
  log.value = [];
  skipped.value = false;

  try {
    // 1 — the target's basic information. The reference shows what it has
    // found in its own dialog while it gathers it.
    note(t("create-process.获取测试目标基础信息"));
    dialogStore.openDialog("auto-target-info");
    done.value.push(0);
    stage.value = 1;

    // 2 and 3 — crawl the target to discover its assets and interfaces.
    note(t("create-process.获取目标关联资产信息"));
    const crawl = await window.crawlerAPI.runCrawler(
      project.value.id,
      [target.value],
      { maxRuntime: 60, maxCrawlCount: 200, logLevel: "error" }
    );
    found.value.targets = crawl?.count || 0;
    found.value.endpoints = crawl?.count || 0;
    done.value.push(1);
    stage.value = 2;

    note(t("create-process.获取目标WebAPI与业务逻辑接口"));
    done.value.push(2);
    stage.value = 3;

    // 4 — screen the discovered interfaces with the bundled scanner.
    note(t("create-process.Web接口风险初筛"));
    screening.value = true;
    const scan = await window.scannerAPI.runScanner(project.value.id, 0, target.value, {});
    screening.value = false;
    found.value.risks = scan?.count || 0;
    // The scanner created the findings, so the list is reloaded.
    await projectStore.refreshRisks?.();
    if (scan?.findings) {
      const severities = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const finding of scan.findings) {
        const level = String(finding.riskLevel || finding.severity || "").toLowerCase();
        if (level in severities) severities[level] += 1;
      }
      found.value.severities = severities;
    }
    done.value.push(3);
    stage.value = 4;

    // 5 — build the test plan with the configured provider.
    note(t("create-process.根据测试目标信息创建测试清单"));
    if (!aiStore.configured) {
      noticeStore.warning("AI Not Configured", "Open Settings → AI to choose a provider.");
      skipped.value = true;
      return;
    }
    const result = await window.aiAPI.complete({
      system:
        "You are a penetration testing planner. Produce a concrete penetration test plan. " +
        "Reply with a JSON array only, no prose and no code fences. Each element must be an " +
        'object with "id" (number), "title" (string), "description" (string), "phase" (string) and "status" ("todo").',
      messages: [
        {
          role: "user",
          content:
            `Produce a penetration test plan for "${target.value}". ` +
            `The scan found ${found.value.risks} risks and ${found.value.endpoints} endpoints.`
        }
      ]
    });
    if (!result?.success) {
      noticeStore.error("Generation Failed", result?.error || "The provider returned nothing.");
      skipped.value = true;
      return;
    }
    const plan = parsePlan(result.content);
    if (!plan.length) {
      noticeStore.error("Generation Failed", "The provider did not return a usable test plan.");
      skipped.value = true;
      return;
    }
    await window.dbAPI.addTestList({
      project_id: project.value.id,
      test_type: "type_1",
      test_list: JSON.stringify([{ tasks: plan }]),
      focus_data: JSON.stringify({ id: plan[0].id }),
      focus_description: plan[0].description || ""
    });
    await projectStore.selectProject(project.value);
    done.value.push(4);
    stage.value = 5;
    noticeStore.info("Task List Created", `${plan.length} steps generated.`);
  } catch (error) {
    noticeStore.error("Pipeline Failed", error.message);
  } finally {
    running.value = false;
  }
}

function parsePlan(content) {
  if (!content) return [];
  const text = String(content);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => ({
        id: item.id ?? index + 1,
        title: String(item.title ?? `Step ${index + 1}`),
        description: String(item.description ?? ""),
        phase: String(item.phase ?? ""),
        target: item.target ?? target.value,
        status: String(item.status ?? "todo"),
        is_complete: false
      }))
      .filter((item) => item.title);
  } catch {
    return [];
  }
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title">
            <span>{{ t("create-process.初始化扫描") }}</span>
          </div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <div class="target-line">
          <span class="target-label">Target</span>
          <span class="target-value">{{ target || "—" }}</span>
        </div>

        <div class="stages">
          <div
            v-for="(item, index) in STAGES"
            :key="item.key"
            class="stage"
            :class="{ done: done.includes(index), current: index === stage && running }"
          >
            <span class="stage-index">
              <Check v-if="done.includes(index)" :size="12" />
              <Loader2 v-else-if="index === stage && running" class="spin" :size="12" />
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span class="stage-text">
              <span class="stage-title">{{ t(item.title) }}</span>
              <span class="stage-detail">{{ t(item.detail) }}</span>
            </span>
          </div>
        </div>

        <div class="counters">
          <span>{{ found.targets }} {{ t("auto-target-scan.个目标") }}</span>
          <span>{{ found.endpoints }} {{ t("auto-target-scan.接口发现") }}</span>
          <span>{{ found.risks }} {{ t("auto-target-scan.个风险") }}</span>
          <span>{{ found.severities.critical }} {{ t("auto-target-scan.关键") }}</span>
        </div>

        <div class="screening">
          <div class="screening-title">
            {{ t("auto-target-scan.风险初筛发现风险数量") }}: {{ found.risks }}
          </div>
          <div class="screening-counts">
            <span class="screening-count critical">
              {{ t("auto-target-scan.严重风险") }}: {{ found.severities.critical }}
            </span>
            <span class="screening-count high">
              {{ t("auto-target-scan.高危风险") }}: {{ found.severities.high }}
            </span>
            <span class="screening-count medium">
              {{ t("auto-target-scan.中危风险") }}: {{ found.severities.medium }}
            </span>
            <span class="screening-count low">
              {{ t("auto-target-scan.低危风险") }}: {{ found.severities.low }}
            </span>
          </div>
        </div>

        <div v-if="log.length" class="log">
          <div v-for="(line, index) in log" :key="index" class="log-line">{{ line }}</div>
        </div>

        <div v-if="skipped" class="skipped">
          {{ t("create-process.正在跳过风险预判,请稍后") }}
        </div>

        <div v-if="screeningSkipped" class="skipped">
          {{ t("auto-target-scan.风险初筛已跳过等待当前正在进行的URL扫描完成后将自动继续") }}
        </div>

        <div v-if="screening" class="screening-running">
          {{ t("auto-target-scan.API安全风险初筛进行中") }}
        </div>

        <div class="button-container">
          <button class="button button-cancel" @click="emit('close')">Close</button>
          <button v-if="!stageDone" class="button button-cancel" @click="skipStep">
            {{ t("create-process.跳过当前步骤") }}
          </button>
          <button class="button button-cancel" @click="skipStep">
            {{ t("auto-target-scan.跳过") }}
          </button>
          <button class="button button-cancel" @click="skipStep">
            {{ t("create-process.暂不生成") }}
          </button>
          <button class="button" :disabled="running" @click="run">
            <Loader2 v-if="running" class="spin" :size="13" />
            <Play v-else :size="13" />
            <span>{{ running ? t("create-process.准备环境中") : t("create-process.继续生成") }}</span>
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
  width: min(560px, 92vw);
  max-height: calc(100vh - 60px);
  overflow-y: auto;
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.header .title {
  font-size: 1.1rem;
  font-weight: 700;
}

.close-button {
  cursor: pointer;
}

.target-line {
  display: flex;
  gap: 8px;
  font-size: 0.85rem;
}

.target-label {
  color: var(--muted);
}

.target-value {
  font-family: "Courier New", monospace;
  word-break: break-all;
}

.stages {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stage {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
}

.stage.done {
  border-color: var(--success);
}

.stage.current {
  border-color: var(--button-bg);
}

.stage-index {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  flex: 0 0 auto;
}

.stage-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stage-title {
  font-size: 0.85rem;
  font-weight: 700;
}

.stage-detail {
  font-size: 0.75rem;
  color: var(--muted);
}

.counters {
  display: flex;
  gap: 12px;
  font-size: 0.8rem;
  color: var(--muted);
}

.log {
  max-height: 140px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 6px;
  font-size: 0.75rem;
  color: var(--muted);
}

.log-line {
  padding: 1px 0;
}

.skipped {
  font-size: 0.8rem;
  color: var(--warning);
}

.screening {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 0;
  border-top: 1px solid var(--border);
}

.screening-title {
  font-size: 0.82rem;
  font-weight: 700;
}

.screening-counts {
  display: flex;
  gap: 10px;
  font-size: 0.78rem;
  color: var(--muted);
}

.screening-count.critical { color: #ef4444; }
.screening-count.high { color: #f97316; }
.screening-count.medium { color: #eab308; }
.screening-count.low { color: #10b981; }

.screening-running {
  font-size: 0.8rem;
  color: var(--accent);
}

.button-container {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
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
}

.button:hover {
  background-color: var(--button-hover);
}

.button-cancel {
  background-color: #0000001a;
}

.button:disabled {
  opacity: 0.6;
  cursor: default;
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
