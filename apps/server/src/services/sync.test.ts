import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { BlizzardClient } from "./blizzard.js";
import { Db } from "./db.js";
import { SyncService } from "./sync.js";
import type { AppConfig } from "@easyroster/core";
import { AppConfigSchema } from "@easyroster/core";

/** Mock Blizzard API: ростер гильдии из 4 персонажей с разными сценариями. */
const summaryHits: Record<string, number> = {};

function mockHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url!, "http://x");
  const json = (code: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(code, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  const p = decodeURIComponent(url.pathname);

  if (p === "/token") return json(200, { access_token: "tok", expires_in: 86399, token_type: "bearer" });
  assert.equal(req.headers.authorization, "Bearer tok");

  if (p === "/data/wow/guild/gordunni/стигма/roster") {
    assert.equal(req.headers["battlenet-namespace"], "profile-eu");
    return json(200, {
      guild: { name: "Стигма", id: 1, realm: { name: "Гордунни", slug: "gordunni" } },
      members: [
        { character: { name: "Акеприст", id: 101, realm: { slug: "revushchiy-fyord", id: 1615 }, level: 90, playable_class: { id: 5 }, playable_race: { id: 10 }, faction: { type: "HORDE" } }, rank: 1 },
        { character: { name: "Кхалгард", id: 102, realm: { slug: "gordunni", id: 1602 }, level: 90, playable_class: { id: 6 }, playable_race: { id: 2 }, faction: { type: "HORDE" } }, rank: 2 },
        { character: { name: "Старый", id: 103, realm: { slug: "gordunni", id: 1602 }, level: 80, playable_class: { id: 8 }, playable_race: { id: 2 }, faction: { type: "HORDE" } }, rank: 2 },
        { character: { name: "Твинк", id: 104, realm: { slug: "gordunni", id: 1602 }, level: 30, playable_class: { id: 1 }, playable_race: { id: 2 }, faction: { type: "HORDE" } }, rank: 5 },
      ],
    });
  }

  // статусы
  if (p === "/profile/wow/character/revushchiy-fyord/акеприст/status") return json(200, { id: 101, is_valid: true });
  if (p === "/profile/wow/character/gordunni/кхалгард/status") return json(200, { id: 102, is_valid: true });
  if (p === "/profile/wow/character/gordunni/старый/status") return json(404, { code: 404, type: "BLZWEBAPI00000404", detail: "Not Found" });

  // summary с поддержкой If-Modified-Since
  if (p === "/profile/wow/character/revushchiy-fyord/акеприст" || p === "/profile/wow/character/gordunni/кхалгард") {
    const name = p.endsWith("акеприст") ? "Акеприст" : "Кхалгард";
    summaryHits[name] = (summaryHits[name] ?? 0) + 1;
    const lm = "Sat, 15 Aug 2026 20:00:00 GMT";
    if (req.headers["if-modified-since"] === lm) {
      res.writeHead(304);
      return res.end();
    }
    return json(
      200,
      {
        id: name === "Акеприст" ? 101 : 102,
        name,
        level: 90,
        faction: { type: "HORDE", name: "Орда" },
        character_class: { id: name === "Акеприст" ? 5 : 6, name: "" },
        active_spec: { id: name === "Акеприст" ? 258 : 250, name: "" },
        realm: { id: 1, slug: name === "Акеприст" ? "revushchiy-fyord" : "gordunni", name: name === "Акеприст" ? "Ревущий фьорд" : "Гордунни" },
        average_item_level: 300,
        equipped_item_level: 298.5,
        last_login_timestamp: 1786000000000,
      },
      { "Last-Modified": lm },
    );
  }
  if (p.endsWith("/equipment")) {
    return json(200, {
      equipped_items: [
        {
          item: { id: 271874 },
          slot: { type: "HEAD", name: "Голова" },
          quality: { type: "EPIC", name: "Эпический" },
          name: "Корона",
          level: { value: 311 },
          inventory_type: { type: "HEAD", name: "Голова" },
          bonus_ids: [],
          bonus_list: [12843, 13662, 1234],
          context: 5,
          name_description: { display_string: "Герой" },
          enchantments: [{ enchantment_id: 7000, enchantment_slot: { id: 0, type: "PERMANENT" } }],
          sockets: [{ socket_type: { type: "PRISMATIC" }, item: { id: 213743, name: "Камень" } }, { socket_type: { type: "PRISMATIC" } }],
          set: { item_set: { id: 1900, name: "Комплект" } },
        },
        {
          item: { id: 250060 },
          slot: { type: "TRINKET_1", name: "Аксессуар 1" },
          quality: { type: "EPIC", name: "Эпический" },
          name: "Тринкет",
          level: { value: 305 },
          bonus_list: [12841],
        },
      ],
    });
  }
  if (p.endsWith("/specializations")) {
    return json(200, {
      active_specialization: { id: 258, name: "Тьма" },
      specializations: [{ specialization: { id: 258, name: "Тьма" }, loadouts: [{ is_active: true, talent_loadout_code: "CIQAAAA" }] }],
    });
  }
  if (p.endsWith("/character-media")) return json(200, { assets: [{ key: "avatar", value: "https://render.example/avatar.jpg" }] });

  json(404, { detail: `no mock for ${p}` });
}

let server: http.Server;
let tmp: string;
let db: Db;

before(async () => {
  server = http.createServer(mockHandler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  BlizzardClient.apiBaseOverride = `http://127.0.0.1:${port}`;
  BlizzardClient.oauthUrlOverride = `http://127.0.0.1:${port}/token`;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "easyroster-test-"));
  db = new Db(path.join(tmp, "t.sqlite"));
});

