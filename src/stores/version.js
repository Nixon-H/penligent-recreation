import { defineStore } from "pinia";
import { ref } from "vue";
import { useDialogStore } from "./dialog.js";
import { useNoticeStore } from "./notice.js";
import { useUserStore } from "./user.js";

/**
 * The version store.
 *
 * The reference keeps the running version and the version the service
 * publishes, checks every thirty seconds, and opens the update notice when
 * the two differ. The version the operator declined is written to the
 * `ignore_version` setting, and the notice does not come back for it.
 */
export const useVersionStore = defineStore("version", () => {
  const version = ref("2.1.6");
  const newVersionInfo = ref({
    loading_status: false,
    description: "",
    version: "2.1.6",
    must_update: false
  });

  let timer = null;

  /** The version the service publishes. */
  async function fetchVersion() {
    const result = await window.versionAPI?.check?.();
    if (!result) return null;
    newVersionInfo.value.version = result.latest || newVersionInfo.value.version;
    newVersionInfo.value.description = result.description || "";
    return result;
  }

  /** The version the operator declined. */
  async function ignoredVersion() {
    const settings = useUserStore().settings || {};
    return settings.ignore_version || "";
  }

  /** The automatic check. */
  async function autoCheckVersion() {
    const dialogStore = useDialogStore();
    const result = await fetchVersion();
    if (!result) return;
    if (result.latest === version.value) return;
    if (dialogStore.dialogStr === "new-version") return;
    newVersionInfo.value.must_update = false;
    // A version the operator already declined does not come back.
    if ((await ignoredVersion()) === result.latest) return;
    dialogStore.openDialog("new-version", { payload: { version: result } });
  }

  /** The check the Settings dialog offers. */
  async function checkVersionManual() {
    const dialogStore = useDialogStore();
    const noticeStore = useNoticeStore();
    newVersionInfo.value.loading_status = true;
    try {
      const result = await fetchVersion();
      if (result && result.latest !== version.value) {
        newVersionInfo.value.must_update = true;
        dialogStore.openDialog("new-version", { payload: { version: result } });
      } else {
        noticeStore.addNotice({
          title: "INFO",
          content: "You are using the latest version",
          type: "info",
          duration: 5000
        });
      }
    } finally {
      newVersionInfo.value.loading_status = false;
    }
  }

  /** The check that runs every thirty seconds. */
  function startAutoCheck() {
    if (timer) return;
    timer = setInterval(() => {
      autoCheckVersion().catch(() => {});
    }, 30000);
  }

  function stopAutoCheck() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  /** The version the operator declined. */
  async function clickLaterUpdate() {
    const dialogStore = useDialogStore();
    dialogStore.closeDialog();
    await useUserStore().setSetting(
      "ignore_version",
      newVersionInfo.value.version,
      "string",
      "Ignore version"
    );
  }

  return {
    version,
    newVersionInfo,
    autoCheckVersion,
    checkVersionManual,
    clickLaterUpdate,
    startAutoCheck,
    stopAutoCheck
  };
});
