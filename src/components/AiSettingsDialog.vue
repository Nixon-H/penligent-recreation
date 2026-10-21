<script setup>
/**
 * AI provider settings.
 *
 * Replaces the reference's account-gated AI access with a local, explicit
 * provider configuration. Two provider families are offered:
 *
 *   OpenAI-compatible — any endpoint speaking the OpenAI chat-completions
 *                      protocol (OpenAI, Ollama, LM Studio, vLLM, DeepSeek,
 *                      Groq, OpenRouter, …).
 *   Anthropic        — the Anthropic Messages API.
 *
 * The API key is stored locally in the application's own `user_settings`
 * table, exactly as the reference stores its LLM token (`res_token`) in the
 * `users` table. It never leaves the machine except in requests to the
 * provider you configure.
 */
import { ref, computed, onMounted } from "vue";
import { Cpu, CircleX, Check, Loader2, Eye, EyeOff, Minus, Plus, Info } from "lucide-vue-next";
import { useAiStore, resolveEndpoint } from "@/stores/ai";
import { useNoticeStore } from "@/stores/notice";
import { useVersionStore } from "@/stores/version";
import { LANGUAGES, setLanguage } from "@/locales";
import { useThemeStore, useFontSizeStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";

const dialogStore = useDialogStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close"]);
const aiStore = useAiStore();
const { t, locale } = useI18n();
const themeStore = useThemeStore();
const fontSizeStore = useFontSizeStore();
const userStore = useUserStore();
const appVersion = ref("");
const checking = ref(false);
const noticeStore = useNoticeStore();
const versionStore = useVersionStore();

const PROVIDERS = [
  {
    key: "openai",
    label: "OpenAI-compatible",
    hint: "OpenAI, Ollama, LM Studio, vLLM, DeepSeek, Groq, OpenRouter, …",
    baseLabel: "Base URL",
    basePlaceholder: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4o-mini"
  },
  {
    key: "anthropic",
    label: "Anthropic",
    hint: "Anthropic Messages API (api.anthropic.com or a compatible gateway)",
    baseLabel: "Base URL",
    basePlaceholder: "https://api.anthropic.com",
    modelPlaceholder: "claude-sonnet-4-5"
  },
  {
    key: "penligent",
    label: "Penligent",
    hint: "The original service. Its model list is public; the agent endpoint needs a token.",
    baseLabel: "Service URL",
    basePlaceholder: "https://api.penligent.ai",
    modelPlaceholder: "penliai-4-5-101"
  }
];

const form = ref({
  provider: "openai",
  baseUrl: "",
  apiKey: "",
  model: "",
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: ""
});
const showKey = ref(false);
const testing = ref(false);
const testResult = ref(null);
const saving = ref(false);
const keyTouched = ref(false);

const provider = computed(
  () => PROVIDERS.find((p) => p.key === form.value.provider) ?? PROVIDERS[0]
);

const endpointPreview = computed(() =>
  resolveEndpoint(form.value.provider, form.value.baseUrl)
);

function selectProvider(key) {
  if (form.value.provider === key) return;
  form.value.provider = key;
  const fallback =
    key === "anthropic"
      ? { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" }
      : { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" };
  form.value.baseUrl = fallback.baseUrl;
  form.value.model = fallback.model;
  testResult.value = null;
}

async function runTest() {
  testing.value = true;
  testResult.value = null;
  try {
    const result = await aiStore.test({
      provider: form.value.provider,
      baseUrl: form.value.baseUrl,
      // The saved key is reused unless the user typed a new one.
      apiKey: keyTouched.value ? form.value.apiKey : undefined,
      model: form.value.model
    });
    testResult.value = result;
    if (result.success) {
      noticeStore.info("Connection OK", result.endpoint || "Provider reachable");
    } else {
      noticeStore.error("Connection Failed", result.error);
    }
  } finally {
    testing.value = false;
  }
}

/**
 * Ask the version endpoint whether a newer release exists.
 *
 * The reference's manual check opens the update notice when there is a newer
 * release and says so when there is not.
 */
async function checkUpdate() {
  checking.value = true;
  try {
    await versionStore.checkVersionManual();
  } finally {
    checking.value = false;
  }
}

/**
 * Switch the interface language.
 *
 * The reference persists the choice in the `user_settings` table as well as
 * in the locale store.
 */
async function onLanguage(code) {
  setLanguage(code);
  await userStore.setSetting("language", code, "string", "Interface language");
}

/** Read the model list from the provider and preselect the first entry. */
async function loadModels() {
  const result = await aiStore.loadModels({
    provider: form.value.provider,
    baseUrl: form.value.baseUrl,
    apiKey: keyTouched.value ? form.value.apiKey : undefined
  });
  if (result?.success && result.models?.length) {
    if (!result.models.includes(form.value.model)) {
      form.value.model = result.models[0];
    }
    noticeStore.info("Models Loaded", `${result.models.length} models available.`);
  } else {
    noticeStore.warn?.("Models Unavailable", result?.error || "The provider did not return a model list.");
  }
}

/** Remove the stored key. */
async function clearKey() {
  await aiStore.clearKey();
  form.value.apiKey = "";
  keyTouched.value = true;
  testResult.value = null;
  noticeStore.info("API Key Cleared", "The stored key has been removed.");
}

async function save() {
  saving.value = true;
  try {
    const payload = {
      provider: form.value.provider,
      baseUrl: form.value.baseUrl,
      model: form.value.model,
      temperature: Number(form.value.temperature),
      maxTokens: Number(form.value.maxTokens),
      systemPrompt: form.value.systemPrompt
    };
    if (keyTouched.value) payload.apiKey = form.value.apiKey;
    await aiStore.save(payload);
    noticeStore.info("AI Settings Saved", `${provider.value.label} · ${form.value.model}`);
    emit("close");
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  appVersion.value = (await window.versionAPI.get()) || "";
  await aiStore.load();
  form.value = {
    provider: aiStore.config.provider,
    baseUrl: aiStore.config.baseUrl,
    apiKey: "",
    model: aiStore.config.model,
    temperature: aiStore.config.temperature,
    maxTokens: aiStore.config.maxTokens,
    systemPrompt: aiStore.config.systemPrompt
  };
});
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title">
            <Cpu :size="18" />
            <span>AI Provider</span>
          </div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <p class="dialog-hint">
          Penligent talks to the model provider you configure here. Nothing is
          sent to Penligent's own service, and no Penligent account is required.
        </p>

        <!-- The reference's user section carries the account's plan page and
             its sign-out. This build has no account, so both are gone: a
             control that cannot do anything is worse than no control. The
             local profile is still shown. -->
        <div class="user-info-row">
          <div class="user-info-label">{{ t("setting.用户信息") }}</div>
          <div class="user-info-value">{{ userStore.displayName }}</div>
        </div>

        <div class="shared-note">
          <Info :size="13" />
          <span>
            This configuration is shared by every profile on this installation, so
            anyone who opens Penligent can use the same model.
          </span>
        </div>

        <div class="input-container">
          <div class="input-label">Provider</div>
          <div class="provider-grid">
            <div
              v-for="item in PROVIDERS"
              :key="item.key"
              class="provider-option"
              :class="{ active: form.provider === item.key }"
              @click="selectProvider(item.key)"
            >
              <div class="provider-option-title">{{ item.label }}</div>
              <div class="provider-option-hint">{{ item.hint }}</div>
            </div>
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">{{ provider.baseLabel }}</div>
          <div class="input-field">
            <input
              v-model="form.baseUrl"
              class="input-field-input"
              type="text"
              :placeholder="provider.basePlaceholder"
            />
          </div>
          <div v-if="endpointPreview" class="input-hint">
            Requests go to <code>{{ endpointPreview }}</code>
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">
            API Key
            <span class="input-label-optional">optional for local models</span>
          </div>
          <div class="input-field">
            <input
              v-model="form.apiKey"
              class="input-field-input"
              :type="showKey ? 'text' : 'password'"
              placeholder="sk-…"
              @input="keyTouched = true"
            />
            <button class="input-field-action" type="button" @click="showKey = !showKey">
              <EyeOff v-if="showKey" :size="14" />
              <Eye v-else :size="14" />
            </button>
          </div>
          <div v-if="aiStore.hasApiKey && !keyTouched" class="input-hint">
            <template v-if="aiStore.config.apiKey">
              A key is already saved ({{ aiStore.config.apiKey }}). Leave this
              empty to keep it.
            </template>
            <template v-else>
              A key is already saved. Leave this empty to keep it.
            </template>
            <button class="clear-key-button" type="button" @click="clearKey">
              Clear saved key
            </button>
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">
            {{ t("setting.当前版本") }}
            <span class="input-label-optional">{{ appVersion }}</span>
          </div>
          <div class="input-field">
            <button class="check-update-button" :disabled="checking" @click="checkUpdate">
              <Loader2 v-if="checking" class="spin" :size="13" />
              <span>{{ checking ? t("setting.检查更新中") : t("setting.检查更新") }}</span>
            </button>
          </div>
        </div>

        <div class="setting-content-item">
          <div class="setting-content-item-label">{{ t("setting.语言") }}:</div>
          <div
            v-for="item in LANGUAGES"
            :key="item.code"
            class="item-button"
            :class="{ 'button-active': locale === item.code }"
            @click="onLanguage(item.code)"
          >
            {{ item.label }}
          </div>
        </div>

        <div class="setting-content-item">
          <div class="setting-content-item-label">{{ t("setting.字体大小") }}:</div>
          <button class="item-button icon" type="button" @click="fontSizeStore.decrease()">
            <Minus :size="13" :stroke-width="2" />
          </button>
          <div class="setting-content-item-value">{{ fontSizeStore.rootFontSize }}</div>
          <button class="item-button icon" type="button" @click="fontSizeStore.increase()">
            <Plus :size="13" :stroke-width="2" />
          </button>
        </div>

        <div class="setting-content-item">
          <div class="setting-content-item-label">{{ t("setting.主题") }}:</div>
          <div
            class="item-button"
            :class="{ 'button-active': themeStore.theme === 'dark' }"
            @click="themeStore.setTheme('dark')"
          >
            {{ t("setting.暗黑模式") }}
          </div>
          <div
            class="item-button"
            :class="{ 'button-active': themeStore.theme === 'light' }"
            @click="themeStore.setTheme('light')"
          >
            {{ t("setting.浅色模式") }}
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">
            Model
            <button class="load-models" type="button" @click="loadModels">
              {{ aiStore.modelsLoading ? "Loading..." : "Load models" }}
            </button>
          </div>
          <div class="input-field">
            <input
              v-model="form.model"
              class="input-field-input"
              type="text"
              :placeholder="provider.modelPlaceholder"
              list="ai-model-options"
            />
            <datalist id="ai-model-options">
              <option v-for="model in aiStore.models" :key="model" :value="model" />
            </datalist>
          </div>
          <div v-if="aiStore.models.length" class="input-hint">
            {{ aiStore.models.length }} models offered by this provider.
          </div>
        </div>

        <div class="input-row">
          <div class="input-container">
            <div class="input-label">Temperature</div>
            <div class="input-field">
              <input
                v-model="form.temperature"
                class="input-field-input"
                type="number"
                min="0"
                max="2"
                step="0.1"
              />
            </div>
          </div>
          <div class="input-container">
            <div class="input-label">Max Tokens</div>
            <div class="input-field">
              <input
                v-model="form.maxTokens"
                class="input-field-input"
                type="number"
                min="256"
                step="256"
              />
            </div>
          </div>
        </div>

        <div class="input-container">
          <div class="input-label">
            System Prompt
            <span class="input-label-optional">optional</span>
          </div>
          <div class="input-field">
            <textarea
              v-model="form.systemPrompt"
              class="input-field-input"
              rows="3"
              placeholder="You are a penetration testing assistant…"
            />
          </div>
        </div>

        <div v-if="testResult" class="test-result" :class="{ ok: testResult.success }">
          <Check v-if="testResult.success" :size="14" />
          <CircleX v-else :size="14" />
          <span>
            {{ testResult.success ? "Connection succeeded" : testResult.error }}
          </span>
        </div>

        <div class="button-container">
          <button class="button button-cancel" @click="emit('close')">Cancel</button>
          <button class="button" :disabled="testing" @click="runTest">
            <Loader2 v-if="testing" class="spin" :size="13" />
            <span>Test Connection</span>
          </button>
          <button class="button button-create" :disabled="saving" @click="save">
            {{ saving ? "Saving..." : "Save" }}
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
  width: min(620px, 92vw);
  max-height: calc(100vh - 60px);
  overflow-y: auto;
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1rem;
  font-weight: 700;
}

.header .close-button {
  cursor: pointer;
}

.dialog-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.5;
}

.shared-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background-color: #0000001a;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--muted);
}

