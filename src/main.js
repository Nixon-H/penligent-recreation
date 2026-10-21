import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import i18n from "./locales";

import "./styles/theme.css";
import "./styles/global.css";

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(i18n);

/**
 * The event bus.
 *
 * The components talk to each other through `penligent:*` window events. A
 * template cannot reach the real `window` — Vue compiles a template's
 * `window` to `_ctx.window`, and the public-instance proxy has no such key
 * — so the bus is exposed as a global property. It is not called `$emit`,
 * because Vue already defines that on every component instance.
 */
app.config.globalProperties.$bus = (name, detail) =>
  window.dispatchEvent(new CustomEvent(name, { detail }));

app.mount("#app");
