import * as cheerio from "cheerio";
import { SPECS, type BisList, type ParsedCandidate } from "@easyroster/core";

/**
 * Парсер BiS-страниц Icy Veins.
 * URL: https://www.icy-veins.com/wow/{spec}-{class}-pve-{dps|healing|tank}-gear-best-in-slot
 * Разметка (проверено на живой странице 17.08.2026):
 *   #bis_0_0 (Overall) / #bis_0_1 (Mythic+) / #bis_0_2 (Raid)
 *     .bis_items_grid .bis_item
 *        span.spell_icon_span[data-wowhead="item=ID&bonus=..&original-item=ID"]  (первый span — сам предмет)
 *        .bis_item_slot (Helm|Neck|Shoulders|Cloak|Chest|Bracers|Hands|Waist|Legs|Feet|Ring|Trinket|Main Hand|Off Hand|…)
 *        .bis_item_footer .bis_item_drop (текст источника)
 *   FAQ "Which Tier Set Pieces" — список <li>Slot – item</li>
 *   #trinkets … table (S Tier / A Tier / …) с <li> предметами
 */

const CLASS_SLUG: Record<number, string> = {
  1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest", 6: "death-knight", 7: "shaman", 8: "mage",
  9: "warlock", 10: "monk", 11: "druid", 12: "demon-hunter", 13: "evoker",
};

export function icyVeinsUrl(specId: number): string | null {
  const spec = SPECS.find((s) => s.id === specId);
  if (!spec) return null;
  const role = spec.role === "TANK" ? "tank" : spec.role === "HEALER" ? "healing" : "dps";
  const specSlug = spec.name.toLowerCase().replace(/\s+/g, "-");
  return `https://www.icy-veins.com/wow/${specSlug}-${CLASS_SLUG[spec.classId]}-pve-${role}-gear-best-in-slot`;
}

const SLOT_MAP: Record<string, string> = {
  helm: "HEAD", head: "HEAD",
  neck: "NECK",
  shoulders: "SHOULDER", shoulder: "SHOULDER",
  cloak: "BACK", back: "BACK",
  chest: "CHEST",
  bracers: "WRIST", wrist: "WRIST", wrists: "WRIST",
  hands: "HANDS", gloves: "HANDS",
  waist: "WAIST", belt: "WAIST",
  legs: "LEGS",
  feet: "FEET", boots: "FEET",
  ring: "FINGER", "ring 1": "FINGER", "ring 2": "FINGER", finger: "FINGER",
  trinket: "TRINKET", "trinket 1": "TRINKET", "trinket 2": "TRINKET",
  "main hand": "MAIN_HAND", "main-hand": "MAIN_HAND", weapon: "MAIN_HAND", "two-hand": "MAIN_HAND", "two hand": "MAIN_HAND",
  "one-hand": "MAIN_HAND", staff: "MAIN_HAND", ranged: "MAIN_HAND",
  "off hand": "OFF_HAND", "off-hand": "OFF_HAND", offhand: "OFF_HAND", shield: "OFF_HAND",
  shirt: "SHIRT", tabard: "TABARD",
};

export function normalizeSlot(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  return SLOT_MAP[t] ?? null;
}

export function parseWowheadAttr(attr: string | undefined): { itemId: number; bonusIds: number[]; originalItemId: number | null } | null {
  if (!attr) return null;
  const decoded = attr.replace(/&amp;/g, "&");
  const m = /(?:^|&)item=(\d+)/.exec(decoded);
  if (!m) return null;
  const bonus = /(?:^|&)bonus=([\d:]+)/.exec(decoded);
  const orig = /(?:^|&)original-item=(\d+)/.exec(decoded);
  return {
    itemId: Number(m[1]),
    bonusIds: bonus ? bonus[1]!.split(":").map(Number).filter((n) => !Number.isNaN(n)) : [],
    originalItemId: orig ? Number(orig[1]) : null,
  };
}

const LIST_BY_INDEX: Record<string, BisList> = { "0": "overall", "1": "mplus", "2": "raid" };

export interface IcyVeinsParseResult {
  candidates: ParsedCandidate[];
  title: string | null;
  lists: Record<string, number>;
}

