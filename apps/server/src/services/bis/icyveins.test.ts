import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { icyVeinsUrl, normalizeSlot, parseIcyVeinsPage, parseWowheadAttr } from "./icyveins.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = fs.readFileSync(path.join(here, "..", "..", "..", "test-fixtures", "iv-arcane-mage.html"), "utf8");

test("icyVeinsUrl", () => {
  assert.equal(icyVeinsUrl(62), "https://www.icy-veins.com/wow/arcane-mage-pve-dps-gear-best-in-slot");
  assert.equal(icyVeinsUrl(253), "https://www.icy-veins.com/wow/beast-mastery-hunter-pve-dps-gear-best-in-slot");
  assert.equal(icyVeinsUrl(65), "https://www.icy-veins.com/wow/holy-paladin-pve-healing-gear-best-in-slot");
  assert.equal(icyVeinsUrl(581), "https://www.icy-veins.com/wow/vengeance-demon-hunter-pve-tank-gear-best-in-slot");
});

test("parseWowheadAttr", () => {
  assert.deepEqual(parseWowheadAttr("item=271565&bonus=13848&original-item=268243"), { itemId: 271565, bonusIds: [13848], originalItemId: 268243 });
  assert.deepEqual(parseWowheadAttr("item=268265&amp;bonus=13848:13708"), { itemId: 268265, bonusIds: [13848, 13708], originalItemId: null });
  assert.equal(parseWowheadAttr("spell=365350"), null);
  assert.equal(normalizeSlot("Bracers"), "WRIST");
  assert.equal(normalizeSlot("Main Hand"), "MAIN_HAND");
});

test("parseIcyVeinsPage: arcane mage fixture", () => {
  const r = parseIcyVeinsPage(fixture);
  assert.ok(r.title?.includes("Arcane Mage"), r.title ?? "");
  const overall = r.candidates.filter((c) => c.list === "overall");
  const raid = r.candidates.filter((c) => c.list === "raid");
  const mplus = r.candidates.filter((c) => c.list === "mplus");
  // 12 одиночных слотов + 2 кольца + 2 тринкета = 16
  assert.equal(overall.length, 16);
  assert.equal(raid.length, 16);
  assert.equal(mplus.length, 16);
  const head = overall.find((c) => c.slot === "HEAD")!;
  assert.equal(head.itemId, 271874);
  assert.deepEqual(head.bonusIds, [13848, 13846]);
  assert.equal(head.sourceNote, "Ula'tek");
  const hands = overall.find((c) => c.slot === "HANDS")!;
  assert.equal(hands.itemId, 271565);
  assert.equal(hands.originalItemId, 268243);
  assert.match(hands.sourceNote ?? "", /Catalyst/);
  const rings = overall.filter((c) => c.slot === "FINGER");
  assert.equal(rings.length, 2);
  assert.deepEqual(rings.map((r) => r.rank), [1, 2]);
  const tier = r.candidates.filter((c) => c.list === "tier");
  assert.equal(tier.length, 5);
  assert.deepEqual(tier.map((t) => t.slot).sort(), ["CHEST", "HANDS", "HEAD", "LEGS", "SHOULDER"]);
  const trinkets = r.candidates.filter((c) => c.list === "trinkets");
  assert.ok(trinkets.length >= 4, `trinkets ${trinkets.length}`);
  assert.equal(trinkets[0]!.rank, 1);
  assert.equal(trinkets[0]!.itemId, 250215);
});
