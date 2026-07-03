import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

// English-only per product decision (Jun 2026). French scaffolding removed.
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en"],
    interpolation: { escapeValue: false },
  });
}

export default i18n;
