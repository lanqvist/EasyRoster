import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { LootNight } from "./RaidNightPage";
import { LootBrowse } from "./LootPage";

/**
 * Страница «Лут» — один расчёт «кому нужен предмет», два режима:
 * «Лут-ночь» (босс → предмет → претенденты по выгоде) и «По инстансу» (все лут-таблицы сезона с фильтрами).
 */
export function LootHubPage() {
  return (
    <div className="loot-page">
      <div className="row" style={{ alignItems: "baseline", gap: 14, marginBottom: 6 }}>
        <h1 style={{ marginBottom: 0 }}>Лут</h1>
        <nav className="tabs">
          <NavLink to="/loot" end>Лут-ночь</NavLink>
          <NavLink to="/loot/browse">По инстансу</NavLink>
        </nav>
      </div>
      <Routes>
        <Route index element={<LootNight />} />
        <Route path="browse" element={<LootBrowse />} />
        <Route path="*" element={<Navigate to="/loot" replace />} />
      </Routes>
    </div>
  );
}
