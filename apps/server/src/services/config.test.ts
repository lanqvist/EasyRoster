import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigPatchSchema } from "@easyroster/core";
import { deepMerge, pruneToInput } from "./config.js";

test("pruneToInput: zod-дефолты соседних полей не попадают в патч и не затирают конфиг", () => {
  const input = { season: { raidDifficulty: "heroic" } };
  const parsed = ConfigPatchSchema.parse(input) as Record<string, any>;
  // zod подставил дефолты внутрь season
  assert.ok("raidInstanceIds" in parsed.season);
  const pruned = pruneToInput(parsed, input) as Record<string, any>;
  assert.deepEqual(pruned, { season: { raidDifficulty: "heroic" } });
  const base = { season: { raidInstanceIds: [1320], dungeonInstanceIds: [1], seasonId: 37, label: "S2", raidDifficulty: "normal" } };
  const merged = deepMerge(base, pruned) as typeof base;
  assert.deepEqual(merged.season.raidInstanceIds, [1320]);
  assert.equal(merged.season.seasonId, 37);
  assert.equal(merged.season.raidDifficulty, "heroic");
});
