import { useEffect, useMemo, useState } from "react";
import {
  TRACK_NAMES_RU,
  ARMOR_SUBCLASS_NAMES_RU,
  SLOT_NAMES_RU,
  SPECS,
  WEAPON_SUBCLASS_NAMES_RU,
  iconUrl,
  itemUsableBySpec,
  wowheadUrl,
  type InstanceRow,
  type ItemRow,
  type LootInstanceView,
  type StaticDataStatus,
  type ItemWanter,
} from "@easyroster/core";
import { api } from "../lib/api";
import { useDifficulty } from "../lib/difficulty";
import { className, classColor, QUALITY_COLORS_NUM } from "../lib/format";
import { OBTAINED_STYLE } from "../components/BisSlotList";
import { ItemIcon, ItemLink } from "../components/ItemLink";
import { CharacterDrawer } from "../components/CharacterDrawer";
import { useConfig } from "../lib/config-context";

export function LootPage() {
  const { difficulty } = useDifficulty();
  const { config } = useConfig();
  const [status, setStatus] = useState<StaticDataStatus | null>(null);
  const [instances, setInstances] = useState<{ season: StaticDataStatus["season"]; all: InstanceRow[] } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<LootInstanceView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterSpec, setFilterSpec] = useState<number | "">("");
  const [filterSlot, setFilterSlot] = useState<string>("");
  const [search, setSearch] = useState("");
  const [wanters, setWanters] = useState<Record<number, ItemWanter[]>>({});
  const [selChar, setSelChar] = useState<number | null>(null);

  const load = async () => {
    try {
      const [s, i] = await Promise.all([api.staticStatus(), api.lootInstances()]);
      setStatus(s);
      setInstances(i);
      if (selected === null && i.season.raids.length) setSelected(i.season.raids.find((r) => r.encounters.length > 1)?.id ?? i.season.raids[0]!.id);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected === null) return;
    api
      .lootInstance(selected)
      .then(async (v) => {
        setView(v);
        const ids = v.encounters.flatMap((e) => e.items.map((i) => i.id));
        try {
          setWanters(await api.bisWanters(ids, difficulty));
        } catch {
          setWanters({});
        }
      })
      .catch((e) => setErr((e as Error).message));
  }, [selected, difficulty]);

  const refresh = async (force: boolean) => {
    setBusy(true);
    try {
      await api.staticRefresh(force);
      await load();
      if (selected !== null) setView(await api.lootInstance(selected));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const specsByClass = useMemo(() => {
    const m = new Map<number, typeof SPECS>();
    for (const s of SPECS) m.set(s.classId, [...(m.get(s.classId) ?? []), s]);
    return m;
  }, []);

  const filterItem = (it: ItemRow): boolean => {
    if (filterSlot && it.slot !== filterSlot && !(filterSlot === "TOKEN" && it.contains)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!it.name.toLowerCase().includes(q) && !(it.nameRu ?? "").toLowerCase().includes(q)) return false;
    }
    if (filterSpec !== "") {
      if (it.contains) return true; // токены — показываем всегда
      if (it.itemClass == null || it.inventoryType == null) return true;
      return itemUsableBySpec(
        { id: it.id, itemClass: it.itemClass, itemSubClass: it.itemSubClass ?? 0, inventoryType: it.inventoryType, stats: it.stats, specs: it.specs ?? undefined, allowableClasses: it.allowableClasses ?? undefined },
        filterSpec,
      );
    }
    return true;
  };

  const seasonLabel = status?.season.label || "Сезон";
  const staleDays = status?.updatedAt ? Math.floor((Date.now() - status.updatedAt) / 86400000) : null;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Лут-таблицы — {seasonLabel}</h1>
      </div>
      <div className="card" style={{ padding: "10px 16px" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="muted" style={{ fontSize: 13 }}>
            {status ? (
              <>
                Справочник Raidbots <code>{status.build ?? "—"}</code> · предметов {status.items} · бонусов {status.bonuses}
                {staleDays !== null && ` · обновлён ${staleDays} дн назад`}
                {status.lastError && <span style={{ color: "var(--bad)" }}> · ошибка: {status.lastError}</span>}
              </>
            ) : (
              "…"
            )}
          </div>
          <div className="row">
            <button disabled={busy || status?.refreshing} onClick={() => refresh(false)}>
              {busy || status?.refreshing ? "Обновляю…" : "Проверить обновления"}
            </button>
            <button disabled={busy || status?.refreshing} onClick={() => refresh(true)}>Перекачать</button>
          </div>
        </div>
      </div>
      {err && <div className="alert bad">{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 18 }}>
        <aside>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", margin: "6px 0" }}>Рейды</div>
          <nav className="nav">
            {instances?.season.raids.map((r) => (
              <a key={r.id} href="#" className={selected === r.id ? "active" : ""} onClick={(e) => { e.preventDefault(); setSelected(r.id); }}>
                {r.name}
              </a>
            ))}
          </nav>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", margin: "12px 0 6px" }}>Подземелья M+</div>
          <nav className="nav">
            {instances?.season.dungeons.map((r) => (
              <a key={r.id} href="#" className={selected === r.id ? "active" : ""} onClick={(e) => { e.preventDefault(); setSelected(r.id); }}>
                {r.name}
              </a>
            ))}
          </nav>
        </aside>

        <section>
          <div className="row" style={{ marginBottom: 10 }}>
            <select value={filterSpec} onChange={(e) => setFilterSpec(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">Все классы/спеки</option>
              {[...specsByClass.entries()].map(([classId, specs]) => (
                <optgroup key={classId} label={className(classId)}>
                  {specs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {className(classId)} — {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select value={filterSlot} onChange={(e) => setFilterSlot(e.target.value)}>
              <option value="">Все слоты</option>
              {Object.entries(SLOT_NAMES_RU).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
              <option value="TOKEN">Тир-токены</option>
            </select>
            <input placeholder="Поиск предмета" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
          </div>

          {!view ? (
            <div className="placeholder">{instances?.season.raids.length ? "Выберите инстанс" : "Справочники ещё загружаются…"}</div>
          ) : (
            view.encounters.map((enc) => {
              const items = enc.items.filter(filterItem);
              if (items.length === 0) return null;
              return (
                <div key={enc.id} className="card" style={{ padding: "10px 14px" }}>
                  <h2 style={{ fontSize: 15, marginBottom: 8 }}>{enc.name}</h2>
                  <div className="cand-list">
                    {items.map((it) => (
                      <ItemLine key={it.id} item={it} locale={config?.locale ?? "ru_RU"} wanters={wanters[it.id] ?? []} onCharacter={setSelChar} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
      {selChar !== null && <CharacterDrawer id={selChar} onClose={() => setSelChar(null)} initialTab="bis" />}
    </div>
  );
}

function ItemLine({ item, locale, wanters, onCharacter }: { item: ItemRow; locale: string; wanters: ItemWanter[]; onCharacter?: (id: number) => void }) {
  const ru = locale.startsWith("ru");
  const [open, setOpen] = useState(false);
  const name = ru ? item.nameRu ?? item.name : item.name;
  const type =
    item.itemClass === 4
      ? ARMOR_SUBCLASS_NAMES_RU[item.itemSubClass ?? 0]
      : item.itemClass === 2
        ? WEAPON_SUBCLASS_NAMES_RU[item.itemSubClass ?? 0]
        : item.contains
          ? "Тир-токен"
          : "";
  const classes = item.allowableClasses?.map((c) => className(c)).join(", ");
  const need = wanters.filter((w) => w.obtained !== "yes");
  return (
    <div className={`item-card${open ? " active" : ""}`} style={{ cursor: wanters.length > 0 ? "pointer" : "default", alignItems: "flex-start" }} onClick={() => wanters.length > 0 && setOpen((v) => !v)} title={wanters.length > 0 ? "Клик — показать всех претендентов" : undefined}>
      <ItemIcon itemId={item.id} icon={item.icon} size={36} />
      <div className="item-card-main">
        <ItemLink itemId={item.id} name={name} quality={item.quality} ru={ru} style={{ fontSize: 14, fontWeight: 600 }} />
        {item.nameRu && item.nameRu !== item.name && ru && <span className="muted" style={{ fontSize: 12 }}> · {item.name}</span>}
        <div className="muted item-card-meta">
          {item.slot ? SLOT_NAMES_RU[item.slot] : item.contains ? `Токен (${item.contains.length})` : ""}
          {type ? ` · ${type}` : ""}
          {classes ? ` · ${classes}` : item.specs ? ` · ${item.specs.length} спек` : ""}
        </div>
        {wanters.length > 0 && (
          <div style={{ fontSize: 12, marginTop: 3, whiteSpace: "normal" }}>
            {(open ? wanters : wanters.slice(0, 8)).map((w) => (
              <span
                key={w.characterId + w.slot}
                onClick={(e) => { e.stopPropagation(); onCharacter?.(w.characterId); }}
                title={`#${w.rank} в слоте · ${OBTAINED_STYLE[w.obtained].label}${w.obtainedDetail ? ` · ${w.obtainedDetail}` : ""}${w.upgradePct != null ? ` · ${w.upgradePct > 0 ? "+" : ""}${w.upgradePct.toFixed(1)}%${w.simTrack ? ` (${TRACK_NAMES_RU[w.simTrack] ?? w.simTrack})` : ""}` : ""}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8, whiteSpace: "nowrap", cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }}
              >
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: OBTAINED_STYLE[w.obtained].color }} />
                <span style={{ color: classColor(w.classId) }}>{w.name}</span>
                {w.upgradePct != null && <span className="num" style={{ color: w.upgradePct > 0.05 ? "var(--ok)" : "var(--text-muted)" }}>{w.upgradePct > 0 ? "+" : ""}{w.upgradePct.toFixed(1)}%</span>}
                {w.rank > 1 && <span className="muted">#{w.rank}</span>}
              </span>
            ))}
            {!open && wanters.length > 8 && <span className="muted">+{wanters.length - 8} (клик по карточке — все)</span>}
          </div>
        )}
      </div>
      <div className="item-card-side">
        <div className="num" style={{ fontSize: 15, fontWeight: 700 }}>
          <span style={{ color: need.length ? "var(--bad)" : "var(--text-muted)" }}>{need.length}</span>
          <span className="muted" style={{ fontWeight: 400 }}> / {wanters.length}</span>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>нужно</div>
      </div>
    </div>
  );
}
