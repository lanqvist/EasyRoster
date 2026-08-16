import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { ConfigProvider, useConfig } from "./lib/config-context";
import { SetupPage } from "./pages/SetupPage";
import { RosterPage } from "./pages/RosterPage";
import { LootPage } from "./pages/LootPage";
import { BisPage } from "./pages/BisPage";
import { RaidNightPage } from "./pages/RaidNightPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <ConfigProvider>
      <Shell />
    </ConfigProvider>
  );
}

function Shell() {
  const { config, loading, error } = useConfig();

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
          <NavLink to="/settings">Настройки</NavLink>
        </nav>
        <div className="foot">
          {config?.guild.name} — {config?.guild.realmName} ({config?.region.toUpperCase()})
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/roster" replace />} />
          <Route path="/roster" element={<RosterPage />} />
          <Route path="/bis" element={<BisPage />} />
          <Route path="/loot" element={<LootPage />} />
          <Route path="/raid-night" element={<RaidNightPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/roster" replace />} />
        </Routes>
      </main>
    </div>
  );
}
