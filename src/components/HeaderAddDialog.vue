<script setup>
/**
 * Custom request header.
 *
 * The reference adds a header to the project's `header_parameters` table.
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

const form = ref({ header_name: "", header_value: "" });

async function save() {
  if (!form.value.header_name.trim()) {
    noticeStore.addNotice({
      title: t("notice.请填写完整信息"),
      content: t("notice.请填写完整信息"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  const projectId = projectStore.currentProject?.id ?? 0;
  await window.dbAPI.addProjectHeaderParameters({
    project_id: projectId,
    header_name: form.value.header_name,
    header_value: form.value.header_value
  });
  noticeStore.addNotice({
    title: t("notice.成功"),
    content: form.value.header_name,
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
          <div class="title"><span>{{ t("headeradd.添加自定义请求头") }}</span></div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("headeradd.请求头名称") }}</div>
          <div class="input-field">
            <input
              v-model="form.header_name"
              class="input-field-input"
              type="text"
              :placeholder="t('headeradd.例如：Authorization')"
            />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("headeradd.请求头值") }}</div>
          <div class="input-field">
            <input
              v-model="form.header_value"
              class="input-field-input"
              type="text"
              :placeholder="t('headeradd.例如：Bearer token')"
            />
          </div>
        </div>

        <div class="button-container">
          <button class="button button-cancel" @click="emit('close')">
            {{ t("headeradd.取消") }}
          </button>
          <button class="button button-primary" @click="save">
            <Save :size="13" />
            <span>{{ t("test-list.保存") }}</span>
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
  width: min(460px, 92vw);
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
