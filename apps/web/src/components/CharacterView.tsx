import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { type BisCharacterView, type BisEntry, type CharacterDetail } from "@easyroster/core";
import { api } from "../lib/api";
import { classColor, className, fmtDate, relTime, ROLE_RU, roleOf, specName } from "../lib/format";
import { useConfig } from "../lib/config-context";
import { useDifficulty } from "../lib/difficulty";
import { SimNowButton } from "./SimNowButton";
import { SlotCompare } from "./SlotCompare";
import { ClassIcon } from "./ClassIcon";
import { SOURCE_LABEL } from "./BisSlotList";
import { DroptimizerBox, ManualRules, RaidSpecBox, SimBox, SimResults } from "./CharacterDrawer";

/**
 * Полная карточка персонажа: липкая шапка (имя, спека, ilvl, сложность, действия) +
 * «Обзор» (надето ↔ BiS по слотам) / «Сим» / «Настройки персонажа».
 * Используется и на странице /character/:id, и в выезжающей панели.
 */
export function CharacterView({ id, onClose, layout = "page" }: { id: number; onClose?: () => void; layout?: "page" | "drawer" }) {
  const { config } = useConfig();
  const { difficulty } = useDifficulty();
  const [data, setData] = useState<CharacterDetail | null>(null);
  const [bis, setBis] = useState<BisCharacterView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "sim" | "settings">("overview");
  const [busy, setBusy] = useState(false);
  const ru = (config?.locale ?? "ru_RU").startsWith("ru");

  const load = useCallback(() => api.character(id).then(setData).catch((e) => setErr((e as Error).message)), [id]);
  const loadBis = useCallback(() => api.bisCharacter(id, undefined, difficulty).then(setBis).catch((e) => setErr((e as Error).message)), [id, difficulty]);

  useEffect(() => {
    setData(null);
    setBis(null);
    void load();
    void loadBis();
  }, [load, loadBis]);

  const manual = async (e: BisEntry, action: "pin" | "exclude") => {
    if (!bis) return;
    await api.bisManualAdd({ characterId: id, specId: bis.specId, slot: e.slot, itemId: e.itemId, action });
    await loadBis();
  };
  const resync = async () => {
    setBusy(true);
    try {
      await api.syncCharacters({ ids: [id], force: true });
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 700));
        if (!(await api.syncStatus()).running) break;
      }
      await load();
      await loadBis();
    } finally {
      setBusy(false);
    }
  };

  const c = data?.character;
  const role = c ? roleOf(c.activeSpecId) : null;
  const region = config?.region ?? "eu";
  const links = c
    ? {
        armory: `https://worldofwarcraft.blizzard.com/${config?.locale === "ru_RU" ? "ru-ru" : "en-gb"}/character/${region}/${c.realmSlug}/${encodeURIComponent(c.name.toLowerCase())}`,
        rio: `https://raider.io/characters/${region}/${c.realmSlug}/${encodeURIComponent(c.name)}`,
        wcl: `https://www.warcraftlogs.com/character/${region}/${c.realmSlug}/${encodeURIComponent(c.name)}`,
      }
    : null;

  if (err && !c) return <div className="alert bad">{err}</div>;
  if (!c) return <div className="muted">Загрузка…</div>;

  return (
    <div className="char-view">
      {/* липкая шапка */}
      <div className="char-head">
        <div className="row" style={{ alignItems: "center", gap: 12, minWidth: 0 }}>
          {c.avatarUrl && <img src={c.avatarUrl} alt="" width={44} height={44} style={{ borderRadius: 6, border: "1px solid var(--border)" }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>
              <ClassIcon classId={c.classId} size={22} /><span style={{ color: classColor(c.classId) }}>{c.name}</span>
              <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}> — {c.realmName || c.realmSlug}</span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {className(c.classId)} · {specName(c.activeSpecId)}{role ? ` (${ROLE_RU[role]})` : ""}
              {c.raidSpecId && c.raidSpecId !== c.detectedSpecId ? ` · в API ${specName(c.detectedSpecId)}` : ""} · ilvl <b className="num">{c.ilvlEquipped?.toFixed(1) ?? "—"}</b>
              {" · "}{config?.rankLabels[String(c.rank)] || `ранг ${c.rank}`} · логаут {relTime(c.lastLoginMs)}
              {bis && <> · BiS <b>{bis.coverage.pct}%</b>{bis.personalSim ? ` · сим ${relTime(bis.personalSim.fetchedAt)}` : " · сима нет"}</>}
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 6, flex: "none" }}>
          <SimNowButton characterId={id} onDone={loadBis} />
          {links && (
            <span className="muted" style={{ fontSize: 12 }}>
              <a href={links.armory} target="_blank" rel="noreferrer">Армори</a> · <a href={links.rio} target="_blank" rel="noreferrer">RIO</a> · <a href={links.wcl} target="_blank" rel="noreferrer">WCL</a>
            </span>
          )}
          <button style={{ padding: "3px 10px", fontSize: 12 }} disabled={busy} onClick={resync} title="Обновить из Blizzard API">{busy ? "…" : "Обновить"}</button>
          {layout === "drawer" && <Link to={`/character/${id}`} className="muted" style={{ fontSize: 12 }} title="Открыть на всю страницу">↗</Link>}
          {onClose && <button style={{ padding: "3px 10px" }} onClick={onClose}>✕</button>}
        </div>
      </div>

      <div className="row" style={{ margin: "10px 0", gap: 6 }}>
        <button className={tab === "overview" ? "primary" : undefined} onClick={() => setTab("overview")}>Обзор</button>
        <button className={tab === "sim" ? "primary" : undefined} onClick={() => setTab("sim")}>Сим</button>
        <button className={tab === "settings" ? "primary" : undefined} onClick={() => setTab("settings")}>Спека / таланты / правила</button>
        {tab === "overview" && bis && (
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }} title={bis.sourcesUsed.map((s) => `${SOURCE_LABEL[s.source]} (${s.count})`).join(", ")}>
            {bis.coverage.obtained} из {bis.coverage.slots} на макс. треке · {bis.coverage.lower} ниже трека/катализатор · источники: {bis.sourcesUsed.map((s) => SOURCE_LABEL[s.source]).join(" + ") || "нет"}
          </span>
        )}
      </div>

      {tab === "overview" && (
        <>
          {!bis && !err && <div className="muted">Считаю BiS…</div>}
          <SlotCompare detail={data!} bis={bis} ru={ru} onPin={(e) => manual(e, "pin")} onExclude={(e) => manual(e, "exclude")} />
        </>
      )}
      {tab === "sim" && <SimResults characterId={id} locale={config?.locale ?? "ru_RU"} onChanged={loadBis} />}
      {tab === "settings" && (
        <>
          <RaidSpecBox character={c} onSaved={() => { void load(); void loadBis(); }} />
          <div className="row" style={{ marginBottom: 8 }}>
            <SimBox characterId={id} onDone={loadBis} />
          </div>
          <DroptimizerBox characterId={id} onImported={loadBis} />
          {bis && <ManualRules specId={bis.specId} characterId={id} onChange={loadBis} />}
          {c.talentLoadoutCode && (
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 12 }}>Таланты в API (активный лоадаут) · синк {fmtDate(c.profileSyncedAt)}</div>
              <code style={{ wordBreak: "break-all", fontSize: 11 }}>{c.talentLoadoutCode}</code>
            </div>
          )}
        </>
      )}
    </div>
  );
}
