<script setup>
/**
 * Task creation.
 *
 * The reference's `task-create` dialog is a four-step wizard with a tab bar:
 *
 *   目标信息 | 输入 | 配置 | 合法验证
 *
 *   1. Target Details        — the domain/IP and the scope
 *   2. Access Setup          — credentials, custom headers and the context
 *   3. Legal Confirmation    — the compliance confirmation
 *   4. Reuse Data            — an existing project for the same target
 *
 * It also carries the test type (nine of them, from GENERIC to AgentScan),
 * the analysis depth, the headless-browser switch and the automatic
 * API-risk screening, which takes about ten minutes.
 *
 * The only thing left out is the sign-in the reference gates the dialog
 * behind.
 */
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";
import { isValidTarget, isSensitiveTarget } from "@/agent/targetChecks";
import { FileText, CircleX, Plus, Trash2, Loader2 } from "lucide-vue-next";
import { useProjectStore } from "@/stores/project";
import { useNoticeStore } from "@/stores/notice";

const { t } = useI18n();
const dialogStore = useDialogStore();
const projectStore = useProjectStore();
const noticeStore = useNoticeStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close"]);

const props = defineProps({
  testType: { type: String, default: "" }
});

const TABS = [
  { key: "target", label: "taskcreate.目标信息" },
  { key: "input", label: "taskcreate.输入" },
  { key: "config", label: "taskcreate.配置" },
  { key: "legal", label: "taskcreate.合法验证" }
];

const STEPS = [
  { title: "taskcreate.step1title", content: "taskcreate.step1content" },
  { title: "taskcreate.step2title", content: "taskcreate.step2content" },
  { title: "taskcreate.step3title", content: "taskcreate.step3content" },
  { title: "taskcreate.step4title", content: "taskcreate.step4content" }
];

const TEST_TYPES = [
  { key: "GENERIC", label: "taskcreate.GENERIC" },
  { key: "Recon", label: "taskcreate.Recon" },
  { key: "Vuln", label: "taskcreate.Vuln" },
  { key: "Auth", label: "taskcreate.Auth" },
  { key: "API", label: "taskcreate.API" },
  { key: "Logic", label: "taskcreate.Logic" },
  { key: "CVE", label: "taskcreate.CVE" },
  { key: "Infra", label: "taskcreate.Infra" },
  { key: "AgentScan", label: "taskcreate.AgentScan" }
];

const DEPTHS = [
  { key: "low", label: "taskcreate.低" },
  { key: "medium", label: "taskcreate.中" },
  { key: "high", label: "taskcreate.高" }
];

const CONTEXT_FIELDS = [
  { key: "purpose", label: "taskcreate.业务背景与应用目的", hint: "taskcreate.此应用程序的作用是什么?处理哪些敏感数据和交易?有哪些最新的变更或新功能?" },
  { key: "scope", label: "taskcreate.测试范围与方法偏好", hint: "taskcreate.应该测试哪些区域?有哪些特定的攻击向量需要关注或避免?测试强度偏好?" },
  { key: "assets", label: "taskcreate.关键资产与高价值目标", hint: "taskcreate.最敏感的组件是什么?如果被破坏会造成最大损害的是什么?" },
  { key: "history", label: "taskcreate.已知问题与历史发现", hint: "taskcreate.最近的安全事件?以前的渗透测试发现?应该重新测试的已知漏洞?" },
  { key: "compliance", label: "taskcreate.合规要求", hint: "taskcreate.报告中必须考虑的合规标准?(SOC 2,PCI DSS,HIPAA,GDPR等)" }
];

const tab = ref("target");
const step = ref(0);
const saving = ref(false);
const reuse = ref(null);

/** The project with the same target, when there is one. */
const reuseProjectId = ref(null);
const showReuse = ref(false);

