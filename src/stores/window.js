import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * The window store.
 *
 * The reference keeps the window's state and drives its title bar from
 * here: the state is read once when the application starts, and the three
 * buttons act on the focused window.
 *
 *   - *restore* unmaximises a maximised window, leaves full screen if the
 *     window is in it, and maximises it otherwise;
 *   - *close* first marks the runs that are still going as stopped, and
 *     only then closes the window.
 */
export const useWindowStore = defineStore("window", () => {
  const windowState = ref({ isMaximized: false, isMinimized: false, isFullScreen: false });

  /** Read the window's state. */
  async function initWindowInfo() {
    const state = await window.windowAPI?.getWindowState?.();
    if (state) windowState.value = state;
    return windowState.value;
  }

  function minimize() {
    window.windowAPI?.minimize?.();
  }

  function maximize() {
    window.windowAPI?.maximize?.();
  }

  function restore() {
    if (windowState.value.isMaximized) {
      window.windowAPI?.unmaximize?.();
    } else if (windowState.value.isFullScreen) {
      window.windowAPI?.exitFullScreen?.();
    } else {
      window.windowAPI?.maximize?.();
    }
  }

  function close() {
    // The runs that are still going are marked as stopped first, so the
    // history does not keep them as running for ever. The reference does
    // not wait for the write before it closes the window, and neither does
    // this — the application shuts down straight away.
    void window.dbAPI?.cleanupRunningExecutionResults?.();
    window.windowAPI?.close?.();
  }

  return { windowState, initWindowInfo, minimize, maximize, restore, close };
});
