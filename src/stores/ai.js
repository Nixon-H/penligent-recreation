import { defineStore } from "pinia";

const bridge = () => (typeof window !== "undefined" ? window.aiAPI : null);

/**
 * AI provider store.
 *
 * The reconstruction lets the user point the agent at their own model
 * instead of Penligent's proprietary service:
 *
 *   "openai"    — any OpenAI-compatible endpoint. The base URL is the
 *                 OpenAI-style root, e.g.
 *                   https://api.openai.com/v1
 *                   http://localhost:11434/v1        (Ollama)
 *                   http://localhost:1234/v1         (LM Studio)
 *                   http://localhost:8000/v1         (vLLM)
 *                   https://api.deepseek.com/v1
 *                   https://api.groq.com/openai/v1
 *                   https://openrouter.ai/api/v1
 *                 The request goes to {baseUrl}/chat/completions.
 *
 *   "anthropic" — the Anthropic Messages API. The base URL is the API root,
 *                 e.g. https://api.anthropic.com, and the request goes to
 *                 {baseUrl}/v1/messages.
 */
/**
 * Resolve the request endpoint from a base URL.
 *
 * Mirrors `resolveEndpoint` in electron/ipc/ai.cjs so the preview in the
 * settings dialog matches what the main process will call.
 */
export function resolveEndpoint(provider, baseUrl) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base) return "";
  if (provider === "penligent") {
    if (base.endsWith("/api/agent/main/v1/messages")) return base;
    return `${base}/api/agent/main/v1/messages`;
  }
  if (provider === "anthropic") {
    if (base.endsWith("/v1/messages")) return base;
    if (base.endsWith("/v1")) return `${base}/messages`;
    return `${base}/v1/messages`;
  }
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/v1")) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/**
 * The provider choices.
 *
 * `openai` and `anthropic` are the families a user can point at their own
 * endpoint. `penligent` is the original's own service, offered so that
 * anyone can use the reference's models; its model list is public and its
 * messages endpoint needs a token.
 */
export const PROVIDERS = [
  {
    key: "openai",
    label: "OpenAI-compatible",
    baseLabel: "Base URL",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini"
  },
  {
    key: "anthropic",
    label: "Anthropic",
    baseLabel: "Base URL",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5"
  },
  {
    key: "penligent",
    label: "Penligent",
    baseLabel: "Service URL",
    defaultBaseUrl: "https://api.penligent.ai",
    defaultModel: "penliai-4-5-101"
  }
];

export const useAiStore = defineStore("ai", {
  state: () => ({
    config: {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: ""
    },
    hasApiKey: false,
    configured: false,
    loading: false,
    endpoint: "",
    models: [],
    modelsLoading: false
  }),

  getters: {
    providerLabel: (state) =>
      state.config.provider === "anthropic" ? "Anthropic" : "OpenAI-compatible",
    /** The endpoint the main process will actually call. */
    endpoint: (state) => state.endpoint,
    /** The model every window agrees on. */
    selectedModel: (state) => state.selectedModel
  },

  actions: {
    async load() {
      const api = bridge();
      if (!api) return;
      this.loading = true;
      try {
        const config = await api.getConfig();
        this.applyConfig(config);
      } finally {
        this.loading = false;
      }
    },

    applyConfig(config) {
      if (!config) return;
      this.endpoint = config.endpoint || "";
      this.config = {
        provider: config.provider,
        baseUrl: config.baseUrl,
        // The main process only ever hands the renderer a masked key.
        apiKey: config.apiKey ?? "",
        model: config.model,
        temperature: Number(config.temperature ?? 0.7),
        maxTokens: Number(config.maxTokens ?? 4096),
        systemPrompt: config.systemPrompt ?? ""
      };
      this.hasApiKey = Boolean(config.hasApiKey);
      this.configured = Boolean(config.model);
    },

    async save(config) {
      const api = bridge();
      if (!api) return null;
      const saved = await api.setConfig(config);
      this.applyConfig(saved);
      return saved;
    },

    async clearKey() {
      const api = bridge();
      if (!api) return;
      const saved = await api.clearKey();
      this.applyConfig(saved);
    },

    async test(overrides) {
      const api = bridge();
      if (!api) return { success: false, error: "AI bridge unavailable" };
      return api.test(overrides);
    },

    /**
     * Raise the reference's credit dialogs.
     *
     * The reference inspects the error body of a failed request and opens
     * `not-subscribed` on code 80001 and `not-limit` on code 80002. The same
     * codes are honoured here, so a provider that answers with one produces
     * the same dialog the reference would show.
     */
    raiseCreditDialog(error) {
      const code = Number(error?.code ?? error?.response?.code ?? 0);
      if (code !== 80001 && code !== 80002) return false;
      const mode = code === 80001 ? "notsubscribed" : "notlimit";
      window.dispatchEvent(new CustomEvent("penligent:credit", { detail: { mode } }));
      return true;
    },

    /**
     * Read the provider's model list.
     *
     * The reference does the same against Penligent's service
     * (`GET /api/model/open` -> `{ data: { llm_list: [...] } }`) and selects
     * the first entry; the equivalent is served by every OpenAI-compatible
     * endpoint and by the Anthropic models API.
     */
    /**
     * The models Penligent publishes.
     *
     * The reference reads them from `GET /api/model/open`, keeps the
     * selection in the shared store under `llmListChoosed`, and falls back
     * to the hard-coded first model.
     */
    async fetchPenligentModels() {
      const result = await this.loadModels({
        provider: "penligent",
        baseUrl: "https://api.penligent.ai"
      });
      const models = result?.models || [];
      if (models.length && !this.selectedModel) {
        this.setSelectedModel(models[0]);
      }
      return models;
    },

    setSelectedModel(model) {
      this.selectedModel = model;
      // The shared store keeps every window on the same model.
      if (window.sharedStore) window.sharedStore.set("llmListChoosed", model);
    },

    async loadModels(overrides) {
      const api = bridge();
      if (!api) return { success: false, models: [] };
      this.modelsLoading = true;
      try {
        const result = await api.listModels(overrides);
        this.models = result?.models || [];
        return result;
      } finally {
        this.modelsLoading = false;
      }
    }
  }
});
