import { useEffect, useMemo, useState } from "react";
import {
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
import { DifficultySwitch, useDifficulty } from "../lib/difficulty";
import { className, classColor, QUALITY_COLORS_NUM } from "../lib/format";
import { OBTAINED_STYLE } from "../components/BisSlotList";
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
        <h1>Лут — {seasonLabel}</h1>
        <DifficultySwitch />
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
                  <h2 style={{ fontSize: 15, marginBottom: 6 }}>{enc.name}</h2>
                  <table>
                    <tbody>
                      {items.map((it) => (
                        <ItemLine key={it.id} item={it} locale={config?.locale ?? "ru_RU"} wanters={wanters[it.id] ?? []} />
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

function ItemLine({ item, locale, wanters }: { item: ItemRow; locale: string; wanters: ItemWanter[] }) {
  const name = locale.startsWith("ru") ? item.nameRu ?? item.name : item.name;
  const type =
    item.itemClass === 4
      ? ARMOR_SUBCLASS_NAMES_RU[item.itemSubClass ?? 0]
      : item.itemClass === 2
        ? WEAPON_SUBCLASS_NAMES_RU[item.itemSubClass ?? 0]
        : item.contains
          ? "Тир-токен"
          : "";
  const classes = item.allowableClasses?.map((c) => className(c)).join(", ");
  return (
    <tr>
      <td style={{ width: 28, padding: "3px 6px" }}>
        <img src={iconUrl(item.icon, "small")} width={22} height={22} alt="" style={{ borderRadius: 3, verticalAlign: "middle" }} loading="lazy" />
      </td>
      <td>
        <a href={wowheadUrl(item.id, [], locale.startsWith("ru") ? "ru" : "en")} target="_blank" rel="noreferrer" style={{ color: QUALITY_COLORS_NUM[item.quality ?? 4] }}>
          {name}
        </a>
        {item.nameRu && item.nameRu !== item.name && locale.startsWith("ru") && <span className="muted" style={{ fontSize: 12 }}> · {item.name}</span>}
      </td>
      <td className="muted">{item.slot ? SLOT_NAMES_RU[item.slot] : item.contains ? `Токен (${item.contains.length})` : ""}</td>
      <td className="muted">{type}</td>
      <td className="muted" style={{ fontSize: 12 }}>
        {classes ?? (item.specs ? `${item.specs.length} спек` : "")}
      </td>
      <td style={{ fontSize: 12 }}>
        {wanters.slice(0, 6).map((w) => (
          <span
            key={w.characterId + w.slot}
            title={`#${w.rank} в слоте · ${OBTAINED_STYLE[w.obtained].label}${w.obtainedDetail ? ` · ${w.obtainedDetail}` : ""}${w.upgradePct != null ? ` · ${w.upgradePct > 0 ? "+" : ""}${w.upgradePct.toFixed(1)}%${w.simTrack ? ` (${w.simTrack})` : ""}` : ""}${w.alt?.farmable ? ` · альт: ${w.alt.farmable.name} (M+) ${w.alt.farmable.pct > 0 ? "+" : ""}${w.alt.farmable.pct.toFixed(1)}%` : ""}${w.alt?.gap != null ? ` · незаменимость ▲${w.alt.gap.toFixed(1)}` : ""}`}
            style={{ marginRight: 8, whiteSpace: "nowrap" }}
          >
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: OBTAINED_STYLE[w.obtained].color, marginRight: 3 }} />
            <span style={{ color: classColor(w.classId) }}>{w.name}</span>
            <span className="muted">{w.rank > 1 ? ` #${w.rank}` : ""}</span>
          </span>
        ))}
        {wanters.length > 6 && <span className="muted">+{wanters.length - 6}</span>}
      </td>
    </tr>
  );
}

