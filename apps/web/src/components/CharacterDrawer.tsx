import { useEffect, useState } from "react";
import { EQUIP_SLOT_NAMES_RU, EQUIP_SLOT_ORDER, type CharacterDetail } from "@easyroster/core";
import { api } from "../lib/api";
import { classColor, className, fmtDate, QUALITY_COLORS, ROLE_RU, roleOf, specName } from "../lib/format";
import { useConfig } from "../lib/config-context";

export function CharacterDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { config } = useConfig();
  const [data, setData] = useState<CharacterDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .character(id)
      .then(setData)
      .catch((e) => setErr((e as Error).message));

  useEffect(() => {
    setData(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const resync = async () => {
    setBusy(true);
    try {
      await api.syncCharacters({ ids: [id], force: true });
      // подождём завершения (один персонаж — секунды)
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 700));
        const s = await api.syncStatus();
        if (!s.running) break;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const c = data?.character;
  const eq = new Map(data?.equipment.map((e) => [e.slot, e]) ?? []);
  const role = c ? roleOf(c.activeSpecId) : null;
  const armory =
    c && config ? `https://worldofwarcraft.blizzard.com/${config.locale === "ru_RU" ? "ru-ru" : "en-gb"}/character/${config.region}/${c.realmSlug}/${encodeURIComponent(c.name.toLowerCase())}` : "#";
  const rio = c && config ? `https://raider.io/characters/${config.region}/${c.realmSlug}/${encodeURIComponent(c.name)}` : "#";
  const wcl = c && config ? `https://www.warcraftlogs.com/character/${config.region}/${c.realmSlug}/${encodeURIComponent(c.name)}` : "#";

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", justifyContent: "flex-end", zIndex: 10 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: "100%", height: "100%", overflowY: "auto", background: "var(--bg-elev)", borderLeft: "1px solid var(--border)", padding: 20 }}
      >
        {err && <div className="alert bad">{err}</div>}
        {!c ? (
          <div className="muted">Загрузка…</div>
        ) : (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div className="row" style={{ alignItems: "center" }}>
                {c.avatarUrl && <img src={c.avatarUrl} alt="" width={56} height={56} style={{ borderRadius: 6, border: "1px solid var(--border)" }} />}
                <div>
                  <h2 style={{ marginBottom: 2 }}>
                    <span style={{ color: classColor(c.classId) }}>{c.name}</span>
                    <span className="muted" style={{ fontWeight: 400 }}> — {c.realmName || c.realmSlug}</span>
                  </h2>
                  <div className="muted">
                    {className(c.classId)} · {specName(c.activeSpecId)} {role ? `(${ROLE_RU[role]})` : ""} · ур. {c.level}
                  </div>
                </div>
              </div>
              <button onClick={onClose}>✕</button>
            </div>

            <div className="grid-2" style={{ margin: "14px 0" }}>
              <Stat label="ilvl (надето / средний)" value={c.ilvlEquipped ? `${c.ilvlEquipped.toFixed(1)} / ${c.ilvlAvg?.toFixed(1)}` : "—"} />
              <Stat label="Ранг" value={`${config?.rankLabels[String(c.rank)] || "—"} (${c.rank})`} />
              <Stat label="Последний логаут" value={fmtDate(c.lastLoginMs)} />
              <Stat label="Синк профиля" value={c.profileStatus === "ok" ? fmtDate(c.profileSyncedAt) : `${c.profileStatus}${c.profileMessage ? ": " + c.profileMessage : ""}`} />
            </div>

            <div className="row" style={{ marginBottom: 14 }}>
              <a href={armory} target="_blank" rel="noreferrer">Армори</a>
              <a href={rio} target="_blank" rel="noreferrer">Raider.IO</a>
              <a href={wcl} target="_blank" rel="noreferrer">Warcraft Logs</a>
              <button style={{ marginLeft: "auto" }} disabled={busy} onClick={resync}>
                {busy ? "Обновляю…" : "Обновить из API"}
              </button>
            </div>

            <h3 style={{ fontSize: 14, marginBottom: 6 }}>Экипировка</h3>
            {data!.equipment.length === 0 ? (
              <div className="muted">Нет данных об экипировке.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Слот</th>
                    <th>Предмет</th>
                    <th className="num">ilvl</th>
                    <th>Трек</th>
                    <th>Энч/камни</th>
                  </tr>
                </thead>
                <tbody>
                  {EQUIP_SLOT_ORDER.filter((s) => s !== "SHIRT" && s !== "TABARD").map((slot) => {
                    const it = eq.get(slot);
                    return (
                      <tr key={slot}>
                        <td className="muted">{EQUIP_SLOT_NAMES_RU[slot]}</td>
                        <td>
                          {it ? (
                            <a
                              href={`https://www.wowhead.com/ru/item=${it.itemId}${it.bonusIds.length ? `?bonus=${it.bonusIds.join(":")}` : ""}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: QUALITY_COLORS[it.quality ?? ""] ?? "inherit" }}
                              title={it.setName ? `Комплект: ${it.setName}` : undefined}
                            >
                              {it.itemName ?? `#${it.itemId}`}
                            </a>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="num">{it?.ilvl ?? ""}</td>
                        <td className="muted">{it?.trackName ?? ""}</td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {it && (
                            <>
                              {it.enchantId ? "энч" : ""}
                              {it.gems.length ? ` ${it.gems.length}💎` : ""}
                              {it.emptySockets ? <span style={{ color: "var(--warn)" }}> {it.emptySockets} пуст.</span> : ""}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {c.talentLoadoutCode && (
              <div style={{ marginTop: 14 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Код талантов (активный лоадаут)</div>
                <code style={{ wordBreak: "break-all", fontSize: 11 }}>{c.talentLoadoutCode}</code>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}
