import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * The security-toolbox navigation.
 *
 * The reference's toolbox dialog holds several tools and remembers which
 * one is showing; the agent-security dialog opens it directly on the
 * `agent-skills-detection` tab. This store holds that selection.
 */
export const useToolsStore = defineStore("tools", () => {
  const activeToolsNav = ref("http-to-python");

  function setActiveToolsNav(name) {
    if (name) activeToolsNav.value = name;
  }

  return { activeToolsNav, setActiveToolsNav };
});
