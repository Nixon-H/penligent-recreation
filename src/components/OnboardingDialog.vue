<script setup>
/**
 * "Product Introduction" walkthrough.
 *
 * The six steps, their titles, subtitles, bullet lists and button labels were
 * captured from the live reference application (all six steps, including the
 * final "Login and start using" -> "Logging in......" transition).
 *
 * Layout reproduces the reference rules:
 *   .content        width min(720px, 92vw), radius 10px, padding 22px, gap 14px
 *   .step-chip      pill, radius 999px, padding 7px 10px, gap 8px
 *   .chip-num       20px circle, weight 800, .85rem
 *   .step-card      radius 10px, padding 14px 14px 12px, min-height 160px
 */
import { ref, computed } from "vue";
import {
  BookOpenCheck,
  CircleX,
  FileText,
  Wrench,
  Network,
  Check
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";
import { useNoticeStore } from "@/stores/notice";
import { useUserStore } from "@/stores/user";
import { ONBOARDING_LANGUAGES, setLanguage } from "@/locales";

const { t } = useI18n();
const dialogStore = useDialogStore();
const noticeStore = useNoticeStore();
const userStore = useUserStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close", "completed"]);

/**
 * The languages on offer.
 *
 * The reference's Settings dialog lists them in its own order; the onboarding
 * shows the same list.
 */
const LANGUAGES = ONBOARDING_LANGUAGES;

/**
 * The six onboarding steps, using the reference's own locale keys so the
 * wording matches the original exactly in all eleven languages.
 */
const STEPS = [
  {
    title: "onboarding.选择语言",
    subtitle: "onboarding.选择语言描述",
    kind: "language"
  },
  {
    title: "onboarding.环境配置",
    subtitle: "onboarding.环境配置描述",
    bullets: ["onboarding.环境配置内容1", "onboarding.环境配置内容2"]
  },
  {
    title: "onboarding.工具兼容",
    subtitle: "onboarding.工具兼容描述",
    bullets: [
      "onboarding.工具兼容内容1",
      "onboarding.工具兼容内容2",
      "onboarding.工具兼容内容3",
      "onboarding.工具兼容内容4"
    ]
  },
  {
    title: "onboarding.测试类型",
    subtitle: "onboarding.测试类型描述",
    bullets: [
      "onboarding.测试类型内容1",
      "onboarding.测试类型内容2",
      "onboarding.测试类型内容3",
      "onboarding.测试类型内容4",
      "onboarding.测试类型内容5"
    ]
  },
  {
    title: "onboarding.抓包工具",
    subtitle: "onboarding.抓包工具描述",
    bullets: [
      "onboarding.AI分析",
      "onboarding.抓包",
      "onboarding.拦截",
      "onboarding.改包",
      "onboarding.重放"
    ]
  },
  {
    title: "onboarding.导出报告",
    subtitle: "onboarding.导出报告描述",
    bullets: ["onboarding.导出报告内容1"]
  }
];

const step = ref(0);
const language = ref("en");
const loggingIn = ref(false);

const isLast = computed(() => step.value === STEPS.length - 1);
const current = computed(() => STEPS[step.value]);

function chipClass(index) {
  if (index < step.value) return "step-chip done";
  if (index === step.value) return "step-chip active";
  return "step-chip";
}

/**
 * The reference records completion in the `user_settings` table under the
 * key `onboarding_status` (value "1", type "string", description
 * "Onboarding status") and re-shows the walkthrough whenever that setting is
 * empty. The same key and semantics are used here.
 */
function selectLanguage(code) {
  language.value = code;
  setLanguage(code);
}

async function markCompleted() {
  await userStore.setSetting("onboarding_status", "1", "string", "Onboarding status");
  await userStore.setSetting("language", language.value, "string", "Interface language");
  setLanguage(language.value);
}

async function next() {
  if (isLast.value) {
    loggingIn.value = true;
    await markCompleted();
    setTimeout(() => {
      noticeStore.info("Welcome", "Penligent is ready. Create a project to begin.");
      emit("completed");
    }, 600);
    return;
  }
  step.value += 1;
}

function previous() {
  if (step.value > 0) step.value -= 1;
}

async function close() {
  await markCompleted();
  emit("close");
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title">
            <BookOpenCheck :size="18" />
            <span>{{ t("onboarding.产品介绍") }}</span>
          </div>
          <CircleX class="close-button" :size="20" @click="close" />
        </div>

        <div class="step-indicator">
          <div
            v-for="(item, index) in STEPS"
            :key="item.title"
            :class="chipClass(index)"
            @click="step = index"
          >
            <div class="chip-num">{{ index + 1 }}</div>
            <div class="chip-label">{{ t(item.title) }}</div>
          </div>
        </div>

        <div class="step-card">
          <div class="step-title">
            <component :is="current.icon" class="step-title-icon" :size="16" />
            <span>{{ t(current.title) }}</span>
          </div>
          <div class="step-subtitle">{{ t(current.subtitle) }}</div>

          <div class="step-body">
            <div v-if="current.kind === 'language'" class="language-options">
              <div
                v-for="item in LANGUAGES"
                :key="item.code"
                class="language-option"
                :class="{ active: language === item.code }"
                @click="selectLanguage(item.code)"
              >
                <span class="language-label">{{ item.label }}</span>
                <span v-if="language === item.code" class="language-check">·</span>
              </div>
            </div>

            <ul v-else class="step-bullets">
              <li v-for="bullet in current.bullets" :key="bullet" class="step-bullet">
                <Check class="bullet-icon" :size="16" />
                <span>{{ t(bullet) }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="button-container">
          <button
            v-if="step > 0"
            class="button button-cancel"
            @click="previous"
          >
            {{ t("onboarding.上一步") }}
          </button>
          <button class="button button-create" @click="next">
            {{ loggingIn ? t("onboarding.登录中") : isLast ? t("onboarding.确认并开始使用") : t("onboarding.下一步") }}
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
  width: min(720px, 92vw);
  max-height: calc(100vh - 60px);
  overflow: hidden;
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.header {
  width: 100%;
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

.header .close-button {
  cursor: pointer;
}

.step-indicator {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.step-indicator .step-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 6%, var(--background));
  color: var(--muted);
  user-select: none;
  transition: all 0.16s ease;
  cursor: pointer;
}

.step-indicator .step-chip .chip-num {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.85rem;
  background: color-mix(in srgb, var(--accent) 10%, var(--background));
  border: 1px solid var(--border);
  color: var(--muted);
}

.step-indicator .step-chip .chip-label {
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.step-indicator .step-chip.done {
  border-color: var(--button-bg);
  background: color-mix(in srgb, var(--accent) 12%, var(--background));
  color: var(--foreground);
}

.step-indicator .step-chip.done .chip-num {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, var(--background));
  color: var(--accent);
}

.step-indicator .step-chip.active {
  border-color: var(--button-bg);
  background: color-mix(in srgb, var(--accent) 16%, var(--background));
  color: var(--foreground);
  box-shadow:
    inset 0 0 0 1px var(--button-bg),
    0 10px 24px color-mix(in srgb, var(--button-bg) 18%, transparent);
}

.step-indicator .step-chip.active .chip-num {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 22%, var(--background));
  color: var(--accent);
}

.step-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 160px;
}

.step-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
}

.step-title .step-title-icon {
  color: var(--accent);
}

.step-subtitle {
  color: var(--muted);
  line-height: 1.6;
  font-size: 0.98rem;
}

.step-body {
  overflow-y: auto;
  padding-right: 6px;
}

.step-bullets {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.step-bullet {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--foreground);
  line-height: 1.5;
}

.bullet-icon {
  color: var(--accent);
  flex: 0 0 auto;
  margin-top: 2px;
}

.language-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding-top: 6px;
}

.language-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: #00000008;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.16s ease;
  user-select: none;
}

.language-option .language-label {
  font-weight: 700;
  font-size: 0.98rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.language-option .language-check {
  font-weight: 900;
  color: var(--accent);
}

.language-option:hover {
  border-color: var(--button-bg);
  color: var(--foreground);
}

.language-option.active {
  border-color: var(--button-bg);
  background: color-mix(in srgb, var(--button-bg) 14%, var(--background));
  color: var(--foreground);
}

@media (max-width: 520px) {
  .language-options {
    grid-template-columns: 1fr;
  }
}

.button-container {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  user-select: none;
}

.button {
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

.button-create {
  background-color: var(--button-bg);
  border-color: var(--button-bg);
}
</style>
