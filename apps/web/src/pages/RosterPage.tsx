import { useCallback, useEffect, useMemo, useState } from "react";
import type { CharacterRow } from "@easyroster/core";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useConfig } from "../lib/config-context";
import { classColor, className, relTime, ROLE_RU, roleOf, specName } from "../lib/format";
import { SyncBar } from "../components/SyncBar";
import { ClassIcon } from "../components/ClassIcon";
import { CharacterDrawer } from "../components/CharacterDrawer";

type SortKey = "name" | "rank" | "ilvl" | "class" | "login" | "role";

const STATUS_RU: Record<CharacterRow["profileStatus"], { text: string; color: string }> = {
  pending: { text: "не синхронизирован", color: "var(--text-muted)" },
  ok: { text: "ок", color: "var(--ok)" },
  nodata: { text: "нет данных", color: "var(--warn)" },
  invalid: { text: "невалиден", color: "var(--bad)" },
  error: { text: "ошибка", color: "var(--bad)" },
};

export function RosterPage() {
  const { config } = useConfig();
  const [rows, setRows] = useState<CharacterRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rank", dir: 1 });
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [importingRanks, setImportingRanks] = useState(false);
  const [rankMsg, setRankMsg] = useState<string | null>(null);
  const { reload: reloadConfig } = useConfig();
  const importRanks = async () => {
    setImportingRanks(true);
    setRankMsg(null);
    try {
      const r = await api.wowImportGuild();
      setRankMsg(r.ranks ? `рангов ${r.ranks}, сопоставлено ${r.matched}` : "экспорт из игры не найден — нужен /reload с аддоном");
      await reloadConfig();
      await load();
    } catch (e) {
      setRankMsg((e as Error).message);
    } finally {
      setImportingRanks(false);
    }
  };

  const load = useCallback(async () => {
    try {
      setRows(await api.characters(showAll));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [showAll]);

  useEffect(() => {
    void load();
  }, [load]);

  const rankLabel = (rank: number) => config?.rankLabels[String(rank)] || `Ранг ${rank}`;

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = rows.filter((r) => !f || r.name.toLowerCase().includes(f) || className(r.classId).toLowerCase().includes(f));
    const cmp: Record<SortKey, (a: CharacterRow, b: CharacterRow) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, "ru"),
      rank: (a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "ru"),
      ilvl: (a, b) => (b.ilvlEquipped ?? 0) - (a.ilvlEquipped ?? 0),
      class: (a, b) => a.classId - b.classId || a.name.localeCompare(b.name, "ru"),
      login: (a, b) => (b.lastLoginMs ?? 0) - (a.lastLoginMs ?? 0),
      role: (a, b) => (roleOf(a.activeSpecId) ?? "Z").localeCompare(roleOf(b.activeSpecId) ?? "Z"),
    };
    return list.sort((a, b) => cmp[sort.key](a, b) * sort.dir);
  }, [rows, filter, sort]);

  const th = (key: SortKey, label: string, cls?: string) => (
    <th
      className={cls}
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }))}
    >
      {label} {sort.key === key ? (sort.dir === 1 ? "▲" : "▼") : ""}
    </th>
  );

  const stats = useMemo(() => {
    const raiders = rows.filter((r) => r.inRaidRoster);
    const withIlvl = raiders.filter((r) => r.ilvlEquipped);
    const avg = withIlvl.length ? withIlvl.reduce((s, r) => s + (r.ilvlEquipped ?? 0), 0) / withIlvl.length : 0;
    const roles = { TANK: 0, HEALER: 0, DAMAGER: 0 };
    for (const r of raiders) {
      const role = roleOf(r.activeSpecId);
      if (role) roles[role]++;
    }
    return { raiders: raiders.length, avg, roles };
  }, [rows]);

  return (
    <div>
      <h1>Ростер</h1>
      <SyncBar onFinished={load} />
      {err && <div className="alert bad">{err}</div>}

      <div className="row" style={{ marginBottom: 12, justifyContent: "space-between" }}>
        <div className="row">
          <input placeholder="Поиск по имени/классу" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 240 }} />
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> вся гильдия
          </label>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          Рейдеров: <b className="num">{stats.raiders}</b> · средний ilvl <b className="num">{stats.avg ? stats.avg.toFixed(1) : "—"}</b> ·{" "}
          {ROLE_RU.TANK} {stats.roles.TANK} / {ROLE_RU.HEALER} {stats.roles.HEALER} / {ROLE_RU.DAMAGER} {stats.roles.DAMAGER}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="placeholder">
          Персонажей пока нет. Нажмите «Обновить всё» — ростер гильдии подтянется по Blizzard API, рейдеры определятся по рангам{" "}
          {config?.raiderRanks.join(", ") || "(не заданы)"}.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                {th("name", "Имя")}
                {th("class", "Класс / спека")}
                {th("role", "Роль")}
                {th("rank", "Ранг")}
                {rows.some((r) => r.inRaidRoster && !config?.rankLabels[String(r.rank)]) && (
                  <th style={{ fontWeight: 400 }}>
                    <button style={{ padding: "1px 8px", fontSize: 11 }} disabled={importingRanks} title="Названия рангов и заметки Blizzard API не отдаёт — они экспортируются аддоном в SavedVariables при /reload в игре и импортируются сюда" onClick={importRanks}>
                      {importingRanks ? "…" : "названия рангов — из игры"}
                    </button>
                    {rankMsg && <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>{rankMsg}</span>}
                  </th>
                )}
                {th("ilvl", "ilvl", "num")}
                {th("login", "Был в игре")}
                <th>Профиль</th>
                <th title="Участие в рейдовом ростере (BiS, сим, экспорт в аддон)">В рейде</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const role = roleOf(r.activeSpecId);
                const st = STATUS_RU[r.profileStatus];
                return (
                  <tr key={r.id} className={selected === r.id ? "selected" : undefined} style={{ cursor: "pointer", opacity: r.inRaidRoster ? 1 : 0.55 }} onClick={() => setSelected(r.id)}>
                    <td>
                      <ClassIcon classId={r.classId} /><span style={{ color: classColor(r.classId), fontWeight: 600 }}>{r.name}</span>
                      <span className="muted"> — {r.realmName || r.realmSlug}</span>
                      <Link to={`/character/${r.id}`} className="muted" style={{ marginLeft: 6, fontSize: 11 }} title="Открыть страницу персонажа" onClick={(e) => e.stopPropagation()}>↗</Link>
                    </td>
                    <td>
                      {className(r.classId)}
                      {r.activeSpecId ? <span className="muted"> · {specName(r.activeSpecId)}</span> : null}
                      {r.raidSpecId && r.raidSpecId !== r.detectedSpecId ? <span className="muted" style={{ fontSize: 11 }} title="Рейдовая спека задана вручную"> (API: {specName(r.detectedSpecId)})</span> : null}
                    </td>
                    <td>{role ? ROLE_RU[role] : "—"}</td>
                    <td>
                      {rankLabel(r.rank)} <span className="muted num">({r.rank})</span>
                    </td>
                    <td className="num">{r.ilvlEquipped ? r.ilvlEquipped.toFixed(1) : "—"}</td>
                    <td className="muted">{relTime(r.lastLoginMs)}</td>
                    <td style={{ color: st.color }} title={r.profileMessage ?? undefined}>
                      {st.text}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        style={{ padding: "1px 8px", fontSize: 11, color: r.inRaidRoster ? "var(--ok)" : "var(--text-muted)" }}
                        title={r.rosterOverride === "exclude" ? "Исключён вручную — вернуть" : r.rosterOverride === "include" ? "Добавлен вручную — убрать" : r.inRaidRoster ? "Убрать из рейдового ростера" : "Добавить в рейдовый ростер вручную"}
                        onClick={async () => {
                          const next: "exclude" | "include" | null = r.inRaidRoster ? (r.isRaider ? "exclude" : null) : r.isRaider ? null : "include";
                          const q = r.inRaidRoster
                            ? `Убрать ${r.name} из рейдового ростера?

Персонаж пропадёт из BiS-сводки, автосима, «Распределения» и из db.lua для аддона (после следующего синка в игру).`
                            : `Добавить ${r.name} в рейдовый ростер вручную?

По нему начнут считаться BiS и сим, он попадёт в db.lua для аддона.`;
                          if (!window.confirm(q)) return;
                          await api.characterSettings(r.id, { rosterOverride: next });
                          await load();
                        }}
                      >
                        {r.inRaidRoster ? "да" : "нет"}{r.rosterOverride ? " ✎" : ""}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected !== null && <CharacterDrawer id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
