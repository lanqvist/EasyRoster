import type { CharacterRow, EquipmentRow } from "@easyroster/core";
import type { Db } from "./db.js";

export interface RosterUpsert {
  id: number;
  name: string;
  realmSlug: string;
  realmName: string;
  classId: number;
  level: number;
  faction: string | null;
  rank: number;
  isRaider: boolean;
  raceId?: number | null;
}

export class CharactersRepo {
  constructor(private readonly db: Db) {}

  /** Обновляет ростер целиком: пришедшие — in_guild=1, отсутствующие — in_guild=0. */
  upsertRoster(members: RosterUpsert[], now: number): { added: number; updated: number; left: number } {
    const c = this.db.conn;
    const upsert = c.prepare(`
      INSERT INTO characters (id, name, realm_slug, realm_name, class_id, level, faction, rank, in_guild, is_raider, roster_synced_at, race_id)
      VALUES (@id, @name, @realmSlug, @realmName, @classId, @level, @faction, @rank, 1, @isRaider, @now, @raceId)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, realm_slug = excluded.realm_slug,
        realm_name = CASE WHEN excluded.realm_name <> '' THEN excluded.realm_name ELSE characters.realm_name END,
        class_id = excluded.class_id, level = excluded.level, faction = COALESCE(excluded.faction, characters.faction),
        rank = excluded.rank, in_guild = 1, is_raider = excluded.is_raider, roster_synced_at = excluded.roster_synced_at,
        race_id = COALESCE(excluded.race_id, characters.race_id)
    `);
    const exists = c.prepare("SELECT 1 FROM characters WHERE id = ?");
    let added = 0;
    let updated = 0;
    c.exec("BEGIN");
    try {
      for (const m of members) {
        const was = exists.get(m.id);
        upsert.run({
          id: m.id, name: m.name, realmSlug: m.realmSlug, realmName: m.realmName, classId: m.classId,
          level: m.level, faction: m.faction, rank: m.rank, isRaider: m.isRaider ? 1 : 0, now, raceId: m.raceId ?? null,
        });
        if (was) updated++;
        else added++;
      }
      const left = c
        .prepare("UPDATE characters SET in_guild = 0, is_raider = 0 WHERE in_guild = 1 AND roster_synced_at < ?")
        .run(now).changes;
      c.exec("COMMIT");
      return { added, updated, left: Number(left) };
    } catch (e) {
      c.exec("ROLLBACK");
      throw e;
    }
  }

  /** Пересчитать флаг рейдера по списку рангов (после смены настроек). */
  recomputeRaiders(raiderRanks: number[]): void {
    const set = new Set(raiderRanks);
    const rows = this.db.conn.prepare("SELECT id, rank FROM characters WHERE in_guild = 1").all() as Array<{ id: number; rank: number }>;
    const upd = this.db.conn.prepare("UPDATE characters SET is_raider = ? WHERE id = ?");
    this.db.conn.exec("BEGIN");
    for (const r of rows) upd.run(set.has(r.rank) ? 1 : 0, r.id);
    this.db.conn.exec("COMMIT");
  }

  listRaiders(): CharacterRow[] {
    return this.db.conn
      .prepare("SELECT * FROM characters WHERE in_guild = 1 AND is_raider = 1 ORDER BY rank, name")
      .all()
      .map(mapCharacter);
  }

  list(opts: { onlyRaiders: boolean }): CharacterRow[] {
    const sql = opts.onlyRaiders
      ? "SELECT * FROM characters WHERE in_guild = 1 AND is_raider = 1 ORDER BY rank, name"
      : "SELECT * FROM characters WHERE in_guild = 1 ORDER BY rank, name";
    return this.db.conn.prepare(sql).all().map(mapCharacter);
  }

  get(id: number): CharacterRow | undefined {
    const r = this.db.conn.prepare("SELECT * FROM characters WHERE id = ?").get(id);
    return r ? mapCharacter(r) : undefined;
  }

  allEquippedItemIds(): number[] {
    return (this.db.conn.prepare("SELECT DISTINCT item_id FROM equipment").all() as Array<{ item_id: number }>).map((r) => r.item_id);
  }

