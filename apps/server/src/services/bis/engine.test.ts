import { test } from "node:test";
import assert from "node:assert/strict";
import type { BisCandidateRow, BisEntry, BonusEntry, EquipmentRow, ItemRow } from "@easyroster/core";
import { buildCharacterBis, candidateScore, computeAlternatives } from "./engine.js";
import { aggregateGear } from "./wcl.js";

const bonuses = new Map<number, BonusEntry>([
  [12843, { id: 12843, upgrade: { group: 617, level: 3, max: 6, name: "Hero", seasonId: 37, itemLevel: 311 } }],
  [12854, { id: 12854, upgrade: { group: 618, level: 6, max: 6, name: "Myth", seasonId: 37, itemLevel: 334 } }],
]);

function item(id: number, extra: Partial<ItemRow> = {}): ItemRow {
  return {
    id, name: `Item ${id}`, nameRu: null, icon: null, quality: 4, itemClass: 4, itemSubClass: 1, inventoryType: 1, slot: "HEAD",
    baseIlvl: 219, itemSetId: null, specs: null, allowableClasses: null, stats: [], contains: null, uniqueEquipped: false,
    onUseTrinket: false, expansion: 11, origin: "raidbots", ...extra,
  };
}
function cand(p: Partial<BisCandidateRow> & { itemId: number; slot: string }): BisCandidateRow {
  return {
    id: 0, source: "icyveins", specId: 62, characterId: null, list: "overall", rank: 1, bonusIds: [], originalItemId: null,
    itemName: null, sourceNote: null, score: null, fetchedAt: 1, ...p,
  };
}
function eq(slot: string, itemId: number, bonusIds: number[] = [], setId: number | null = null): EquipmentRow {
  return { characterId: 1, slot, itemId, itemName: null, ilvl: 300, quality: "EPIC", invType: null, bonusIds, context: null, trackName: null, enchantId: null, gems: [], emptySockets: 0, setId, setName: null };
}

const baseInput = {
  characterId: 1,
  specId: 62,
  manual: [],
  itemSources: () => [],
  bonuses,
  weights: { icyveins: 1, wcl: 1, droptimizer: 2 },
  perSlot: 4,
  simMaxAgeMs: 14 * 86400000,
  now: 1000,
};

test("candidateScore", () => {
  assert.equal(candidateScore(cand({ itemId: 1, slot: "HEAD" })), 100);
  assert.equal(candidateScore(cand({ itemId: 1, slot: "HEAD", list: "raid" })), 70);
  assert.equal(candidateScore(cand({ itemId: 1, slot: "TRINKET", list: "trinkets", rank: 2 })), 85);
  assert.equal(candidateScore(cand({ itemId: 1, slot: "HEAD", source: "wcl", score: 50 })), 45);
  assert.equal(candidateScore(cand({ itemId: 1, slot: "HEAD", source: "droptimizer", score: 3 })), 60);
});

