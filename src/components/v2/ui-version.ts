import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

export type UiVersion = "v1" | "v2";

export type UiVersionContextValue = {
  version: UiVersion;
  setVersion: (version: UiVersion) => void;
};

export const UI_VERSION_STORAGE_KEY = "iial.ui.version";
export const UiVersionContext = createContext<UiVersionContextValue | null>(null);

export function readInitialUiVersion(): UiVersion {
  if (typeof window === "undefined") return "v2";
  const stored = window.localStorage.getItem(UI_VERSION_STORAGE_KEY);
  return stored === "v1" || stored === "v2" ? stored : "v2";
}

export function persistUiVersion(
  next: UiVersion,
  setVersionState: Dispatch<SetStateAction<UiVersion>>,
) {
  setVersionState(next);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(UI_VERSION_STORAGE_KEY, next);
  }
}

export function useUiVersion() {
  const context = useContext(UiVersionContext);
  if (!context) {
    throw new Error("useUiVersion must be used within UiVersionProvider");
  }
  return context;
}