export function parseIcyVeinsPage(html: string): IcyVeinsParseResult {
  const $ = cheerio.load(html);
  const candidates: ParsedCandidate[] = [];
  const lists: Record<string, number> = {};
  const title = $("h1").first().text().trim() || null;

  // --- BiS-таблицы
  $("div.image_block_content[id^='bis_']").each((_, block) => {
    const id = $(block).attr("id") ?? "";
    const idx = /bis_\d+_(\d+)/.exec(id)?.[1] ?? "0";
    const list = LIST_BY_INDEX[idx] ?? "overall";
    const slotCounter = new Map<string, number>();
    $(block)
      .find(".bis_item")
      .each((_, el) => {
        const $el = $(el);
        const itemSpan = $el.children("span.spell_icon_span").first();
        const attr = itemSpan.attr("data-wowhead") ?? itemSpan.find("[data-wowhead]").first().attr("data-wowhead");
        const parsed = parseWowheadAttr(attr);
        if (!parsed) return;
        const slotText = $el.find(".bis_item_slot").first().text();
        const slot = normalizeSlot(slotText);
        if (!slot || slot === "SHIRT" || slot === "TABARD") return;
        const n = (slotCounter.get(slot) ?? 0) + 1;
        slotCounter.set(slot, n);
        const drop = $el.find(".bis_item_drop").first().text().replace(/\s+/g, " ").trim() || null;
        const name = itemSpan.find("span[data-wowhead]").last().text().trim() || itemSpan.text().trim() || null;
        candidates.push({
          list,
          slot,
          rank: n, // Ring/Trinket: 1 и 2 — оба BiS-пары
          itemId: parsed.itemId,
          bonusIds: parsed.bonusIds,
          originalItemId: parsed.originalItemId,
          itemName: name,
          sourceNote: drop,
          score: null,
        });
        lists[list] = (lists[list] ?? 0) + 1;
      });
  });

  // --- Тир-сет из FAQ ("Which Tier Set Pieces Do I Want?")
  $("details.faq-block__dropdown").each((_, det) => {
    const q = $(det).find(".faq-block__question").text().toLowerCase();
    if (!/which tier set/.test(q)) return;
    // берём только из блока Overall (в блоке M+ перечислены предметы для Катализатора из подземелий)
    const blockId = $(det).closest("[id^='bis_']").attr("id") ?? "";
    if (blockId && !/_0$/.test(blockId)) return;
    $(det)
      .find("li")
      .each((_, li) => {
        const text = $(li).text().replace(/\s+/g, " ").trim();
        const slotWord = text.split(/[–—-]/)[0]?.trim() ?? "";
        const slot = normalizeSlot(slotWord);
        const parsed = parseWowheadAttr($(li).find("[data-wowhead]").first().attr("data-wowhead"));
        if (!slot || !parsed) return;
        candidates.push({
          list: "tier",
          slot,
          rank: 1,
          itemId: parsed.itemId,
          bonusIds: parsed.bonusIds,
          originalItemId: parsed.originalItemId,
          itemName: $(li).find("span[data-wowhead]").last().text().trim() || null,
          sourceNote: "Tier set",
          score: null,
        });
        lists.tier = (lists.tier ?? 0) + 1;
      });
  });

  // --- Тир-лист тринкетов (таблица после #trinkets)
  const trinketHeader = $("#trinkets").first();
  if (trinketHeader.length) {
    const container = trinketHeader.closest(".heading_container").length ? trinketHeader.closest(".heading_container") : trinketHeader;
    const table = container.nextAll().find("table").first().length ? container.nextAll().find("table").first() : container.nextAll("table").first();
    const TIER_RANK: Record<string, number> = { s: 1, a: 2, b: 3, c: 4, d: 5, f: 6 };
    table.find("tr").each((_, tr) => {
      const tierText = $(tr).find("td").first().text().trim().toLowerCase();
      const m = /^([sabcdf])\s*tier/.exec(tierText);
      if (!m) return;
      const rank = TIER_RANK[m[1]!] ?? 9;
      $(tr)
        .find("li")
        .each((_, li) => {
          const parsed = parseWowheadAttr($(li).find("[data-wowhead]").first().attr("data-wowhead"));
          if (!parsed) return;
          candidates.push({
            list: "trinkets",
            slot: "TRINKET",
            rank,
            itemId: parsed.itemId,
            bonusIds: parsed.bonusIds,
            originalItemId: null,
            itemName: $(li).find("span[data-wowhead]").last().text().trim() || null,
            sourceNote: `${m[1]!.toUpperCase()} tier`,
            score: null,
          });
          lists.trinkets = (lists.trinkets ?? 0) + 1;
        });
    });
  }

  // дедуп (FAQ повторяется в каждом bis-блоке)
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const key = `${c.list}|${c.slot}|${c.itemId}|${c.rank}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (const k of Object.keys(lists)) lists[k] = unique.filter((c) => c.list === k).length;
  return { candidates: unique, title, lists };
}

export async function fetchIcyVeins(specId: number, fetchImpl: typeof fetch = fetch): Promise<IcyVeinsParseResult> {
  const url = icyVeinsUrl(specId);
  if (!url) throw new Error(`Нет URL Icy Veins для спеки ${specId}`);
  const res = await fetchImpl(url, { headers: { "User-Agent": "Mozilla/5.0 (EasyRoster local guild tool)" }, redirect: "follow" });
  if (!res.ok) throw new Error(`Icy Veins ${res.status} для ${url}`);
  const html = await res.text();
  const parsed = parseIcyVeinsPage(html);
  if (parsed.candidates.length === 0) throw new Error(`Icy Veins: не найдено предметов на ${url} (изменилась вёрстка?)`);
  return parsed;
}
