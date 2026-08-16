import { test } from "node:test";
import assert from "node:assert/strict";
import { droptimizerCandidates, extractReportId, parseDroptimizerJson, parseProfilesetName } from "./droptimizer.js";

test("extractReportId", () => {
  assert.equal(extractReportId("https://www.raidbots.com/simbot/report/abc123DEF456"), "abc123DEF456");
  assert.equal(extractReportId("https://www.raidbots.com/reports/abc123DEF456/data.json"), "abc123DEF456");
  assert.equal(extractReportId("abc123DEF456xyz"), "abc123DEF456xyz");
  assert.equal(extractReportId("nope"), null);
});

test("parseProfilesetName", () => {
  assert.deepEqual(parseProfilesetName("1320/2888/271874/334/head/13848:12849"), { itemId: 271874, bonusIds: [13848, 12849], ilvl: 334, slotHint: "HEAD" });
  assert.deepEqual(parseProfilesetName("-1/1322/273773/321/hands/12841")?.itemId, 273773);
  assert.equal(parseProfilesetName("foo/bar"), null);
});

test("parseDroptimizerJson + candidates", () => {
  const json = {
    simbot: { simType: "droptimizer", date: 1786900000, meta: { rawFormData: { character: { name: "Акеприст", realm: "Ревущий фьорд", region: "eu" } } } },
    sim: {
      players: [{ name: "Акеприст", specialization: "Shadow", collected_data: { dps: { mean: 1000000 } } }],
      profilesets: { results: [
        { name: "1320/2895/271874/334/head/13848", mean: 1032000 },
        { name: "1320/2895/271874/334/head/12854", mean: 1030000 },
        { name: "1320/2871/268257/334/waist/13848", mean: 1010000 },
        { name: "1320/2871/268999/334/waist/13848", mean: 990000 },
      ] },
    },
  };
  const r = parseDroptimizerJson("id1", json);
  assert.equal(r.character.name, "Акеприст");
  assert.equal(r.date, 1786900000000);
  assert.equal(r.results.length, 4);
  const c = droptimizerCandidates(r, (id) => (id === 271874 ? "HEAD" : "WAIST"));
  assert.equal(c.length, 2); // 268999 — не апгрейд, 271874 дедуплицирован по лучшему %
  const head = c.find((x) => x.itemId === 271874)!;
  assert.equal(head.score, 3.2);
  assert.deepEqual(head.bonusIds, [13848]);
  assert.equal(c.find((x) => x.itemId === 268257)!.rank, 1);
});