const form = ref({
  name: "",
  target: "",
  remark: "",
  mode: "Agent",
  testType: props.testType || "GENERIC",
  depth: "medium",
  headless: true,
  autoScreen: true,
  credentials: [],
  headers: [],
  context: Object.fromEntries(CONTEXT_FIELDS.map((field) => [field.key, ""])),
  authorized: false,
  compliant: false
});

watch(
  () => props.testType,
  (value) => {
    if (value) form.value.testType = value;
  }
);

const stepInfo = computed(() => STEPS[step.value]);
const isLast = computed(() => step.value === STEPS.length - 1);

function addCredential() {
  form.value.credentials.push({ username: "", password: "", url: "" });
}

function addHeader() {
  form.value.headers.push({ name: "", value: "" });
}

function removeCredential(index) {
  form.value.credentials.splice(index, 1);
}

function removeHeader(index) {
  form.value.headers.splice(index, 1);
}

function next() {
  if (step.value < STEPS.length - 1) {
    step.value += 1;
    if (STEPS[step.value].title === "taskcreate.step3title") tab.value = "legal";
    if (STEPS[step.value].title === "taskcreate.step2title") tab.value = "input";
  }
}

function back() {
  if (step.value > 0) {
    step.value -= 1;
    if (step.value === 0) tab.value = "target";
    if (step.value === 1) tab.value = "input";
  }
}

/** Use the project that already covers the target. */
async function applyReuse() {
  const project = (await window.dbAPI.getProjects?.())?.find(
    (row) => row.id === reuseProjectId.value
  );
  if (project) {
    await projectStore.selectProject(project);
  }
  showReuse.value = false;
  dialogStore.closeDialog();
}

/** Create a second project for the target anyway. */
function createNew() {
  showReuse.value = false;
  create(true);
}

