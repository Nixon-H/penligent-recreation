<script setup>
/**
 * Environment settings.
 *
 * The reference's dialog collects the paths the agent needs to run: the
 * Python interpreter, the script storage directory, the Bash interpreter, the
 * proxy and the working directory. It can also be skipped.
 */
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { CircleX, Save, FolderOpen, FileText } from "lucide-vue-next";
import { useNoticeStore } from "@/stores/notice";
import { useUserStore } from "@/stores/user";
import { useDialogStore } from "@/stores/dialog";

const { t } = useI18n();
const noticeStore = useNoticeStore();
const userStore = useUserStore();
const dialogStore = useDialogStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close", "skip"]);

/**
 * The dialog's inputs.
 *
 * The reference has exactly three: the Python interpreter, the script storage
 * path and the Bash interpreter. The proxy and the working directory have
 * settings of their own but the dialog does not show them.
 */
const FIELDS = [
  {
    key: "ai_python",
    label: "envpath.Python执行器路径",
    kind: "file",
    description: "AI python path"
  },
  {
    key: "ai_script",
    label: "envpath.脚本存储路径",
    kind: "directory",
    description: "AI script path"
  },
  {
    key: "ai_bash",
    label: "envpath.Bash执行器路径",
    kind: "file",
    description: "AI bash path"
  }
];

/** The reference only offers the shortcut when the task dialog opened it. */
const cameFromTaskCreate = computed(() => {
  const history = dialogStore.history || [];
  return history.length >= 2 && history[history.length - 2] === "task-create";
});

const values = ref({});
const saving = ref(false);

onMounted(async () => {
  await userStore.loadSettings();
  values.value = Object.fromEntries(
    FIELDS.map((field) => [field.key, userStore.settings[field.key] || ""])
  );
});

async function browse(field) {
  const options =
    field.kind === "directory"
      ? { properties: ["openDirectory"] }
      : { properties: ["openFile"] };
  const picked = await window.fileAPI?.showOpenDialog?.(options);
  // `showOpenDialog` returns { canceled, filePaths }.
  const path = picked?.filePaths?.[0];
  if (path) values.value[field.key] = path;
}

/**
 * Skip the configuration.
 *
 * The reference opens the task dialog anyway, without the environment rules
 * being applied.
 */
function skip() {
  dialogStore.openDialogSkip("task-create");
  emit("close");
}

async function save() {
  // The reference refuses to save an incomplete environment.
  if (!values.value.ai_script || !values.value.ai_python) {
    noticeStore.addNotice({
      title: t("notice.错误"),
      content: t("notice.请填写完整的环境配置"),
      type: "warning",
      duration: 5000
    });
    return;
  }
  saving.value = true;
  try {
    for (const field of FIELDS) {
      await userStore.setSetting(
        field.key,
        values.value[field.key] || "",
        "string",
        field.description
      );
    }
    noticeStore.addNotice({
      title: t("notice.成功"),
      content: t("notice.环境配置保存成功"),
      type: "success",
      duration: 5000
    });
    emit("close");
  } catch {
    noticeStore.addNotice({
      title: t("notice.错误"),
      content: t("notice.环境配置保存失败"),
      type: "error",
      duration: 5000
    });
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
          <div class="title">{{ t("envpath.环境配置") }}</div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <div class="hint">{{ t("envpath.未正确配置提示") }}</div>

        <div v-for="field in FIELDS" :key="field.key" class="input-container">
          <div class="input-label">{{ t(field.label) }}</div>
          <div class="input-field">
            <input v-model="values[field.key]" class="input-field-input" type="text" />
            <button
              v-if="field.kind !== 'text'"
              class="browse-button"
              :title="t(field.kind === 'directory' ? 'envpath.工作目录' : 'envpath.Python执行器路径')"
              @click="browse(field)"
            >
              <FolderOpen v-if="field.kind === 'directory'" :size="13" />
              <FileText v-else :size="13" />
            </button>
          </div>
        </div>

        <div class="button-container">
          <button class="button button-cancel" @click="skip">
            {{ t("envpath.暂不配置直接创建新任务") }}
          </button>
          <button class="button button-cancel" @click="emit('close')">
            {{ t("envpath.取消") }}
          </button>
          <button class="button button-primary" :disabled="saving" @click="save">
            <Save :size="13" />
            <span>{{ t("envpath.保存") }}</span>
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

.hint {
  font-size: 0.78rem;
  color: var(--warning);
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
  font-family: "Courier New", monospace;
  font-size: 0.82rem;
}

.browse-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
}

.button-container {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
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
