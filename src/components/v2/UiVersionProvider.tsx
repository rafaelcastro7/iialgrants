import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  persistUiVersion,
  readInitialUiVersion,
  UiVersionContext,
  type UiVersion,
} from "@/components/v2/ui-version";

export function UiVersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersionState] = useState<UiVersion>(readInitialUiVersion);

  const setVersion = useCallback((next: UiVersion) => {
    persistUiVersion(next, setVersionState);
  }, []);

  const value = useMemo(() => ({ version, setVersion }), [setVersion, version]);

  return <UiVersionContext.Provider value={value}>{children}</UiVersionContext.Provider>;
}
