import { defineStore } from "pinia";

/**
 * Notification stack.
 *
 * The reference renders toasts into `.notice-container` (absolute, top:30px,
 * right:.5vw) as `.notice-item` elements with an `info` / `warning` / `error`
 * variant and a close button in the top-right corner.
 *
 * Its store is:
 *
 *   addNotice({ id, title, content, type, duration })
 *   removeNotice(id)
 *   clearNotice()
 *
 * The id is generated when it is missing, a notice whose content is already
 * on the stack is not added twice, and a duration removes it when it expires.
 */
export const useNoticeStore = defineStore("notice", {
  state: () => ({
    noticeList: []
  }),
  actions: {
    addNotice(notice) {
      const entry = {
        id: notice.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 15)}`,
        title: notice.title ?? "",
        content: notice.content ?? "",
        type: notice.type ?? "info",
        duration: notice.duration ?? 0
      };
      if (!this.noticeList.find((item) => item.content === entry.content)) {
        this.noticeList.push(entry);
        if (entry.duration) {
          setTimeout(() => this.removeNotice(entry.id), entry.duration);
        }
      }
      return entry.id;
    },
    removeNotice(id) {
      this.noticeList = this.noticeList.filter((item) => item.id !== id);
    },
    clearNotice() {
      this.noticeList = [];
    },

    /* The three variants the reference uses, with the same titles. */
    info(title, content = "", duration = 6000) {
      return this.addNotice({ title, content, type: "info", duration });
    },
    warning(title, content = "", duration = 6000) {
      return this.addNotice({ title, content, type: "warning", duration });
    },
    error(title, content = "", duration = 6000) {
      return this.addNotice({ title, content, type: "error", duration });
    },
    success(title, content = "", duration = 6000) {
      return this.addNotice({ title, content, type: "success", duration });
    }
  }
});
