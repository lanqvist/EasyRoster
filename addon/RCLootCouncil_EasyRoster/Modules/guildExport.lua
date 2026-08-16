-- Экспорт ростера гильдии (имена рангов, заметки) в SavedVariables → читает приложение EasyRoster.
-- Blizzard API не отдаёт названия рангов и заметки, поэтому берём их из игры.
local addon = LibStub("AceAddon-3.0"):GetAddon("RCLootCouncil")
local ER = addon:GetModule("RCEasyRoster")
local GE = ER:NewModule("EasyRosterGuildExport", "AceEvent-3.0", "AceTimer-3.0")

local pending = false

function GE:OnEnable()
	EasyRosterDB = EasyRosterDB or {}
	self:RegisterEvent("PLAYER_ENTERING_WORLD", "Schedule")
	self:RegisterEvent("GUILD_ROSTER_UPDATE", "Schedule")
	self:RegisterEvent("PLAYER_GUILD_UPDATE", "Schedule")
end

function GE:Schedule()
	if pending or not ER:GetOpt("exportGuild") then return end
	pending = true
	self:ScheduleTimer("Export", 3)
end

function GE:Export()
	pending = false
	if not IsInGuild() then return end
	local guildName, _, _, realm = GetGuildInfo("player")
	if not guildName then
		-- инфо о гильдии ещё не пришло — попробуем позже
		if C_GuildInfo and C_GuildInfo.GuildRoster then C_GuildInfo.GuildRoster() end
		self:ScheduleTimer("Schedule", 5)
		return
	end
	local n = GetNumGuildMembers()
	if not n or n == 0 then
		if C_GuildInfo and C_GuildInfo.GuildRoster then C_GuildInfo.GuildRoster() end
		return
	end
	local ranks = {}
	local nRanks = GuildControlGetNumRanks and GuildControlGetNumRanks() or 0
	for i = 1, nRanks do
		ranks[tostring(i - 1)] = GuildControlGetRankName(i)
	end
	local members = {}
	for i = 1, n do
		local name, rankName, rankIndex, level, _, _, note, officerNote, _, _, classFile, _, _, _, _, _, guid = GetGuildRosterInfo(i)
		if name then
			ranks[tostring(rankIndex)] = ranks[tostring(rankIndex)] or rankName
			members[name] = {
				name = name,
				rankName = rankName,
				rankIndex = rankIndex,
				level = level,
				note = note ~= "" and note or nil,
				officerNote = officerNote ~= "" and officerNote or nil,
				class = classFile,
				guid = guid,
			}
		end
	end
	local realmName = GetRealmName()
	EasyRosterDB.guild = {
		name = guildName,
		realm = realmName,
		exportedAt = GetServerTime(),
		exportedBy = (UnitName("player") or "?") .. "-" .. (realmName or "?"),
		ranks = ranks,
		members = members,
	}
end
