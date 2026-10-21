import { defineStore } from "pinia";
import {
  buildActions,
  buildSystemPromptConfig,
  getNextTaskList,
  parseTestList,
  ToolSummaryQueue,
  toolMetadata
} from "../agent/orchestration.js";
import { useProjectStore } from "./project.js";
import { useUserStore } from "./user.js";

const bridge = () => (typeof window !== "undefined" ? window.dbAPI : null);

/**
 * Agent store.
 *
 * Implements the reference's client-side orchestration:
 *
 *   - the model is asked what to do next, given the same context and the same
 *     `system_prompt_config` variables the reference sends;
 *   - the client decides which task runs next (the recovered
 *     `getNextTaskList`), when the run is finished and when the report is
 *     generated;
 *   - tool executions are fed back, the analysis round is incremented and the
 *     model is asked again;
 *   - the "the target overview changed" updates are queued and flushed one at
 *     a time.
 */
export const useAgentStore = defineStore("agent", {
  state: () => ({
    analysisRound: 1,
    systemInfo: null,
    autoStatus: false,
    running: false,
    actions: [],
    lastError: "",
    queue: null
  }),

  actions: {
    /**
     * The configuration the reference sends as `system_prompt_config`.
     * Every value is client-side in the reference too.
     */
    systemPromptConfig(project, testList) {
      return buildSystemPromptConfig({
        clientInfo: this.clientInfo(),
        testTarget: project?.project_target || "",
        analysisRound: this.analysisRound,
        aiPythonPath: this.setting("ai_python"),
        aiScriptPath: this.setting("ai_script"),
        // The builder reads the test list as it is stored.
        testList: {
          focus_data: testList?.focus_data ?? null,
          test_list: testList?.test_list ?? null,
          focus_description: testList?.focus_description || ""
        },
        selfTools: this.selfTools()
      });
    },

    /**
     * The client information the reference reports.
     *
     * The reference sends the platform, the Linux distribution and a machine
     * identifier; the reconstruction reports what it can actually determine.
     */
    clientInfo() {
      const info = this.systemInfo || {};
      return {
        platform: info.platform || "linux",
        linuxDistro: info.linuxDistro || info.distribution || "",
        ID: info.ID || info.hostname || ""
      };
    },

    /**
     * The machine information the reference reports.
     *
     * The reference sends the platform, the Linux distribution and a machine
     * identifier; the recreation reports what it can determine.
     */
    async loadSystemInfo() {
      const api = typeof window !== "undefined" ? window.systemAPI : null;
      if (!api) return;
      const info = await api.getSystemInfo?.();
      if (info) this.systemInfo = info;
    },

    /** A user setting, read from the settings the environment dialog writes. */
    setting(key) {
      const settings = useUserStore().settings || {};
      const value = settings[key];
      return value === undefined || value === null ? "" : String(value);
    },

    /** The tools the agent may call, from the project's tool sets. */
    selfTools() {
      const sets = useProjectStore().toolSets || [];
      if (!Array.isArray(sets)) return [];
      return sets.map((set) => ({
        tool_type: set.tool_type,
        set_name: set.set_name,
        command_path: set.command_path,
        command_command: set.command_command,
        api_config: set.api_config,
        format_str: set.format_str,
        description: set.description
      }));
    },

    /** The next tasks the reference would queue for the current focus. */
    nextTasks(testList) {
      return getNextTaskList({
        test_list: parseTestList(testList?.test_list),
        focus_data: testList?.focus_data
      });
    },

    /**
     * Assemble the action list exactly as the reference does.
     *
     * @param {object} options
     * @param {Array}  options.chooseList    the actions the model proposed
     * @param {string} options.focusSummary the model's focus summary
     * @param {object} options.testList
     */
    plan({
      chooseList = [],
      focusSummary = null,
      focusDataStatus = null,
      testList = null,
      allTaskCount = 0,
      completeTaskCount = 0
    }) {
      const result = buildActions({
        chooseList,
        focusSummary,
        focusDataStatus,
        testList: {
          test_list: parseTestList(testList?.test_list),
          focus_data: testList?.focus_data
        },
        allTaskCount,
        completeTaskCount
      });
      this.actions = result.actions;
      return result;
    },

    /** Start a new run. */
    begin() {
      this.analysisRound = 1;
      this.autoStatus = true;
      this.running = true;
      this.lastError = "";
      this.actions = [];
    },

    /** Advance the loop, as the reference does after a tool execution. */
    advance() {
      this.analysisRound += 1;
    },

    /** The run is over. */
    end() {
      this.autoStatus = false;
      this.running = false;
      this.analysisRound = 1;
    },

    /**
     * The tool-summary queue: the reference serialises the "the target
     * overview changed" updates so the server merges one tool's output at a
     * time.
     */
    summaryQueue(flush) {
      if (!this.queue) this.queue = new ToolSummaryQueue(flush);
      return this.queue;
    },

    /** The metadata shape the reference sends back after an execution. */
    metadata(result) {
      return toolMetadata(result);
    }
  }
});