.setting-content-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.setting-content-item-label {
  font-size: 0.9rem;
  font-weight: 700;
  margin-right: 4px;
}

.setting-content-item-value {
  min-width: 26px;
  text-align: center;
  font-size: 0.85rem;
}

.item-button {
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1.4;
}

.item-button:hover {
  background-color: var(--button-hover);
}

.item-button.button-active {
  background-color: var(--nav-active-bg);
  border-color: var(--nav-active-border);
}

.item-button.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
}

.input-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.input-row {
  width: 100%;
  display: flex;
  gap: 10px;
}

.input-row .shared-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background-color: #0000001a;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--muted);
}

.setting-content-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.setting-content-item-label {
  font-size: 0.9rem;
  font-weight: 700;
  margin-right: 4px;
}

.setting-content-item-value {
  min-width: 26px;
  text-align: center;
  font-size: 0.85rem;
}

.item-button {
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1.4;
}

.item-button:hover {
  background-color: var(--button-hover);
}

.item-button.button-active {
  background-color: var(--nav-active-bg);
  border-color: var(--nav-active-border);
}

.item-button.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
}

.input-container {
  flex: 1;
}

.input-label {
  font-size: 1rem;
  font-weight: 700;
  display: flex;
  align-items: flex-start;
  gap: 5px;
}

