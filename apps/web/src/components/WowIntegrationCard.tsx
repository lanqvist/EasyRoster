import { useCallback, useEffect, useState } from "react";
import type { AddonStatus } from "@easyroster/core";
import { api } from "../lib/api";
import { fmtDate, relTime } from "../lib/format";

/** Блок «Интеграция с WoW»: аддон, экспорт db.lua, импорт SavedVariables. */
export function WowIntegrationCard({ compact = false }: { compact?: boolean }) {
  const [st, setSt] = useState<AddonStatus | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSt(await api.wowStatus());
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setMsg(null);
    try {
      const text = await fn();
      setMsg({ ok: true, text });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (!st) return <div className="card muted">Проверяю установку WoW…</div>;

  const dataAge = st.dataTimestamp ? relTime(st.dataTimestamp) : "—";
  return (
    <div className="card">
      {!compact && <h2>Интеграция с WoW</h2>}
      {msg && <div className={`alert ${msg.ok ? "ok" : "bad"}`}>{msg.text}</div>}
      <div className="grid-2" style={{ fontSize: 13 }}>
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Папка WoW</div>
          <div style={{ color: st.wowPathValid ? "var(--ok)" : "var(--bad)" }}>{st.wowPathValid ? "найдена" : "не найдена — задайте путь к _retail_"}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>RCLootCouncil</div>
          <div style={{ color: st.rclcInstalled ? "var(--ok)" : "var(--warn)" }}>{st.rclcInstalled ? "установлен" : "не найден в Interface\\AddOns"}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Аддон EasyRoster</div>
          <div>
            {st.addonInstalled ? (
              <span style={{ color: st.addonVersion === st.addonSourceVersion ? "var(--ok)" : "var(--warn)" }}>
                v{st.addonVersion} {st.addonVersion !== st.addonSourceVersion ? `(доступна ${st.addonSourceVersion})` : ""}
              </span>
            ) : (
              <span style={{ color: "var(--warn)" }}>не установлен</span>
            )}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Данные db.lua</div>
          <div title={st.dataTimestamp ? fmtDate(st.dataTimestamp) : ""}>
            {st.dataTimestamp ? `${dataAge}, персонажей ${st.dataCharacters}` : "не сгенерированы"}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>История лута RCLC</div>
          <div>
            {st.lootHistoryCount} записей · файлов SavedVariables: {st.rclcSavedVariables.length}
            {st.lastHistoryImportAt ? ` · импорт ${relTime(st.lastHistoryImportAt)}` : ""}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Экспорт гильдии из игры</div>
          <div>{st.easyRosterSavedVariables.length ? `найден (${relTime(Math.max(...st.easyRosterSavedVariables.map((f) => f.mtime)))})` : "нет — нужен /reload в игре с аддоном"}</div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button disabled={!!busy || !st.wowPathValid} onClick={() => run("install", async () => { const r = await api.wowInstallAddon(); return `Аддон установлен: ${r.dir} (${r.files} файлов). В игре: /reload`; })}>
          {st.addonInstalled ? "Обновить аддон" : "Установить аддон"}
        </button>
        <button className="primary" disabled={!!busy || !st.wowPathValid} onClick={() => run("export", async () => { const r = await api.wowExport(); return `db.lua записан: ${r.characters} персонажей, ${(r.bytes / 1024).toFixed(0)} КБ. В игре: /reload`; })}>
          {busy === "export" ? "Генерирую…" : "Синк в игру (db.lua)"}
        </button>
        <button disabled={!!busy || !st.wowPathValid} onClick={() => run("hist", async () => { const r = await api.wowImportHistory(); return `История RCLC: файлов ${r.files}, записей ${r.entries}, новых ${r.added}`; })}>
          Импорт истории лута
        </button>
        <button disabled={!!busy || !st.wowPathValid} onClick={() => run("guild", async () => { const r = await api.wowImportGuild(); return `Гильдия: рангов ${r.ranks}, участников ${r.members}, сопоставлено ${r.matched}`; })}>
          Импорт рангов/заметок
        </button>
        <a href="/api/wow/export/preview" target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12 }}>предпросмотр db.lua</a>
      </div>
    </div>
  );
}
