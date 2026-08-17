import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { applyTheme, getTheme, type Theme } from "./lib/theme";
import { ConfigProvider, useConfig } from "./lib/config-context";
import { DifficultyProvider } from "./lib/difficulty";
import { SetupPage } from "./pages/SetupPage";
import { RosterPage } from "./pages/RosterPage";
import { LootPage } from "./pages/LootPage";
import { BisPage } from "./pages/BisPage";
import { RaidNightPage } from "./pages/RaidNightPage";
import { TierPage } from "./pages/TierPage";
import { CharacterPage } from "./pages/CharacterPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <ConfigProvider>
      <DifficultyProvider>
        <Shell />
      </DifficultyProvider>
    </ConfigProvider>
  );
}

/** Пере-инициализация тултипов Wowhead после любых изменений DOM (React рендерит ссылки динамически). */
function useWowheadTooltips() {
  useEffect(() => {
    let timer: number | null = null;
    const refresh = () => {
      timer = null;
      const wp = (window as unknown as { $WowheadPower?: { refreshLinks?: () => void } }).$WowheadPower;
      wp?.refreshLinks?.();
    };
    const obs = new MutationObserver((records) => {
      // реагируем только на появление новых ссылок на предметы; DOM самого тултипа игнорируем
      let relevant = false;
      for (const r of records) {
        if ((r.target as Element).closest?.(".wowhead-tooltip")) continue;
        for (const n of r.addedNodes) {
          if (!(n instanceof Element)) continue;
          if (n.matches?.("a[data-wowhead]") || n.querySelector?.("a[data-wowhead]")) { relevant = true; break; }
        }
        if (relevant) break;
      }
      if (!relevant) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 200);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
}

function Shell() {
  useWowheadTooltips();
  const { config, loading, error } = useConfig();
  const [theme, setTheme] = useState<Theme>(() => getTheme());
  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  if (loading && !config) return <div className="main">Загрузка…</div>;
  if (error && !config)
    return (
      <div className="main">
        <div className="alert bad">Сервер недоступен: {error}. Запустите <code>npm run dev:server</code>.</div>
      </div>
    );
  if (config && !config.setupComplete) return <SetupPage />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Easy<span>Roster</span>
        </div>
        <nav className="nav">
          <NavLink to="/roster">Ростер</NavLink>
          <NavLink to="/bis">BiS</NavLink>
          <NavLink to="/loot">Лут</NavLink>
          <NavLink to="/raid-night">Лут-ночь</NavLink>
          <NavLink to="/tier">Тир-сет</NavLink>
          <NavLink to="/settings">Настройки</NavLink>
        </nav>
        <div className="foot">
          {config?.guild.name} — {config?.guild.realmName} ({config?.region.toUpperCase()})
          <div>
            <button className="theme-toggle" onClick={toggleTheme} title="Переключить тему">
              {theme === "dark" ? "☀ Светлая тема" : "☾ Тёмная тема"}
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/roster" replace />} />
          <Route path="/roster" element={<RosterPage />} />
          <Route path="/bis" element={<BisPage />} />
          <Route path="/loot" element={<LootPage />} />
          <Route path="/raid-night" element={<RaidNightPage />} />
          <Route path="/tier" element={<TierPage />} />
          <Route path="/character/:id" element={<CharacterPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/roster" replace />} />
        </Routes>
      </main>
    </div>
  );
}