test("объединение источников и статусы obtained", () => {
  const candidates = [
    cand({ itemId: 100, slot: "HEAD" }), // IV overall
    cand({ itemId: 100, slot: "HEAD", source: "wcl", score: 60 }), // + WCL 60%
    cand({ itemId: 101, slot: "HEAD", source: "wcl", score: 30 }),
    cand({ itemId: 200, slot: "FINGER", rank: 1 }),
    cand({ itemId: 201, slot: "FINGER", rank: 2 }),
    cand({ itemId: 300, slot: "HANDS", list: "tier", originalItemId: 301 }),
  ];
  const items = new Map<number, ItemRow>([
    [100, item(100)],
    [101, item(101)],
    [200, item(200, { slot: "FINGER", inventoryType: 11 })],
    [201, item(201, { slot: "FINGER", inventoryType: 11 })],
    [300, item(300, { slot: "HANDS", inventoryType: 10, itemSetId: 2070 })],
    [301, item(301, { slot: "HANDS", inventoryType: 10 })],
  ]);
  const equipment = [
    eq("HEAD", 100, [12843]), // BiS шлем, но Hero → lower
    eq("FINGER_1", 200, [12854]), // BiS кольцо на Myth → yes
    eq("FINGER_2", 999), // другое
    eq("HANDS", 301), // рейдовые перчатки, ещё не катализированы → catalyst
  ];
  const v = buildCharacterBis({ ...baseInput, candidates, equipment, items });
  const head = v.slots.find((s) => s.slot === "HEAD")!;
  assert.equal(head.entries[0]!.itemId, 100);
  assert.equal(head.entries[0]!.score, 154); // 100 + 54
  assert.equal(head.entries[0]!.obtained, "lower");
  assert.match(head.entries[0]!.obtainedDetail ?? "", /Hero 3\/6/);
  assert.equal(head.entries[1]!.itemId, 101);
  assert.equal(head.entries[1]!.obtained, "no");

  const fingers = v.slots.find((s) => s.slot === "FINGER")!;
  assert.equal(fingers.entries.length, 2);
  assert.equal(fingers.entries.find((e) => e.itemId === 200)!.obtained, "yes");
  assert.equal(fingers.equipped.length, 2);

  const hands = v.slots.find((s) => s.slot === "HANDS")!;
  assert.equal(hands.entries[0]!.obtained, "catalyst");
  assert.equal(hands.entries[0]!.isTier, true);

  // покрытие: HEAD(lower) + FINGER×2 (1 yes, 1 no) + HANDS(catalyst) = 4 слота, 1 yes, 2 lower/catalyst
  assert.deepEqual(v.coverage, { slots: 4, obtained: 1, lower: 2, pct: 25 });
});

test("ручные правки: exclude и pin", () => {
  const candidates = [cand({ itemId: 100, slot: "HEAD" }), cand({ itemId: 101, slot: "HEAD", rank: 2, list: "raid" })];
  const items = new Map([[100, item(100)], [101, item(101)], [777, item(777)]]);
  const v = buildCharacterBis({
    ...baseInput,
    candidates,
    equipment: [],
    items,
    manual: [
      { id: 1, characterId: 1, specId: 62, slot: "HEAD", itemId: 100, action: "exclude", note: null, createdAt: 0 },
      { id: 2, characterId: null, specId: 62, slot: "HEAD", itemId: 777, action: "pin", note: "офицер", createdAt: 0 },
    ],
  });
  const head = v.slots.find((s) => s.slot === "HEAD")!;
  assert.deepEqual(head.entries.map((e) => e.itemId), [777, 101]);
});

test("персональный сим: свежий учитывается, устаревший — нет", () => {
  const candidates = [
    cand({ itemId: 100, slot: "HEAD" }),
    cand({ itemId: 101, slot: "HEAD", source: "droptimizer", characterId: 1, list: "sim", score: 4, fetchedAt: 900 }),
  ];
  const items = new Map([[100, item(100)], [101, item(101)]]);
  const fresh = buildCharacterBis({ ...baseInput, candidates, equipment: [], items });
  assert.equal(fresh.slots[0]!.entries[0]!.itemId, 101); // 4% × 20 × вес 2 = 160 > 100
  assert.ok(fresh.personalSim);
  const stale = buildCharacterBis({ ...baseInput, candidates, equipment: [], items, now: 900 + 15 * 86400000 });
  assert.equal(stale.slots[0]!.entries[0]!.itemId, 100);
  assert.equal(stale.personalSim, null);
});

