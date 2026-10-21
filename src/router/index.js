import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import ProxyListView from "@/views/ProxyListView.vue";

/**
 * Route table recovered from the reference renderer bundle
 * (`dist/assets/index-BuPJTjKv.js`, de-obfuscated with webcrack):
 *
 *   routes: [{ path: "/", name: "home", component: HomeView },
 *            { path: "/proxy-list", name: "proxy", component: ProxyListView },
 *            { path: "/splash-window", name: "splash", component: SplashView }]
 *
 * The reference uses a hash router: the packaged app is loaded with
 * `loadFile(..., { hash: "proxy-list" })` and the dev server uses
 * `http://localhost:5173/#/proxy-list`.
 */
const routes = [
  { path: "/", name: "home", component: HomeView },
  { path: "/proxy-list", name: "proxy", component: ProxyListView },
  {
    path: "/splash-window",
    name: "splash",
    component: () => import("@/views/SplashView.vue")
  }
];

export default createRouter({
  history: createWebHashHistory(),
  routes
});
