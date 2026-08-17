-- Рассылка данных по предмету членам группы (чтобы db.lua был нужен только у одного офицера)
local addon = LibStub("AceAddon-3.0"):GetAddon("RCLootCouncil")
local Comms = addon.Require "Services.Comms"
local ItemUtils = addon.Require "Utils.Item"
local ER = addon:GetModule("RCEasyRoster")
local SD = ER:NewModule("EasyRosterShareData", "AceEvent-3.0", "AceTimer-3.0")

function SD:OnInitialize()
	ER.Send = Comms:GetSender(ER.PREFIXES.MAIN)
	self:RegisterMessage("RCMLAddItem", "OnMLAddItem")
	self:RegisterMessage("RCLootTableAdditionsReceived", "OnLootTable")
	Comms:BulkSubscribe(ER.PREFIXES.MAIN, {
		er_data = function(data, sender) self:OnDataReceived(sender, unpack(data)) end,
		er_request = function(data, sender) self:OnDataRequested(sender, unpack(data)) end,
	})
end

--- Мастер лута добавил предмет: если у нас есть данные — разошлём, иначе попросим у группы
function SD:OnMLAddItem(_, item)
	local itemID = ItemUtils:GetItemIDFromLink(item)
	if not itemID then return end
	if ER:DataAgeDays() then
		self:SendItemData(itemID)
	else
		ER.Send("group", "er_request", itemID)
	end
end

--- Пришла лут-таблица (мы кандидат/совет): если данных нет — запросим
function SD:OnLootTable()
	if ER:DataAgeDays() then return end
	local lt = addon:GetLootTable()
	if not lt then return end
	for _, it in ipairs(lt) do
		if it.itemID and not ER.shared[it.itemID] then
			ER.Send("group", "er_request", it.itemID)
		end
	end
end

-- Ключи записи, которые аддон реально читает (всё остальное — служебное для веб-приложения, по сети не шлём)
local SENT_KEYS = { "r", "s", "sl", "sc", "p", "pt", "dd", "dt", "hp", "ap", "ai", "as", "ag", "an", "am", "ar", "av", "ak", "t", "tp", "t4", "t2", "tc", "d", "c", "k" }

--- Имена участников группы в нижнем регистре ("имя-реалм"); nil если не в группе
local function groupNames()
	local n = GetNumGroupMembers()
	if not n or n == 0 then return nil end
	local out = {}
	local prefix = IsInRaid() and "raid" or "party"
	for i = 1, n do
		local unit = prefix .. i
		if prefix == "party" and i == n then unit = "player" end
		local name = addon.UnitName and addon:UnitName(unit)
		if not name then
			local short, realm = UnitName(unit)
			if short then name = short .. "-" .. ((realm and realm ~= "" and realm) or GetNormalizedRealmName() or "") end
		end
		if name then out[string.lower(name)] = true end
	end
	return out
end

local lastRequestAnswered = {}
local lastSent = {} -- itemID -> timestamp последней рассылки (не спамить одно и то же)

function SD:SendItemData(itemID)
	if not (EasyRosterTimestamp and EasyRosterTimestamp > 0) then return end
	if lastSent[itemID] == EasyRosterTimestamp then return end
	local entries = ER:GetEntriesForItem(itemID)
	if next(entries) == nil then return end
	-- только участники текущей группы и только нужные поля: payload в 2–3 раза меньше
	local group = groupNames()
	local slim = {}
	local any = false
	for name, e in pairs(entries) do
		if not group or group[string.lower(name)] then
			local t = {}
			for _, k in ipairs(SENT_KEYS) do
				if e[k] ~= nil then t[k] = e[k] end
			end
			slim[name] = t
			any = true
		end
	end
	if not any then return end
	lastSent[itemID] = EasyRosterTimestamp
	ER.Send("group", "er_data", itemID, EasyRosterTimestamp, slim)
end

function SD:OnDataReceived(sender, itemID, timestamp, entries)
	if not itemID or type(entries) ~= "table" then return end
	timestamp = tonumber(timestamp) or 0
	if ER.shared[itemID] and (ER.sharedTimestamp or 0) > timestamp then return end
	ER.shared[itemID] = entries
	if timestamp > (ER.sharedTimestamp or 0) then ER.sharedTimestamp = timestamp end
	local vf = addon:GetActiveModule("votingframe")
	if vf and vf.Update then vf:Update(true) end
end

function SD:OnDataRequested(sender, itemID)
	if not itemID then return end
	-- на запрос отвечаем даже если уже слали (у запросившего данных нет), но не чаще раза в 10 с на предмет
	local now = GetTime()
	if (lastRequestAnswered[itemID] or 0) > now - 10 then return end
	lastRequestAnswered[itemID] = now
	lastSent[itemID] = nil
	self:SendItemData(itemID)
end
