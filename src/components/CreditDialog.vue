<script setup>
/**
 * Credit dialogs.
 *
 * The reference shows one of two dialogs when a request comes back with a
 * credit-related status: `notsubscribed` when the free allowance is spent
 * and the account needs a subscription, and `notlimit` when the balance is
 * empty and needs a top-up.
 *
 * The recreation points the AI at the user's own provider, so it has no
 * server-side balance of its own. These dialogs are wired to the status
 * codes the reference uses, so they appear if the provider the user
 * configured answers with one.
 */
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";
import { CircleX, ExternalLink, CreditCard, Crown } from "lucide-vue-next";

const { t } = useI18n();
const dialogStore = useDialogStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close"]);

const props = defineProps({
  mode: { type: String, required: true }
});

const SUBSCRIBE_URL = "https://www.penligent.ai/subscribe";
const RECHARGE_URL = "https://www.penligent.ai/recharge";

/** The reference offers a free trial from the subscription notice. */
function tryIt() {
  emit("close");
  window.dispatchEvent(new CustomEvent("penligent:notice-subscribe"));
}

async function open() {
  const url = props.mode === "not-subscribed" ? SUBSCRIBE_URL : RECHARGE_URL;
  if (window.systemAPI?.openExternal) {
    await window.systemAPI.openExternal(url);
  } else {
    window.open(url, "_blank");
  }
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title">
            <Crown v-if="mode === 'notsubscribed'" :size="18" />
            <CreditCard v-else :size="18" />
            <span>
              {{ mode === "not-subscribed" ? t("notsubscribed.未订阅提示") : t("notlimit.积分不足提示") }}
            </span>
          </div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>

        <div class="body">
          <div class="line">
            {{ mode === "not-subscribed" ? t("notsubscribed.当前免费积分已用完") : t("notlimit.当前积分已用完") }}
          </div>
          <div class="line">
            {{
              mode === "not-subscribed"
                ? t("notsubscribed.请订阅专业版继续使用Penligent。")
                : t("notlimit.请充值继续使用Penligent。")
            }}
          </div>
        </div>

        <div class="button-container">
          <button class="button" @click="emit('close')">
            <span>{{ t("agent-nav.取消") }}</span>
          </button>
          <button class="button" @click="emit('close')">
            {{
              mode === "not-subscribed"
                ? t("notsubscribed.已订阅完成")
                : t("notlimit.已充值完成")
            }}
          </button>
          <button class="button" @click="tryIt">
            {{ t("notice-subscribe.试用一下") }}
          </button>
          <button class="button button-primary" @click="open">
            <ExternalLink :size="13" />
            <span>
              {{ mode === "not-subscribed" ? t("notsubscribed.前往订阅页面") : t("notlimit.前往充值页面") }}
            </span>
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
  width: min(440px, 92vw);
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.header {
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

.close-button {
  cursor: pointer;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.line {
  font-size: 0.9rem;
  line-height: 1.5;
}

.button-container {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background-color: #0000001a;
  color: var(--foreground);
  cursor: pointer;
}

.button:hover {
  background-color: var(--button-hover);
}

.button-primary {
  background-color: var(--button-bg);
}
</style>