  equipment(id: number): EquipmentRow[] {
    return this.db.conn.prepare("SELECT * FROM equipment WHERE character_id = ?").all(id).map(mapEquipment);
  }

  setProfileStatus(id: number, status: CharacterRow["profileStatus"], message: string | null): void {
    this.db.conn.prepare("UPDATE characters SET profile_status = ?, profile_message = ? WHERE id = ?").run(status, message, id);
  }

  saveProfile(
    id: number,
    p: {
      activeSpecId: number | null;
      ilvlEquipped: number;
      ilvlAvg: number;
      lastLoginMs: number;
      realmName: string;
      level: number;
      avatarUrl: string | null;
      talentLoadoutCode: string | null;
      summaryLastModified: string | null;
      syncedAt: number;
    },
    items: Omit<EquipmentRow, "characterId">[],
  ): void {
    const c = this.db.conn;
    c.exec("BEGIN");
    try {
      c.prepare(`
        UPDATE characters SET active_spec_id = ?, ilvl_equipped = ?, ilvl_avg = ?, last_login_ms = ?, realm_name = ?, level = ?,
          avatar_url = COALESCE(?, avatar_url), talent_loadout_code = COALESCE(?, talent_loadout_code),
          summary_last_modified = ?, profile_synced_at = ?, profile_status = 'ok', profile_message = NULL
        WHERE id = ?
      `).run(
        p.activeSpecId, p.ilvlEquipped, p.ilvlAvg, p.lastLoginMs, p.realmName, p.level,
        p.avatarUrl, p.talentLoadoutCode, p.summaryLastModified, p.syncedAt, id,
      );
      c.prepare("DELETE FROM equipment WHERE character_id = ?").run(id);
      const ins = c.prepare(`
        INSERT INTO equipment (character_id, slot, item_id, item_name, ilvl, quality, inv_type, bonus_ids, context, track_name,
          enchant_id, gems, empty_sockets, set_id, set_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const it of items) {
        ins.run(
          id, it.slot, it.itemId, it.itemName, it.ilvl, it.quality, it.invType, JSON.stringify(it.bonusIds), it.context,
          it.trackName, it.enchantId, JSON.stringify(it.gems), it.emptySockets, it.setId, it.setName,
        );
      }
      c.exec("COMMIT");
    } catch (e) {
      c.exec("ROLLBACK");
      throw e;
    }
  }

  /** Обновить только «мягкие» поля при 304 (профиль не менялся). */
  touchProfile(id: number, syncedAt: number): void {
    this.db.conn.prepare("UPDATE characters SET profile_synced_at = ?, profile_status = 'ok', profile_message = NULL WHERE id = ?").run(syncedAt, id);
  }
}

function mapCharacter(r: any): CharacterRow {
  return {
    id: r.id,
    name: r.name,
    realmSlug: r.realm_slug,
    realmName: r.realm_name,
    classId: r.class_id,
    level: r.level,
    faction: r.faction,
    rank: r.rank,
    inGuild: !!r.in_guild,
    isRaider: !!r.is_raider,
    activeSpecId: r.active_spec_id,
    ilvlEquipped: r.ilvl_equipped,
    ilvlAvg: r.ilvl_avg,
    lastLoginMs: r.last_login_ms,
    avatarUrl: r.avatar_url,
    talentLoadoutCode: r.talent_loadout_code,
    profileStatus: r.profile_status,
    profileMessage: r.profile_message,
    profileSyncedAt: r.profile_synced_at,
    summaryLastModified: r.summary_last_modified,
    rosterSyncedAt: r.roster_synced_at,
    raceId: r.race_id ?? null,
  };
}

function mapEquipment(r: any): EquipmentRow {
  return {
    characterId: r.character_id,
    slot: r.slot,
    itemId: r.item_id,
    itemName: r.item_name,
    ilvl: r.ilvl,
    quality: r.quality,
    invType: r.inv_type,
    bonusIds: JSON.parse(r.bonus_ids),
    context: r.context,
    trackName: r.track_name,
    enchantId: r.enchant_id,
    gems: JSON.parse(r.gems),
    emptySockets: r.empty_sockets,
    setId: r.set_id,
    setName: r.set_name,
  };
}
