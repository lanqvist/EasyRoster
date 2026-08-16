import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { ConfigPatch, PublicConfig } from "@easyroster/core";
import { api } from "./api";

interface ConfigCtx {
  config: PublicConfig | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  save: (patch: ConfigPatch) => Promise<PublicConfig>;
}

const Ctx = createContext<ConfigCtx | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setConfig(await api.getConfig());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (patch: ConfigPatch) => {
    const next = await api.updateConfig(patch);
    setConfig(next);
    return next;
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <Ctx.Provider value={{ config, loading, error, reload, save }}>{children}</Ctx.Provider>;
}

export function useConfig(): ConfigCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConfig вне ConfigProvider");
  return v;
}
