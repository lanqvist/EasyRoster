import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseSavedVariables, toLua } from "./parse.js";

test("parseSavedVariables: базовые конструкции", () => {
  const src = `
    -- comment
    Foo = {
      ["a"] = 1,
      ["b"] = "str\\"q\\"",
      ["c"] = { 1, 2, 3, },
      ["d"] = { ["x"] = true, ["y"] = false, [5] = "five" },
      ["e"] = -2.5,
      ["f"] = {},
    }
    Bar = { "one", "two" }
  `;
  const r = parseSavedVariables(src) as any;
  assert.equal(r.Foo.a, 1);
  assert.equal(r.Foo.b, 'str"q"');
  assert.deepEqual(r.Foo.c, [1, 2, 3]);
  assert.deepEqual(r.Foo.d, { x: true, y: false, "5": "five" });
  assert.equal(r.Foo.e, -2.5);
  assert.deepEqual(r.Foo.f, []);
  assert.deepEqual(r.Bar, ["one", "two"]);
});

test("toLua round-trip", () => {
  const v = { ["Имя-Реалм"]: { 271874: { r: 1, s: "y", p: 3.2, sl: "HEAD" } }, list: [1, 2] };
  const lua = "X = " + toLua(v);
  const back = parseSavedVariables(lua) as any;
  assert.equal(back.X["Имя-Реалм"]["271874"].r, 1);
  assert.equal(back.X["Имя-Реалм"]["271874"].sl, "HEAD");
  assert.deepEqual(back.X.list, [1, 2]);
});

const real = "C:/Program Files (x86)/World of Warcraft/_retail_/WTF/Account/1143029547#1/SavedVariables/RCLootCouncil.lua";
test("parseSavedVariables: реальный RCLootCouncil.lua", { skip: !fs.existsSync(real) }, () => {
  const t0 = Date.now();
  const r = parseSavedVariables(fs.readFileSync(real, "utf8")) as any;
  const dt = Date.now() - t0;
  assert.ok(r.RCLootCouncilDB, "RCLootCouncilDB");
  assert.ok(r.RCLootCouncilLootDB, "RCLootCouncilLootDB");
  const fr = r.RCLootCouncilLootDB.factionrealm;
  const realmKeys = Object.keys(fr);
  assert.ok(realmKeys.length > 0);
  const players = fr[realmKeys[0]!];
  const firstPlayer = Object.keys(players)[0]!;
  const entries = players[firstPlayer];
  assert.ok(Array.isArray(entries) && entries.length > 0, "история есть");
  assert.ok(entries[0].lootWon.includes("|Hitem:"));
  console.log(`  parsed in ${dt} ms: realms ${realmKeys.length}, players ${Object.keys(players).length}, first ${firstPlayer} (${entries.length})`);
});
