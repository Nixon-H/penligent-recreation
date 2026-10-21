<script setup>
/**
 * Tool configuration.
 *
 * The reference adds a tool to the project's `tool_sets` table: a command
 * the agent may run, or an API it may call, with a name, a path and a
 * description.
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

const form = ref({
  tool_type: "command",
  tool_name: "",
  tool_path: "",
  tool_command: "",
  tool_api: "",
  format_str: "",
  description: ""
});

async function save() {
  // The reference requires the name, the path, the command and the
  // description.
  if (
    !form.value.tool_name.trim() ||
    !form.value.tool_path.trim() ||
    !form.value.tool_command.trim() ||
    !form.value.description.trim()
  ) {
    noticeStore.addNotice({
      title: t("notice.请填写完整信息"),
      content: t("notice.请填写完整信息"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  const projectId = projectStore.currentProject?.id ?? 0;
  // The reference's `addSets` takes these names; the tool_sets table has
  // columns of the same names, so anything else stores empty values.
  await window.dbAPI.addSets({
    project_id: projectId,
    tool_type: form.value.tool_type,
    set_name: form.value.tool_name,
    command_path: form.value.tool_path,
    command_command: form.value.tool_command,
    api_config: form.value.tool_api,
    format_str: form.value.format_str,
    description: form.value.description
  });
  noticeStore.addNotice({
    title: t("notice.成功"),
    content: form.value.tool_name,
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
          <div class="title"><span>{{ t("tooladd.添加工具配置") }}</span></div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("tooladd.工具类型") }}</div>
          <div class="input-field">
            <select v-model="form.tool_type" class="input-field-input">
              <option value="command">{{ t("tooladd.Command") }}</option>
              <option value="api">{{ t("tooladd.api配置") }}</option>
            </select>
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("tooladd.工具名称") }}</div>
          <div class="input-field">
            <input
              v-model="form.tool_name"
              class="input-field-input"
              type="text"
              :placeholder="t('tooladd.例如:工具名称')"
            />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("tooladd.工具路径") }}</div>
          <div class="input-field">
            <input
              v-model="form.tool_path"
              class="input-field-input"
              type="text"
              :placeholder="t('tooladd.例如:工具路径')"
            />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("tooladd.工具命令") }}</div>
          <div class="input-field">
            <input
              v-model="form.tool_command"
              class="input-field-input"
              type="text"
              :placeholder="t('tooladd.例如:工具命令')"
            />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ t("tooladd.api配置") }}</div>
          <div class="input-field">
            <input
              v-model="form.tool_api"
              class="input-field-input"
              type="text"
              :placeholder="t('tooladd.例如:api配置')"
            />
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">
            {{ t("tooladd.描述信息") }}
            <span class="input-label-optional">optional</span>
          </div>
          <div class="input-field">
            <textarea
              v-model="form.description"
              class="input-field-input"
              rows="2"
              :placeholder="t('tooladd.描述信息示例')"
            />
          </div>
        </div>

        <div class="button-container">
          <button class="button button-cancel" @click="emit('close')">
            {{ t("tooladd.取消") }}
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
  width: min(520px, 92vw);
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

.input-field {
  display: flex;
  gap: 6px;
}

.input-field-input {
  flex: 1;
  min-width: 0;
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