async function create(skipReuse = false) {
  if (saving.value) return;
  if (!form.value.name.trim()) {
    noticeStore.addNotice({
      title: t("taskcreate.任务名称"),
      content: t("taskcreate.例如：公司官网安全测试"),
      type: "error",
      duration: 5000
    });
    return;
  }
  if (!form.value.target.trim()) {
    noticeStore.addNotice({
      title: t("taskcreate.测试目标"),
      content: t("taskcreate.例如：text"),
      type: "error",
      duration: 5000
    });
    return;
  }
  // The target has to be a domain or an address.
  if (!isValidTarget(form.value.target.trim())) {
    noticeStore.addNotice({
      title: t("notice.目标信息"),
      content: t("notice.目标不符合规则"),
      type: "error",
      duration: 5000
    });
    return;
  }
  if (!form.value.testType) {
    noticeStore.addNotice({
      title: t("notice.测试类型"),
      content: t("notice.请选择测试类型"),
      type: "error",
      duration: 5000
    });
    return;
  }
  // A target that belongs to a government address has to be cleared first.
  if (!(await isSensitiveTarget(form.value.target.trim()))) {
    noticeStore.addNotice({
      title: t("notice.敏感目标"),
      content: t("notice.涉及敏感目标，请证明所有权"),
      type: "error",
      duration: 5000
    });
    return;
  }
  // A project for the same target may be reused.
  if (!skipReuse) {
    const same = await projectStore.checkHasSameTarget(form.value.target.trim());
    if (same) {
      reuseProjectId.value = same;
      showReuse.value = true;
      return;
    }
  }

  if (!form.value.authorized) {
    noticeStore.addNotice({
      title: t("complianceconfirm.合规确认"),
      content: t("complianceconfirm.确认测试目标已取得合法授权"),
      type: "error",
      duration: 5000
    });
    return;
  }

  saving.value = true;
  try {
    const project = await projectStore.createProject({
      name: form.value.name.trim(),
      description: form.value.remark.trim(),
      target: form.value.target.trim(),
      testType: form.value.testType,
      taskMode: form.value.mode,
      analysis_depth: form.value.depth,
      headless: form.value.headless,
      auto_screen: form.value.autoScreen,
      credentials: form.value.credentials,
      headers: form.value.headers,
      context: form.value.context
    });
    if (!project) {
      noticeStore.error("Creation Failed", "The project could not be created.");
      return;
    }

    // The reference stores the context in `project_remarks`, the credentials
    // in `auth_parameters` and the headers in `header_parameters`.
    await window.dbAPI.addProjectRemarks({
      project_id: project.id,
      background: form.value.context.purpose,
      range: form.value.context.scope,
      assets: form.value.context.assets,
      history: form.value.context.history,
      compliance: form.value.context.compliance
    });
    for (const item of form.value.credentials) {
      await window.dbAPI.addProjectAuthParameters({
        project_id: project.id,
        username: item.username,
        password: item.password,
        description: item.url
      });
    }
    for (const item of form.value.headers) {
      await window.dbAPI.addProjectHeaderParameters({
        project_id: project.id,
        header_name: item.name,
        header_value: item.value
      });
    }
    await window.dbAPI.updateProjectTaskMode(project.id, form.value.mode);

    await projectStore.selectProject(project);
    noticeStore.info(t("taskcreate.新建渗透测试"), project.project_name);
    emit("close");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title">
            <FileText :size="18" />
            <span>{{ t("taskcreate.新建渗透测试") }}</span>
          </div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <div class="steps">
          <div
            v-for="(item, index) in STEPS"
            :key="item.title"
            class="step"
            :class="{ active: index === step, done: index < step }"
          >
            <span class="step-index">{{ index + 1 }}</span>
            <span class="step-text">
              <span class="step-title">{{ t(item.title) }}</span>
              <span class="step-content">{{ t(item.content) }}</span>
            </span>
          </div>
        </div>

        <div class="tabs">
          <div
            v-for="item in TABS"
            :key="item.key"
            class="tab"
            :class="{ active: tab === item.key }"
            @click="tab = item.key"
          >
            {{ t(item.label) }}
          </div>
        </div>

        <!-- Target info -->
        <div v-if="tab === 'target'" class="panel">
          <div class="input-container">
            <div class="input-label">{{ t("taskcreate.任务名称") }}</div>
            <div class="input-field">
              <input
                v-model="form.name"
                class="input-field-input"
                type="text"
                :placeholder="t('taskcreate.例如：公司官网安全测试')"
              />
            </div>
          </div>

          <div class="input-container">
            <div class="input-label">{{ t("task.目标") }}</div>
            <div class="input-field">
              <input
                v-model="form.target"
                class="input-field-input"
                type="text"
                :placeholder="t('taskcreate.例如：text')"
              />
            </div>
          </div>

          <div class="input-container">
            <div class="input-label">
              {{ t("taskcreate.任务备注") }}
              <span class="input-label-optional">{{ t("task.备注") }}</span>
              <span class="input-label-optional">{{ t("taskcreate.可选") }}</span>
            </div>
            <div class="input-field">
              <textarea
                v-model="form.remark"
                class="input-field-input"
                rows="2"
                :placeholder="t('taskcreate.输入任务相关的说明信息（可选）')"
              />
            </div>
          </div>

          <div class="input-container">
            <div class="input-label">{{ t("taskcreate.选择测试模式") }}</div>
            <div class="input-field">
              <select v-model="form.mode" class="input-field-input">
                <option value="Agent">{{ t("taskcreate.Agent") }}</option>
                <option value="Manual">{{ t("taskcreate.Manual") }}</option>
              </select>
              <span class="input-hint">{{ t("taskcreate.测试过程中可随时切换") }}</span>
            </div>
          </div>

          <div class="input-container">
            <div class="input-label">
              {{ t("taskcreate.测试类型") }}
              <span class="input-label-required">required</span>
            </div>
            <div class="input-field">
              <select v-model="form.testType" class="input-field-input">
                <option v-for="item in TEST_TYPES" :key="item.key" :value="item.key">
                  {{ t(item.label) }}
                </option>
              </select>
              <span v-if="!form.testType" class="input-hint">
                {{ t("taskcreate.请选择测试类型") }}
              </span>
            </div>
          </div>
        </div>

        <!-- Input: credentials, headers and context -->
        <div v-else-if="tab === 'input'" class="panel">
          <div class="section-title">{{ t("taskcreate.访问配置") }}</div>
          <div class="section-hint">{{ t("taskcreate.认证凭证和自定义请求头") }}</div>

          <div class="input-container">
            <div class="input-label">
              {{ t("taskcreate.认证凭证") }}
              <span class="input-label-optional">{{ t("taskcreate.可选") }}</span>
              <button class="add-button" @click="addCredential">
                <Plus :size="12" />
                <span>{{ t("taskcreate.添加凭证") }}</span>
              </button>
            </div>
            <div v-for="(item, index) in form.credentials" :key="index" class="entry-row">
              <input v-model="item.username" class="input-field-input" type="text" placeholder="username" />
              <input v-model="item.password" class="input-field-input" type="password" placeholder="password" />
              <input v-model="item.url" class="input-field-input" type="text" placeholder="https://" />
              <button class="icon-button" @click="removeCredential(index)">
                <Trash2 :size="12" />
              </button>
            </div>
          </div>

          <div class="input-container">
            <div class="input-label">
              {{ t("taskcreate.自定义请求头") }}
              <span class="input-label-optional">{{ t("taskcreate.可选") }}</span>
              <button class="add-button" @click="addHeader">
                <Plus :size="12" />
                <span>{{ t("taskcreate.添加请求头") }}</span>
              </button>
            </div>
            <div v-for="(item, index) in form.headers" :key="index" class="entry-row">
              <input v-model="item.name" class="input-field-input" type="text" placeholder="Authorization" />
              <input v-model="item.value" class="input-field-input" type="text" placeholder="Bearer token" />
              <button class="icon-button" @click="removeHeader(index)">
                <Trash2 :size="12" />
              </button>
            </div>
          </div>
        </div>

        <!-- Config: context, depth, headless, auto screening -->
        <div v-else-if="tab === 'config'" class="panel">
          <div class="section-title">{{ t("taskcreate.情报与指导") }}</div>
          <div class="section-hint">{{ t("taskcreate.提供详细的上下文以指导渗透测试") }}</div>

          <div v-for="field in CONTEXT_FIELDS" :key="field.key" class="input-container">
            <div class="input-label">{{ t(field.label) }}</div>
            <div class="input-field">
              <textarea
                v-model="form.context[field.key]"
                class="input-field-input"
                rows="2"
                :placeholder="t(field.hint)"
              />
            </div>
          </div>

          <div class="input-container">
            <div class="input-label">{{ t("taskcreate.分析深度") }}</div>
            <div class="input-field">
              <select v-model="form.depth" class="input-field-input">
                <option v-for="item in DEPTHS" :key="item.key" :value="item.key">
                  {{ t(item.label) }}
                </option>
              </select>
            </div>
          </div>

          <div class="input-container">
            <div class="input-label">{{ t("taskcreate.是否使用无头浏览器扫描") }}</div>
            <div class="input-field">
              <select v-model="form.headless" class="input-field-input">
                <option :value="true">{{ t("taskcreate.使用") }}</option>
                <option :value="false">{{ t("taskcreate.不使用") }}</option>
              </select>
            </div>
          </div>

          <div class="input-container">
            <div class="input-label">
              {{ t("taskcreate.创建后自动初筛目标网站接口风险") }}
              <span class="input-label-optional">{{ t("taskcreate.耗时大约10分钟") }}</span>
            </div>
            <div class="input-field">
              <select v-model="form.autoScreen" class="input-field-input">
                <option :value="true">{{ t("taskcreate.开启") }}</option>
                <option :value="false">{{ t("taskcreate.不使用") }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Legal confirmation -->
        <div v-else class="panel">
          <div class="section-title">{{ t("complianceconfirm.合规确认") }}</div>
          <label class="check-row">
            <input v-model="form.compliant" type="checkbox" />
            <span>{{ t("complianceconfirm.确认测试目标符合合规要求") }}</span>
          </label>
          <label class="check-row">
            <input v-model="form.authorized" type="checkbox" />
            <span>{{ t("complianceconfirm.确认测试目标已取得合法授权") }}</span>
          </label>
          <div class="authorization-state">
            <span class="state-label">{{ t("taskcreate.合法验证") }}:</span>
            <span class="state-value" :class="{ granted: form.authorized }">
              {{ form.authorized ? t("complianceconfirm.取得授权") : t("complianceconfirm.未取得授权") }}
            </span>
          </div>
        </div>

        <!-- Reuse data -->
        <div v-if="isLast && showReuse" class="reuse-row">
          <span class="reuse-label">{{ t("taskcreate.存在同目标任务是否复用数据") }}</span>
          <span class="reuse-label">{{ t("taskcreate.风险信息") }}</span>
          <span class="reuse-label">{{ t("taskcreate.信息总览") }}</span>
          <button class="reuse-button" @click="applyReuse">
            {{ t("taskcreate.确认") }}
          </button>
          <button class="reuse-button" @click="createNew">
            {{ t("taskcreate.取消") }}
          </button>
        </div>

        <div class="button-container">
          <button class="button button-cancel" @click="emit('close')">
            {{ t("taskcreate.取消") }}
          </button>
          <button v-if="step > 0" class="button" @click="back">
            {{ t("taskcreate.上一步") }}
          </button>
          <button v-if="!isLast" class="button button-primary" @click="next">
            {{ t("taskcreate.下一步") }}
          </button>
          <button v-else class="button button-primary" :disabled="saving" @click="create">
            <Loader2 v-if="saving" class="spin" :size="13" />
            <span>{{ t("taskcreate.确认并创建任务") }}</span>
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
  width: min(640px, 94vw);
  max-height: calc(100vh - 60px);
  overflow-y: auto;
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1rem;
  font-weight: 700;
}

.close-button {
  cursor: pointer;
}

.steps {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: 5px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  flex: 1;
  min-width: 120px;
}

.step.active {
  border-color: var(--button-bg);
}

.step.done {
  opacity: 0.7;
}

.step-index {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  flex: 0 0 auto;
}

.step-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.step-title {
  font-size: 0.78rem;
  font-weight: 700;
}

.step-content {
  font-size: 0.68rem;
  color: var(--muted);
}

.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}

.tab {
  padding: 3px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--muted);
}

