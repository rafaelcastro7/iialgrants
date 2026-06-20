import i18n from "./index";

// English-only — force EN on every client load and pin <html lang="en">.
export function syncClientLocale() {
  if (typeof window === "undefined") return;
  if (i18n.language !== "en") void i18n.changeLanguage("en");
  try {
    window.localStorage.setItem("iial.lang", "en");
  } catch {
    /* storage unavailable */
  }
  document.documentElement.lang = "en";
}
