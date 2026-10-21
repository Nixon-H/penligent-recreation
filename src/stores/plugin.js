import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * The plugin store.
 *
 * The reference reads the plugin files from the file API and keeps the list
 * for the agent request's `plugins` field. It only populates the list when
 * the platform is neither Kali nor Linux — on those systems the list stays
 * empty.
 */
export const usePluginStore = defineStore("plugin", () => {
  const pluginList = ref([]);

  async function getPluginFilesList() {
    const api = typeof window !== "undefined" ? window.fileAPI : null;
    if (!api?.getPluginFileList) return pluginList.value;
    const files = await api.getPluginFileList();
    const info = window.systemAPI?.getSystemInfo?.() || {};
    const distro = info.linuxDistro || info.distribution || "";
    const platform = info.platform || "";
    if (files && distro !== "kali" && platform !== "linux") {
      pluginList.value = files;
    }
    return pluginList.value;
  }

  return { pluginList, getPluginFilesList };
});
