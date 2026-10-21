import { defineStore } from "pinia";

/**
 * The reference keys the theme in localStorage under "theme" and writes the
 * same value to the `user_settings` table, so both are reproduced here.
 */
const THEME_KEY = "theme";
const FONT_KEY = "font_size";

/**
 * Theme store.
 *
 * The reference applies a `theme-light` / `theme-dark` class to <html> and
 * defines both palettes in CSS (see src/styles/theme.css). A fresh profile
 * starts in the light theme — verified at runtime: the first launched
 * reference session had `document.documentElement.className === "theme-light"`.
 */
/**
 * The centre navigation.
 *
 * The reference keeps the selected centre view in a store, so anything can
 * switch it — selecting a project moves the centre to the overview, for
 * instance.
 */
export const useNavStore = defineStore("nav", {
  state: () => ({
    navStr: "test_list"
  }),
  actions: {
    setNav(name) {
      this.navStr = name;
    }
  }
});

export const useThemeStore = defineStore("theme", {
  state: () => ({
    theme: localStorage.getItem(THEME_KEY) || "light"
  }),
  actions: {
    initTheme() {
      this.apply();
    },
    apply() {
      const root = document.documentElement;
      root.classList.remove("theme-light", "theme-dark");
      root.classList.add(`theme-${this.theme}`);
      localStorage.setItem(THEME_KEY, this.theme);
    },
    setTheme(theme) {
      this.theme = theme === "dark" ? "dark" : "light";
      this.apply();
      window.dbAPI?.setUserSetting?.(THEME_KEY, this.theme, "string", "setTheme");
    },
    toggle() {
      this.setTheme(this.theme === "light" ? "dark" : "light");
    }
  }
});

/**
 * Font-size store.
 *
 * The reference sets an inline `font-size: 12px` on <html> (verified at
 * runtime: `document.documentElement.getAttribute('style')` ===
 * "font-size: 12px;"), so every `rem` unit in the reference's stylesheet is
 * relative to 12px rather than the 16px browser default. This is the single
 * most important metric for visual fidelity, and it is reproduced here.
 *
 * The reference does not declare a font-family anywhere; the computed value
 * is therefore the user agent default ("Times New Roman"). That omission is
 * preserved as well.
 */
export const useFontSizeStore = defineStore("fontSize", {
  state: () => ({
    /**
     * The scale is a multiplier, as in the reference: 1 means 12px, and the
     * reference's presets are 0.875, 1, 1.125 and 1.25. The step is 0.125
     * and the ceiling is 1.5.
     */
    scale: Number(localStorage.getItem(FONT_KEY) || 1)
  }),
  getters: {
    /** Root font size in px — 12px at the default scale of 1. */
    rootFontSize: (state) => state.scale * 12,
    presets: () => ({ small: 0.875, medium: 1, large: 1.125, xlarge: 1.25 })
  },
  actions: {
    initFontSize() {
      this.apply();
    },
    apply() {
      document.documentElement.style.fontSize = `${this.scale * 12}px`;
      localStorage.setItem(FONT_KEY, String(this.scale));
    },
    /** Persist the scale the way the reference does. */
    persist() {
      window.dbAPI?.setUserSetting?.(FONT_KEY, String(this.scale), "string", "setFontSize");
    },
    setFontSize(scale) {
      this.scale = Math.min(1.5, Math.max(0.5, Number(scale) || 1));
      this.apply();
      this.persist();
    },
    setPreset(name) {
      const preset = this.presets[name];
      if (preset) this.setFontSize(preset);
    },
    increase() {
      this.setFontSize(this.scale + 0.125);
    },
    decrease() {
      this.setFontSize(this.scale - 0.125);
    }
  }
});