.tab.active {
  background-color: var(--nav-active-bg);
  color: var(--foreground);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-size: 0.95rem;
  font-weight: 700;
}

.section-hint {
  font-size: 0.78rem;
  color: var(--muted);
}

.input-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-label {
  font-size: 0.9rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.input-label-optional {
  font-size: 0.7rem;
  font-weight: 400;
  background-color: var(--border);
  padding: 1px 4px;
  border-radius: 2px;
}

.input-label-required {
  color: var(--danger);
  font-size: 0.75rem;
}

.input-hint {
  font-size: 0.72rem;
  color: var(--muted);
}

.input-field {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.input-field-input {
  flex: 1;
  min-width: 180px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  font-family: inherit;
  font-size: 0.85rem;
}

.input-field-input:focus {
  outline: none;
}

.entry-row {
  display: flex;
  gap: 5px;
  width: 100%;
}

.icon-button,
.add-button {
  display: flex;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 2px 6px;
}

.add-button {
  font-size: 0.7rem;
  margin-left: 4px;
}

.check-row {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 0.85rem;
  cursor: pointer;
}

.authorization-state {
  display: flex;
  gap: 6px;
  font-size: 0.82rem;
}

.state-label {
  color: var(--muted);
}

.state-value.granted {
  color: var(--success);
}

.reuse-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}

.reuse-label {
  flex: 1;
}

.reuse-button {
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.78rem;
}

.button-container {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.85rem;
}

.button-primary {
  background-color: var(--button-bg);
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
