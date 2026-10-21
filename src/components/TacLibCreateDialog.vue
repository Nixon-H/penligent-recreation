<script setup>
/**
 * Add a technique to the Skills Library.
 *
 * The reference's dialog creates an entry in the `ttp` table: a title, an
 * overview, the detection method, the WAF bypass points, how to confirm the
 * vulnerability, the possible false positives, the detection priority and the
 * notes.
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";
import { CircleX, Save } from "lucide-vue-next";
import { useNoticeStore } from "@/stores/notice";
import { useProjectStore } from "@/stores/project";

const { t } = useI18n();
const dialogStore = useDialogStore();
const noticeStore = useNoticeStore();
const projectStore = useProjectStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close", "saved"]);

const FIELDS = [
  { key: "title", label: "tac-lib-create.名称", placeholder: "tac-lib-create.名称示例" },
  { key: "overview", label: "tactics-library.漏洞概述", placeholder: "tac-lib-create.漏洞概述示例" },
  { key: "detection_method", label: "tactics-library.检测方法", placeholder: "tac-lib-create.检测方法示例" },
  { key: "waf_bypass", label: "tactics-library.WAF与绕过点", placeholder: "tac-lib-create.WAF与绕过点示例" },
  { key: "verification", label: "tactics-library.确认漏洞存在的判断方式", placeholder: "tac-lib-create.确认漏洞存在的判断方式示例" },
  { key: "false_positive", label: "tactics-library.可能的误判原因与二次验证方式", placeholder: "tac-lib-create.可能的误判原因与二次验证方式示例" },
  { key: "priority", label: "tactics-library.检测优先级", placeholder: "tac-lib-create.检测优先级示例" },
  { key: "notes", label: "tactics-library.注意事项", placeholder: "tac-lib-create.注意事项示例" }
];

const form = ref({
  title: "",
  ttp_type: "",
  ttp_level: "medium",
  ttp_priority: 5,
  overview: "",
  detection_method: "",
  waf_bypass: "",
  verification: "",
  false_positive: "",
  priority: "",
  notes: ""
});

async function save() {
  if (!form.value.title.trim()) {
    noticeStore.addNotice({
      title: t("notice.请填写完整信息"),
      content: t("notice.请填写完整信息"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  const projectId = projectStore.currentProject?.id ?? 0;
  await window.dbAPI.addTtp({ ...form.value, project_id: projectId });
  noticeStore.addNotice({
    title: t("notice.成功"),
    content: form.value.title,
    type: "success",
    duration: 5000
  });
  emit("saved");
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title"><span>{{ t("tac-lib-create.新增技站法") }}</span></div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <div class="input-container">
          <div class="input-label">
            {{ t("tactics-library.优先级") }}
            <span class="input-label-required">required</span>
          </div>
          <div class="input-field">
            <input
              v-model="form.title"
              class="input-field-input"
              type="text"
              :placeholder="t('tac-lib-create.名称示例')"
            />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">
            {{ t("tac-lib-create.严重程度") }}
            <span class="input-label-required">*</span>
          </div>
          <div class="input-field">
            <select v-model="form.ttp_level" class="input-field-input">
              <option value="critical">{{ t("tac-lib-create.严重") }}</option>
              <option value="high">{{ t("tac-lib-create.高") }}</option>
              <option value="medium">{{ t("tac-lib-create.中") }}</option>
              <option value="low">{{ t("tac-lib-create.低") }}</option>
            </select>
          </div>
        </div>

        <div v-for="field in FIELDS.slice(1)" :key="field.key" class="input-container">
          <div class="input-label">{{ t(field.label) }}</div>
          <div class="input-field">
            <textarea
              v-model="form[field.key]"
              class="input-field-input"
              rows="2"
              :placeholder="t(field.placeholder)"
            />
          </div>
        </div>

        <div class="button-container">
          <button class="button button-cancel" @click="emit('close')">
            {{ t("tac-lib-create.取消") }}
          </button>
          <button class="button button-primary" @click="save">
            <Save :size="13" />
            <span>{{ t("tac-lib-create.创建") }}</span>
            <span class="save-hint">{{ t("tac-lib-create.保存") }}</span>
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
  width: min(560px, 94vw);
  max-height: calc(100vh - 60px);
  overflow-y: auto;
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 11px;
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
  font-size: 0.88rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 5px;
}

.input-label-required {
  color: var(--danger);
  font-size: 0.75rem;
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
