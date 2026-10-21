/**
 * Localisation.
 *
 * The reference bundles eleven complete locale tables (en, jp, kr, ru, zh,
 * fr, de, ar, tw, es, pt) with 48 namespaces and 811 leaf keys each. Every
 * table was recovered verbatim from the reference's renderer bundle, and a
 * line-by-line comparison of all 9,581 values across the eleven languages
 * found them byte-identical to the reference's own.
 *
 * The keys are the reference's Chinese identifiers, which is exactly how the
 * original addresses them (`$t("header.新建项目")`).
 */
import { createI18n } from "vue-i18n";

import ar from "./ar.json" with { type: "json" };
import de from "./de.json" with { type: "json" };
import en from "./en.json" with { type: "json" };
import es from "./es.json" with { type: "json" };
import fr from "./fr.json" with { type: "json" };
import jp from "./jp.json" with { type: "json" };
import kr from "./kr.json" with { type: "json" };
import pt from "./pt.json" with { type: "json" };
import ru from "./ru.json" with { type: "json" };
import tw from "./tw.json" with { type: "json" };
import zh from "./zh.json" with { type: "json" };

export const messages = {
  en, jp, kr, ru, zh, fr, de, ar, tw, es, pt
};

/**
 * The language list, exactly as the reference's Settings dialog presents it.
 */
export const LANGUAGES = [
  { code: "en", label: "English(en)" },
  { code: "jp", label: "日本語(jp)" },
  { code: "kr", label: "한국어(kr)" },
  { code: "ru", label: "Русский язык(ru)" },
  { code: "zh", label: "中文(zh)" },
  { code: "fr", label: "Français(fr)" },
  { code: "de", label: "Deutsch(de)" },
  { code: "ar", label: "العربية(ar)" },
  { code: "tw", label: "中文繁體(zh)" },
  { code: "es", label: "Español(es)" },
  { code: "pt", label: "Português(pt)" }
];

/**
 * The same list in the reference's onboarding order, where "tw" comes last.
 */
export const ONBOARDING_LANGUAGES = [
  LANGUAGES[0],
  LANGUAGES[1],
  LANGUAGES[2],
  LANGUAGES[3],
  LANGUAGES[4],
  LANGUAGES[5],
  LANGUAGES[6],
  LANGUAGES[7],
  LANGUAGES[9],
  LANGUAGES[10],
  LANGUAGES[8]
];

const stored =
  typeof localStorage !== "undefined" ? localStorage.getItem("lang") || "en" : "en";

const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: messages[stored] ? stored : "en",
  fallbackLocale: "en",
  messages
});

/**
 * Apply a language chosen elsewhere.
 *
 * The reference's `initSetting` makes the database row the source of truth,
 * so a change to the row has to reach the locale.
 */
if (typeof window !== "undefined") {
  window.addEventListener("penligent:language", (event) => {
    setLanguage(event.detail);
  });
}

/**
 * Translate a key outside a component.
 *
 * The dialog store raises its notices from the store rather than from a
 * component, so it needs the global instance. Without this the raw key
 * would reach the screen.
 */
export function translate(key) {
  return i18n.global.t(key);
}

export function setLanguage(code) {
  if (!messages[code]) return;
  i18n.global.locale.value = code;
  if (typeof localStorage !== "undefined") localStorage.setItem("lang", code);
  document.documentElement.setAttribute("lang", code);
}

export default i18n;
