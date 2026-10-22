import { defineStore } from "pinia";
import { useNoticeStore } from "./notice.js";
import { translate } from "../locales/index.js";
import { testListCounts } from "../agent/orchestration.js";

const bridge = () => (typeof window !== "undefined" ? window.dbAPI : null);

/**
 * Project store — the project/task/finding state of the application.
 *
 * All data is persisted through the SQLite database in the Electron main
 * process (see electron/db/db.cjs). Nothing here is mocked: an empty result
 * means the database genuinely holds no rows.
 */
export const useProjectStore = defineStore("project", {
  state: () => ({
    projects: [],
    currentProject: null,
    risks: [],
    executionResults: [],
    testLists: [],
    chatRecords: [],
    toolSets: [],
    /** The runs that block a project switch, as in the reference. */
    verifying: [],
    chatting: false,
    executing: false,
    loading: false
  }),

  getters: {
    /** The target the project is scoped to, as the reference stores it. */
    currentTarget(state) {
      return state.currentProject?.project_target || "";
    },
    riskCounts(state) {
      const counts = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      for (const risk of state.risks) {
        counts.total += 1;
        const key = String(risk.severity || "info").toLowerCase();
        if (key in counts) counts[key] += 1;
      }
      return counts;
    },
    currentTestList(state) {
      if (!state.currentProject) return null;
      const list = state.testLists.find(
        (entry) => entry.project_id === state.currentProject.id
      );
      if (!list) return null;
      // The reference keeps the group and task counts on the test list.
      return { ...list, ...testListCounts(list.test_list) };
    }
  },

  actions: {
    async loadProjects() {
      const api = bridge();
      if (!api) return;
      this.loading = true;
      try {
        this.projects = (await api.getProjects()) || [];
      } finally {
        this.loading = false;
      }
    },

    /**
     * Select a project.
     *
     * The reference refuses the switch while a verification, a chat or a tool
     * run is in progress, and says which one is in the way.
     */
    async selectProject(project) {
      const noticeStore = useNoticeStore();
      if (this.verifying.length) {
        noticeStore.warning(
          translate("notice.验证中"),
          translate("notice.当前有正在验证的风险项，请等待验证完成")
        );
        return;
      }
      if (this.chatting) {
        noticeStore.warning(
          translate("notice.聊天中"),
          translate("notice.当前有正在聊天的消息，请等待聊天完成")
        );
        return;
      }
      if (this.executing) {
        noticeStore.warning(
          translate("notice.执行中"),
          translate("notice.当前有正在执行的任务，请等待执行完成")
        );
        return;
      }
      this.currentProject = project;
      if (!project) {
        this.risks = [];
        this.executionResults = [];
        this.testLists = [];
        this.chatRecords = [];
        return;
      }
      const api = bridge();
      if (!api) return;
      const [risks, results, lists, records] = await Promise.all([
        api.getRiskItems(project.id),
        api.getExecutionResults(project.id),
        api.getAllTestLists(),
        api.getChatRecords(project.id)
      ]);
      this.risks = risks || [];
      this.executionResults = results || [];
      this.testLists = lists || [];
      this.chatRecords = records || [];
    },

    async createProject({ name, description = "", target = "", testType = "", taskMode = "" }) {
      const api = bridge();
      if (!api) return null;
      await api.addProjects({
        project_name: name,
        project_description: description,
        task_tree: "[]",
        historysummary: "{}",
        user_name: "",
        project_target: target,
        task_mode: taskMode || "auto",
        testlist_type: testType || ""
      });
      await this.loadProjects();
      // The newest project is the one just created.
      return this.projects[0] || null;
    },

    /**
     * Delete a project.
     *
     * The reference keeps at least one project and refuses to delete a task
     * that is running.
     */
    async deleteProject(id) {
      const api = bridge();
      if (!api) return;
      if (this.projects.length <= 1) {
        throw new Error("at-least-one");
      }
      await api.deleteProject(id);
      if (this.currentProject?.id === id) this.currentProject = null;
      await this.loadProjects();
    },

    async loadToolSets() {
      const api = bridge();
      if (!api) return;
      this.toolSets = (await api.getSets()) || [];
    },

    async addToolSet(payload) {
      const api = bridge();
      if (!api) return;
      await api.addSets(payload);
      await this.loadToolSets();
    },

    async deleteToolSet(id) {
      const api = bridge();
      if (!api) return;
      await api.deleteSets(id);
      await this.loadToolSets();
    },

    /** Change the fields of a project. */
    async updateProject(id, data) {
      const api = bridge();
      if (!api || !id) return null;
      await api.updateProjectFields(id, data);
      await this.loadProjects();
      return true;
    },

    /**
     * The project with the same target, if there is one.
     *
     * The reference asks before it creates a second project for a target that
     * has already been tested.
     */
    async checkHasSameTarget(target) {
      const api = bridge();
      if (!api) return null;
      const projects = (await api.getProjects()) || [];
      const found = projects.find((row) => row.project_target === target);
      return found ? found.id : null;
    },

    /** Reload the risk list on its own, as the reference's does. */
    async refreshRisks() {
      const api = bridge();
      if (!api || !this.currentProject) return;
      this.risks = (await api.getRiskItems(this.currentProject.id)) || [];
    }
  }
});
