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

function SD:SendItemData(itemID)
	if not (EasyRosterTimestamp and EasyRosterTimestamp > 0) then return end
	local entries = ER:GetEntriesForItem(itemID)
	if next(entries) == nil then return end
	ER.Send("group", "er_data", itemID, EasyRosterTimestamp, entries)
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
	-- отвечаем только если наши данные свежее уже разосланных
	self:SendItemData(itemID)
end
