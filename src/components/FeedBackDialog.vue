<script setup>
/**
 * Feedback.
 *
 * The reference asks four questions — how satisfied the user is with the
 * findings, with the tools and the commands, whether there is a bug to
 * report, and any other suggestion — and refuses to send an empty form.
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";
import { CircleX, Send, Check } from "lucide-vue-next";
import { useNoticeStore } from "@/stores/notice";

const { t } = useI18n();
const dialogStore = useDialogStore();
const noticeStore = useNoticeStore();
/** Pick a rating, as the reference's pair of toggles does. */
function setRating(section, value) {
  form.value[section] = form.value[section] === value ? "" : value;
}

/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close"]);

/** The reference offers a pair of toggles for each rating. */
const RATINGS = [
  { key: "satisfied", label: "feed-back.满意" },
  { key: "unsatisfied", label: "feed-back.不满意" }
];

const form = ref({
  risk: "",
  riskText: "",
  tool: "",
  toolText: "",
  bugText: "",
  other: ""
});

/** Write the feedback out. */
async function save() {
  const api = window.fileAPI;
  if (!api?.writeFile) return false;
  try {
    const path = await api.getFilePath("penligent-feedback.md", "penligent-feedback.md");
    if (!path) return false;
    const written = await api.writeFile(path, JSON.stringify(form.value, null, 2));
    return written?.success !== false;
  } catch {
    return false;
  }
}

async function submit() {
  const filled = Object.values(form.value).some((value) => String(value).trim());
  if (!filled) {
    noticeStore.addNotice({
      title: t("notice.请填写完整信息"),
      content: t("notice.请填写反馈内容"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  // The reference's service is not reachable here, so the feedback is
  // written to a file the operator can send on.
  const saved = await save();
  if (!saved) {
    noticeStore.addNotice({
      title: t("notice.错误"),
      content: t("notice.请填写反馈内容"),
      type: "error",
      duration: 5000
    });
    return;
  }
  noticeStore.addNotice({
    title: t("notice.反馈成功"),
    content: t("notice.感谢您的反馈"),
    type: "success",
    duration: 5000
  });
  emit("close");
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title">{{ t("feed-back.问题反馈") }}</div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("feed-back.发现的风险是否满意") }}</div>
          <div class="input-field">
            <div class="rating-row">
              <div
                v-for="item in RATINGS"
                :key="item.key"
                class="input-label-item"
                @click="setRating('risk', item.key)"
              >
                <span class="rating-mark">
                  <Check v-if="form.risk === item.key" :size="16" />
                </span>
                <span>{{ t(item.label) }}</span>
              </div>
            </div>
            <textarea
              v-if="!form.risk"
              v-model="form.riskText"
              class="input-field-input"
              rows="5"
              :placeholder="t('feed-back.风险占位')"
            />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("feed-back.推出的工具和命令是否准确") }}</div>
          <div class="input-field">
            <div class="rating-row">
              <div
                v-for="item in RATINGS"
                :key="item.key"
                class="input-label-item"
                @click="setRating('tool', item.key)"
              >
                <span class="rating-mark">
                  <Check v-if="form.tool === item.key" :size="16" />
                </span>
                <span>{{ t(item.label) }}</span>
              </div>
            </div>
            <textarea
              v-if="!form.tool"
              v-model="form.toolText"
              class="input-field-input"
              rows="5"
              :placeholder="t('feed-back.工具占位')"
            />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("feed-back.是否有BUG需要提交") }}</div>
          <div class="input-field">
            <textarea
              v-model="form.bugText"
              class="input-field-input"
              rows="5"
              :placeholder="t('feed-back.BUG占位')"
            />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("feed-back.其他建议") }}</div>
          <div class="input-field">
            <textarea v-model="form.other" class="input-field-input" rows="3" :placeholder="t('feed-back.其他占位')" />
          </div>
        </div>

        <div class="button-container">
          <button class="button button-cancel" @click="emit('close')">
            {{ t("feed-back.取消") }}
          </button>
          <button class="button button-primary" @click="submit">
            <Send :size="13" />
            <span>{{ t("feed-back.提交") }}</span>
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
  width: min(480px, 92vw);
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
  font-size: 1.05rem;
  font-weight: 700;
}

.close-button {
  cursor: pointer;
}

.input-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-label {
  font-size: 0.9rem;
  font-weight: 700;
}

.input-field-input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  font-family: inherit;
  font-size: 0.85rem;
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
</style>
