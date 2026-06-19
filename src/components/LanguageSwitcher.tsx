import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const next = i18n.language?.startsWith("fr") ? "en" : "fr";
  const toggle = () => {
    void i18n.changeLanguage(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("iial.lang", next);
      document.documentElement.lang = next;
    }
  };
  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label={t("lang.switch")}>
      {next.toUpperCase()}
    </Button>
  );
}
