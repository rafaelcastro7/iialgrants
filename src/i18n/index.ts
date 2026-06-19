import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

// Bilingual EN/FR scaffolding — required per ADR-008 (Canadian market, Quebec Law 25).
// Detection order: localStorage -> navigator -> htmlTag. Fallback: en.
if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        fr: { translation: fr },
      },
      lng: "en",
      fallbackLng: "en",
      supportedLngs: ["en", "fr"],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        caches: ["localStorage"],
        lookupLocalStorage: "iial.lang",
      },
    });
}

export default i18n;
