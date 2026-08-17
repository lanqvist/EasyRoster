import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSimcProfile, simcSpecName } from "./profile.js";
import { buildSimCandidates, profilesetLine, trackBonusIds } from "./candidates.js";
import type { BonusEntry, CharacterRow, EquipmentRow, ItemRow } from "@easyroster/core";

const char = {
  id: 1, name: "Мороут", realmSlug: "tarren-mill", realmName: "Tarren Mill", classId: 1, level: 90, faction: "HORDE", rank: 1, inGuild: true,
  isRaider: true, activeSpecId: 71, ilvlEquipped: 290, ilvlAvg: 290, lastLoginMs: 0, avatarUrl: null, talentLoadoutCode: "CcEA", profileStatus: "ok",
  profileMessage: null, profileSyncedAt: 0, summaryLastModified: null, rosterSyncedAt: 0, raceId: 2,
} as CharacterRow;

const eq: EquipmentRow[] = [
  { characterId: 1, slot: "HEAD", itemId: 239050, itemName: null, ilvl: 300, quality: "EPIC", invType: "HEAD", bonusIds: [12833, 13439], context: 5, trackName: null, enchantId: null, gems: [{ itemId: 240906, name: "gem" }], emptySockets: 0, setId: null, setName: null },
  { characterId: 1, slot: "MAIN_HAND", itemId: 49802, itemName: null, ilvl: 300, quality: "EPIC", invType: "TWOHWEAPON", bonusIds: [13654], context: 5, trackName: null, enchantId: 7983, gems: [], emptySockets: 0, setId: null, setName: null },
];

test("simc profile", () => {
  assert.equal(simcSpecName(71), "arms");
  assert.equal(simcSpecName(253), "beast_mastery");
  const p = buildSimcProfile({ character: char, specId: 71, equipment: eq, role: "attack" });
  assert.match(p.text, /^warrior="Мороут"\n/);
  assert.match(p.text, /race=orc/);
  assert.match(p.text, /spec=arms/);
  assert.match(p.text, /talents=CcEA/);
  assert.match(p.text, /head=,id=239050,bonus_id=12833\/13439,gem_id=240906/);
  assert.match(p.text, /main_hand=,id=49802,bonus_id=13654,enchant_id=7983/);
});

test("trackBonusIds: строго текущий сезон", () => {
  const b = new Map<number, BonusEntry>([
    [12841, { id: 12841, upgrade: { group: 617, level: 1, max: 6, name: "Hero", seasonId: 37, itemLevel: 305 } }],
    [12842, { id: 12842, upgrade: { group: 617, level: 2, max: 6, name: "Hero", seasonId: 37, itemLevel: 308 } }],
    [12889, { id: 12889, upgrade: { group: 629, level: 1, max: 6, name: "Hero", itemLevel: 375 } }], // без сезона — не брать
    [12849, { id: 12849, upgrade: { group: 618, level: 1, max: 6, name: "Myth", seasonId: 37, itemLevel: 318 } }],
  ]);
  const t = trackBonusIds(b, 37);
  assert.equal(t.get("Hero")?.bonusId, 12841);
  assert.equal(t.get("Myth")?.bonusId, 12849);
});

const item = (id: number, inv: number, sub = 4, cls = 4, extra: Partial<ItemRow> = {}): ItemRow & { instanceId: number; encounterId: number } => ({
  id, name: `item${id}`, nameRu: null, icon: null, quality: 4, itemClass: cls, itemSubClass: sub, inventoryType: inv, slot: null, baseIlvl: 219,
  itemSetId: null, specs: null, allowableClasses: null, stats: [{ id: 4 }, { id: 7 }], contains: null, uniqueEquipped: false, onUseTrinket: false,
  expansion: 11, origin: "raidbots", instanceId: 1320, encounterId: 2888, ...extra,
});

test("buildSimCandidates: плейт, кольца ×2, токен, off-hand", () => {
  const tracks = new Map([["Hero", { bonusId: 12841, ilvl: 305 }], ["Myth", { bonusId: 12849, ilvl: 318 }]]);
  const tierPiece = item(500, 1, 4, 4, { allowableClasses: [1], itemSetId: 2070 });
  const raid = [
    item(100, 1), // плейт-шлем — ок
    item(101, 1, 1), // ткань — нет
    item(102, 11, 0, 4, { stats: [{ id: 74 }] }), // кольцо str/int — ок, 2 слота
    item(103, 14, 6, 4), // щит — у Arms нет off_hand → пропуск
    item(200, 0, 2, 5, { contains: [500, 501] }), // токен
  ];
  const cands = buildSimCandidates({
    specId: 71, classId: 1, raidItems: raid, dungeonItems: [], raidTracks: ["Hero", "Myth"], dungeonTracks: [], tracks,
    resolveItem: (id) => (id === 500 ? tierPiece : undefined), hasOffHand: false, usesTwoHand: true,
  });
  const names = cands.map((c) => c.name);
  assert.ok(names.includes("1320/2888/100/head/Hero/0"));
  assert.ok(names.includes("1320/2888/100/head/Myth/0"));
  assert.ok(!names.some((n) => n.includes("/101/")));
  assert.equal(cands.filter((c) => c.itemId === 102).length, 4); // finger1+finger2 × 2 трека
  assert.ok(!names.some((n) => n.includes("/103/")));
  assert.ok(names.includes("1320/2888/500/head/Myth/200"));
  assert.match(profilesetLine(cands[0]!), /^profileset\."1320\/2888\/100\/head\/Hero\/0"\+=head=,id=100,bonus_id=12841$/);
});
