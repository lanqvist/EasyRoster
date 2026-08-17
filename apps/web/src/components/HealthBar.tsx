import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useConfig } from "../lib/config-context";
import { relTime } from "../lib/format";

interface Item {
  key: string;
  level: "ok" | "warn" | "bad";
  text: string;
  to: string;
  title?: string;
}

/**
 * Индикатор здоровья в сайдбаре: db.lua для аддона, симы, ключи WCL, устаревшие профили.
 * Показывает только проблемы; если всё хорошо — одна зелёная строка.
 */
export function HealthBar() {
  const { config } = useConfig();
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [wow, sim, sync, chars] = await Promise.all([api.wowStatus().catch(() => null), api.simStatus().catch(() => null), api.syncStatus().catch(() => null), api.characters(false).catch(() => [])]);
        if (!alive) return;
        const out: Item[] = [];
        if (wow) {
          if (!wow.wowPathValid) out.push({ key: "wow", level: "bad", text: "папка WoW не найдена", to: "/settings" });
          else if (!wow.addonInstalled) out.push({ key: "addon", level: "warn", text: "аддон не установлен", to: "/settings" });
          else if (wow.addonVersion !== wow.addonSourceVersion) out.push({ key: "addonv", level: "warn", text: `аддон ${wow.addonVersion} → ${wow.addonSourceVersion}`, to: "/settings", title: "доступна новая версия аддона — «Обновить аддон» и /reload" });
          if (wow.wowPathValid) {
            const age = wow.dataTimestamp ? Date.now() - wow.dataTimestamp : null;
            if (age == null) out.push({ key: "db", level: "warn", text: "db.lua не сгенерирован", to: "/settings" });
            else if (age > 2 * 86400000) out.push({ key: "db", level: "warn", text: `db.lua ${relTime(wow.dataTimestamp!)}`, to: "/loot", title: "данные для аддона устарели — «Синк в игру» и /reload" });
          }
        }
        if (sim?.simcPath) {
          const sup = sim.characters.filter((c) => c.supported);
          const stale = sup.filter((c) => c.stale || c.equipmentChanged || c.lastOk == null).length;
          if (stale > 0) out.push({ key: "sim", level: "warn", text: `симов устарело: ${stale}/${sup.length}`, to: "/bis", title: "BiS → Данные и симы → «Симить устаревших»" });
        } else if (sim && !sim.simcPath) out.push({ key: "simc", level: "warn", text: "SimC не установлен", to: "/bis", title: "без сима — только гайдовые листы без %" });
        if (config && !config.warcraftLogs.hasSecret) out.push({ key: "wcl", level: "warn", text: "WCL: нет ключей", to: "/settings", title: "популярность предметов у топ-парсов не учитывается" });
        const staleProfiles = chars.filter((c) => c.inRaidRoster && (c.profileStatus !== "ok" || (c.lastLoginMs != null && Date.now() - c.lastLoginMs > 14 * 86400000))).length;
        if (staleProfiles > 0) out.push({ key: "prof", level: "warn", text: `профилей устарело: ${staleProfiles}`, to: "/roster", title: "нет данных / не заходили > 14 дней — Blizzard API отдаёт профиль только после логаута" });
        if (sync?.lastGuildSync && !sync.lastGuildSync.ok) out.push({ key: "sync", level: "bad", text: "ошибка синка", to: "/roster", title: sync.lastGuildSync.message ?? "" });
        setItems(out);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = setInterval(tick, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [config]);

  if (!items) return null;
  const color = (l: Item["level"]) => (l === "bad" ? "var(--bad)" : l === "warn" ? "var(--warn)" : "var(--ok)");
  return (
    <div className="health">
      {items.length === 0 ? (
        <div className="health-item" style={{ color: "var(--ok)" }}>● всё в порядке</div>
      ) : (
        items.map((i) => (
          <Link key={i.key} to={i.to} className="health-item" title={i.title ?? i.text} style={{ color: color(i.level) }}>
            ● {i.text}
          </Link>
        ))
      )}
    </div>
  );
}