test("aggregateGear (WCL): популярность по слотам, парные слоты", () => {
  const rankings = [
    { gear: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 0 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }, { id: 9 }, { id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }, { id: 14 }, { id: 15, bonusIDs: [12854] }, { id: 16 }, { id: 0 }] },
    { gear: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 0 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }, { id: 9 }, { id: 11 }, { id: 10 }, { id: 12 }, { id: 99 }, { id: 14 }, { id: 15, bonusIDs: [12854] }, { id: 16 }, { id: 0 }] },
  ];
  const c = aggregateGear(rankings, 5);
  const head = c.filter((x) => x.slot === "HEAD");
  assert.equal(head.length, 1);
  assert.equal(head[0]!.score, 100);
  const rings = c.filter((x) => x.slot === "FINGER");
  assert.deepEqual(rings.map((r) => [r.itemId, r.score]).sort((a, b) => (a[0] as number) - (b[0] as number)), [[10, 50], [11, 50]]);
  const trinkets = c.filter((x) => x.slot === "TRINKET").sort((a, b) => a.rank - b.rank);
  assert.equal(trinkets[0]!.itemId, 12);
  assert.equal(trinkets[0]!.score, 50);
  const mh = c.find((x) => x.slot === "MAIN_HAND")!;
  assert.deepEqual(mh.bonusIds, [12854]);
});

test("computeAlternatives: разбивка по типам контента (M+ / другой босс / тайник), исключение того же босса", () => {
  const mk = (p: Partial<BisEntry> & { itemId: number; sourceKind: BisEntry["sourceKind"]; simByTrack: Record<string, number>; drops: BisEntry["drops"] }): BisEntry => ({
    slot: "HEAD", rank: 0, itemName: `I${p.itemId}`, itemNameRu: null, icon: null, quality: 4, bonusIds: [], originalItemId: null, score: 50,
    sources: [], bisTrack: null, dropTrack: null, equippedBest: null, alternatives: null, obtained: "no", obtainedDetail: null, isTier: false,
    simSelected: { track: p.sourceKind === "mplus" ? "Hero" : "Champion", pct: p.simByTrack[p.sourceKind === "mplus" ? "Hero" : "Champion"]! },
    ...p,
  });
  const raidDrop = (enc: number, name: string): BisEntry["drops"] => [{ instanceId: 1320, instanceName: "Raid", encounterId: enc, encounterName: name, kind: "raid" }];
  const mDrop = (inst: number, name: string): BisEntry["drops"] => [{ instanceId: inst, instanceName: name, encounterId: 9, encounterName: "boss", kind: "mplus" }];
  const entries: BisEntry[] = [
    mk({ itemId: 1, sourceKind: "raid", drops: raidDrop(1, "Ula'tek"), simByTrack: { Champion: 3, Hero: 4, Myth: 5 } }),
    mk({ itemId: 2, sourceKind: "raid", drops: raidDrop(1, "Ula'tek"), simByTrack: { Champion: 2.5, Hero: 3, Myth: 4 } }), // тот же босс — не альтернатива для #1
    mk({ itemId: 3, sourceKind: "raid", drops: raidDrop(2, "Sszorak"), simByTrack: { Champion: 2, Hero: 2.8, Myth: 3.5 } }),
    mk({ itemId: 4, sourceKind: "mplus", drops: mDrop(1322, "Altar"), simByTrack: { Champion: 1, Hero: 2.2, Myth: 3.9 } }),
    mk({ itemId: 5, sourceKind: "mplus", drops: mDrop(1041, "Kings"), simByTrack: { Champion: 0.5, Hero: 1.9, Myth: 4.2 } }),
  ];
  computeAlternatives(entries);
  const a = entries[0]!.alternatives!;
  assert.equal(a.byKind.raid?.itemId, 3, "другой босс рейда — не тот же энкаунтер");
  assert.equal(a.byKind.raid?.sourceName, "Sszorak");
  assert.deepEqual(a.byKind.raid?.pctByTrack, { Champion: 2, Hero: 2.8, Myth: 3.5 });
  assert.equal(a.byKind.mplus?.itemId, 4, "лучший M+ на треке ключа (Hero)");
  assert.equal(a.byKind.mplus?.pct, 2.2);
  assert.equal(a.byKind.mplus?.sourceName, "Altar");
  assert.equal(a.byKind.vault?.itemId, 5, "тайник — лучший M+ на треке Миф");
  assert.equal(a.byKind.vault?.pct, 4.2);
  assert.equal(a.byKind.vault?.track, "Myth");
  assert.equal(a.byKind.craft, null);
  assert.equal(a.farmable?.itemId, 4);
  assert.equal(a.gap, 0.8);
});
