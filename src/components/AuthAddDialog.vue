<script setup>
/**
 * Authentication credential.
 *
 * The reference adds a credential to the project's `auth_parameters` table:
 * a username, a password and a description.
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

const form = ref({ username: "", password: "", description: "" });

async function save() {
  if (!form.value.username.trim()) {
    noticeStore.addNotice({
      title: t("notice.请填写完整信息"),
      content: t("notice.请填写完整信息"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  const projectId = projectStore.currentProject?.id ?? 0;
  await window.dbAPI.addProjectAuthParameters({
    project_id: projectId,
    username: form.value.username,
    password: form.value.password,
    description: form.value.description
  });
  noticeStore.addNotice({
    title: t("notice.成功"),
    content: form.value.username,
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
          <div class="title"><span>{{ t("authadd.添加认证凭证") }}</span></div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("authadd.用户名") }}</div>
          <div class="input-field">
            <input v-model="form.username" class="input-field-input" type="text" />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("authadd.密码") }}</div>
          <div class="input-field">
            <input v-model="form.password" class="input-field-input" type="text" />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">
            {{ t("authadd.描述信息") }}
            <span class="input-label-optional">optional</span>
          </div>
          <div class="input-field">
            <input v-model="form.description" class="input-field-input" type="text" />
          </div>
        </div>

        <div class="button-container">
          <button class="button button-cancel" @click="emit('close')">
            {{ t("authadd.取消") }}
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
  display: flex;
  align-items: center;
  gap: 5px;
}

.input-label-optional {
  font-size: 0.7rem;
  font-weight: 400;
  background-color: var(--border);
  padding: 1px 4px;
  border-radius: 2px;
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
