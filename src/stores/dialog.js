import { defineStore } from "pinia";
import { ref } from "vue";
import { useNoticeStore } from "./notice.js";
import { useUserStore } from "./user.js";
import { useProjectStore } from "./project.js";
import { translate } from "../locales/index.js";

/**
 * The dialog store.
 *
 * The reference opens every dialog by name through this store, and the store
 * carries the rules:
 *
 *   - `new-version` holds the screen: while it is open nothing else opens;
 *   - `notice-subscribe` and `notice-subscribe-report` do the same;
 *   - `task-create` needs the environment configured — without the
 *     interpreter and the script path it opens `env-path` instead and says so;
 *   - `task-set` needs a named project;
 *   - the history keeps the last ten names.
 *
 * The reference also refuses to open a dialog for a signed-out user. This
 * reconstruction has no sign-in, so that branch does not apply.
 */
export const useDialogStore = defineStore("dialog", () => {
  const dialogStr = ref("");
  const history = ref([]);
  const testType = ref("");
  /** The data the open dialog works on. */
  const payload = ref(null);
  /** The finding a dialog was opened for. */
  const activeRiskItem = ref(null);

  function push(name) {
    history.value.push(name);
    if (history.value.length > 10) {
      history.value = history.value.slice(-10);
    }
  }

  function openDialog(name, options = {}) {
    if (!name) return false;
    // The update notice holds the screen.
    if (dialogStr.value === "new-version") return false;
    // The reference sets the active item before opening the dialog, so the
    // dialog works on one finding rather than the whole list.
    if (options.activeRiskItem !== undefined) {
      activeRiskItem.value = options.activeRiskItem;
    }
    if (options.testType !== undefined) testType.value = options.testType || "";
    payload.value = options.payload ?? null;
    push(name);

    // The subscription notice holds the screen too.
    if (dialogStr.value === "notice-subscribe" || dialogStr.value === "notice-subscribe-report") {
      return false;
    }

    // The task dialog needs the environment configured.
    if (name === "task-create") {
      const settings = useUserStore().settings || {};
      if (!settings.ai_script || !settings.ai_python) {
        useNoticeStore().addNotice({
          title: translate("notice.提示"),
          content: translate("notice.请填写完整的环境配置"),
          type: "info",
          duration: 5000
        });
        dialogStr.value = "env-path";
        push("env-path");
        return false;
      }
    }

    // The task-set dialog needs a named project.
    if (name === "task-set") {
      const project = useProjectStore().currentProject;
      if (!project || project.project_name === "Unnamed task") {
        useNoticeStore().addNotice({
          title: translate("notice.未命名任务"),
          content: translate("notice.请先创建任务"),
          type: "warning",
          duration: 5000
        });
        return false;
      }
    }

    dialogStr.value = name;
    return true;
  }

  /**
   * Open a dialog, skipping the gates.
   *
   * The reference uses this where a dialog must open regardless — the
   * subscription notice, for instance.
   */
  function openDialogSkip(name) {
    if (dialogStr.value === "new-version" || dialogStr.value === "notice-subscribe") return;
    dialogStr.value = name;
    push(name);
  }

  function closeDialog() {
    dialogStr.value = "";
  }

  return {
    dialogStr,
    history,
    testType,
    payload,
    activeRiskItem,
    openDialog,
    openDialogSkip,
    closeDialog
  };
});
