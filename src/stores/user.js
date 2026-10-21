import { defineStore } from "pinia";

const bridge = () => (typeof window !== "undefined" ? window.dbAPI : null);

/**
 * User / session store.
 *
 * The reference application requires a Penligent account for every
 * server-backed feature and shows the amber "Not Logged In" notice when the
 * session is missing. That service is not reachable from this environment, so
 * the reconstruction uses a **local profile** instead: a single row in the
 * `users` table is created on first run and is never gated on.
 *
 * The local profile keeps the reference's schema intact — `user_name`,
 * `user_email`, `user_token` and `res_token` are all still populated — so
 * the projects, chat records and execution results that reference a user
 * continue to do so.
 */
export const useUserStore = defineStore("user", {
  state: () => ({
    user: null,
    settings: {}
  }),

  getters: {
    /** A local profile always exists, so the app is never gated. */
    isLoggedIn: (state) => Boolean(state.user),
    displayName: (state) => state.user?.user_name || "Local User"
  },

  actions: {
    /**
     * Load the local profile, creating it on first run.
     * Returns the profile so callers can rely on it existing.
     */
    async loadUser() {
      const api = bridge();
      if (!api) return null;
      let user = (await api.getUserInfo()) || null;
      if (!user) {
        user = await this.createLocalProfile();
      }
      this.user = user;
      return user;
    },

    async createLocalProfile() {
      const api = bridge();
      if (!api) return null;
      const payload = {
        user_name: "Local User",
        user_email: "local@localhost",
        user_token: `local-${Date.now().toString(36)}`,
        res_token: ""
      };
      await api.addUser(payload);
      const created = (await api.getUserInfo()) || null;
      this.user = created;
      return created;
    },

    /**
     * Load the settings.
     *
     * The reference makes the `language` row the source of truth: it applies
     * it to the locale, to `localStorage` and to the shared store, and it
     * does so again whenever the Settings dialog opens.
     */
    async loadSettings() {
      const api = bridge();
      if (!api) return;
      const rows = (await api.getUserSettings()) || [];
      this.settings = Object.fromEntries(
        rows.map((row) => [row.setting_key, row.setting_value])
      );
      const language = this.settings.language;
      if (language) {
        // The store records the language; the locale module applies it, so
        // the store does not have to load the message tables.
        localStorage.setItem("lang", language);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("penligent:language", { detail: language }));
        }
      }
    },

    async setSetting(key, value, type = "string", description = "") {
      const api = bridge();
      if (!api) return;
      await api.setUserSetting(key, value, type, description);
      this.settings[key] = value;
    },

    /** Rename the local profile. */
    async updateProfile({ user_name, user_email }) {
      const api = bridge();
      if (!api || !this.user) return;
      await api.updateUserInfo({
        id: this.user.id,
        user_name: user_name ?? this.user.user_name,
        user_email: user_email ?? this.user.user_email,
        user_token: this.user.user_token,
        res_token: this.user.res_token
      });
      await this.loadUser();
    }
  }
});