.input-label-optional {
  font-size: 0.7rem;
  font-weight: 400;
  background-color: var(--border);
  padding: 1px 4px;
  border-radius: 2px;
}

.input-field {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
}

.input-field-input {
  min-width: 350px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: #0000001a;
  color: var(--foreground);
  resize: none;
  font-family: inherit;
}

.input-field-input:focus {
  outline: none;
}

.input-field-action {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 5px;
  cursor: pointer;
  color: var(--muted);
}

.input-field-action:hover {
  background-color: var(--button-hover);
  color: var(--foreground);
}

.load-models {
  font-size: 0.7rem;
  font-weight: 400;
  background-color: var(--border);
  padding: 1px 4px;
  border-radius: 2px;
  cursor: pointer;
}

.load-models:hover {
  background-color: var(--button-hover);
}

.input-hint {
  font-size: 0.75rem;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 8px;
}

.clear-key-button {
  padding: 0 4px;
  font-size: 0.75rem;
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: 3px;
  cursor: pointer;
}

.clear-key-button:hover {
  background-color: var(--danger);
  color: var(--background);
}

.input-hint code {
  font-family: "Courier New", monospace;
  word-break: break-all;
}

.provider-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.provider-option {
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.provider-option:hover {
  border-color: var(--button-bg);
}

.provider-option.active {
  border-color: var(--button-bg);
  background: color-mix(in srgb, var(--button-bg) 14%, var(--background));
}

.provider-option-title {
  font-weight: 700;
  font-size: 0.9rem;
}

.provider-option-hint {
  font-size: 0.7rem;
  color: var(--muted);
  line-height: 1.4;
}

.test-result {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  padding: 6px 8px;
  border-radius: 5px;
  border: 1px solid var(--danger);
  color: var(--danger);
  word-break: break-word;
}

.test-result.ok {
  border-color: var(--success);
  color: var(--success);
}

.button-container {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.button {
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid var(--border);
  cursor: pointer;
  color: var(--foreground);
  display: flex;
  align-items: center;
  gap: 5px;
}

.button:hover {
  background-color: var(--button-hover);
}

.button:disabled {
  opacity: 0.6;
  cursor: default;
}

.button-cancel {
  background-color: #0000001a;
}

.button-create {
  background-color: var(--button-bg);
  border-color: var(--button-bg);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
