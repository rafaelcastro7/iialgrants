import i18n from "./index";

// Client-only locale sync. Call from useEffect to avoid SSR hydration mismatch.
export function syncClientLocale() {
  if (typeof window === "undefined") return;
  const stored = window.localStorage.getItem("iial.lang");
  const lang = stored ?? (navigator.language?.startsWith("fr") ? "fr" : "en");
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
}