after(() => {
  db.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function fakeConfig(): { get: () => AppConfig } {
  const cfg = AppConfigSchema.parse({
    setupComplete: true,
    region: "eu",
    guild: { realmSlug: "gordunni", realmName: "Гордунни", name: "Стигма", nameSlug: "стигма" },
    raiderRanks: [1, 2],
    blizzard: { clientId: "id", clientSecret: "secret" },
  });
  return { get: () => cfg };
}

const silent = { info: () => {}, warn: () => {}, error: () => {} };

test("syncGuild: ростер → characters, флаг рейдера по рангам", async () => {
  const sync = new SyncService(fakeConfig() as any, db, silent);
  const r = await sync.syncGuild();
  assert.equal(r.added, 4);
  assert.equal(r.raiders, 3);
  const raiders = sync.repo.listRaiders();
  assert.deepEqual(raiders.map((c) => c.name).sort(), ["Акеприст", "Кхалгард", "Старый"]);
  const all = sync.repo.list({ onlyRaiders: false });
  assert.equal(all.find((c) => c.name === "Твинк")?.isRaider, false);
});

test("syncCharacters: профили, экипировка, nodata, 304 при повторе", async () => {
  const sync = new SyncService(fakeConfig() as any, db, silent);
  const r1 = await sync.syncCharacters();
  assert.deepEqual(r1, { ok: 2, unchanged: 0, nodata: 1, errors: 0 });

  const ake = sync.repo.list({ onlyRaiders: true }).find((c) => c.name === "Акеприст")!;
  assert.equal(ake.profileStatus, "ok");
  assert.equal(ake.activeSpecId, 258);
  assert.equal(ake.ilvlEquipped, 298.5);
  assert.equal(ake.realmName, "Ревущий фьорд");
  assert.equal(ake.talentLoadoutCode, "CIQAAAA");
  assert.equal(ake.avatarUrl, "https://render.example/avatar.jpg");

  const eq = sync.repo.equipment(ake.id);
  assert.equal(eq.length, 2);
  const head = eq.find((e) => e.slot === "HEAD")!;
  assert.deepEqual(head.bonusIds, [12843, 13662, 1234]);
  assert.equal(head.ilvl, 311);
  assert.equal(head.trackName, "Герой");
  assert.equal(head.enchantId, 7000);
  assert.equal(head.gems.length, 1);
  assert.equal(head.emptySockets, 1);
  assert.equal(head.setId, 1900);

  const old = sync.repo.list({ onlyRaiders: true }).find((c) => c.name === "Старый")!;
  assert.equal(old.profileStatus, "nodata");

  // повтор: summary должен вернуть 304 → unchanged
  const r2 = await sync.syncCharacters();
  assert.deepEqual(r2, { ok: 0, unchanged: 2, nodata: 1, errors: 0 });
  assert.equal(summaryHits["Акеприст"], 2);

  // force → снова полная загрузка
  const r3 = await sync.syncCharacters({ force: true });
  assert.equal(r3.ok, 2);
});

test("recomputeRaiders после смены рангов", () => {
  const sync = new SyncService(fakeConfig() as any, db, silent);
  sync.repo.recomputeRaiders([5]);
  assert.deepEqual(sync.repo.listRaiders().map((c) => c.name), ["Твинк"]);
  sync.repo.recomputeRaiders([1, 2]);
  assert.equal(sync.repo.listRaiders().length, 3);
});
