-- Подсказка в окне ролла (RCLootFrame): свой BiS-статус по предмету
local addon = LibStub("AceAddon-3.0"):GetAddon("RCLootCouncil")
local RCLootFrame = addon:GetModule("RCLootFrame")
local ER = addon:GetModule("RCEasyRoster")
local LF = ER:NewModule("EasyRosterLootFrame", "AceHook-3.0")

local hookRunning = false

function LF:OnEnable()
	if RCLootFrame and RCLootFrame.EntryManager then
		self:SecureHook(RCLootFrame.EntryManager, "GetEntry", "HookGetEntry")
	end
end

function LF:HookGetEntry(_, item)
	if hookRunning then return end
	hookRunning = true
	local ok, entry = pcall(RCLootFrame.EntryManager.GetEntry, RCLootFrame.EntryManager, item)
	if ok and entry and not self:IsHooked(entry, "Update") then
		self:SecureHook(entry, "Update", "HookEntryUpdate")
		self:HookEntryUpdate(entry)
	end
	hookRunning = false
end

function LF.HookEntryUpdate(_, entry)
	if not ER:GetOpt("showLootFrame") then return end
	if not (entry and entry.itemLvl and entry.item) then return end
	local text = entry.itemLvl:GetText() or ""
	if text:find("EasyRoster", 1, true) or text:find("BiS", 1, true) then return end
	local lt = addon:GetLootTable()
	local session = entry.item.sessions and entry.item.sessions[1]
	local itemID = session and lt and lt[session] and lt[session].itemID
	if not itemID then return end
	local me = addon.playerName or (addon.player and addon.player.name)
	if not me then return end
	local e = ER:GetEntry(itemID, me)
	if e then
		-- % для трека именно выпавшего предмета (по bonusID ссылки), а не лучшего трека
		local track = ER:TrackOfLink(lt[session].link or entry.item.link)
		entry.itemLvl:SetText(text .. "  " .. ER.COLOR .. "ER|r " .. (ER:FormatEntry(e, track) or ""))
	elseif ER:HasData() then
		entry.itemLvl:SetText(text .. "  " .. ER.COLOR .. "ER|r |cff5a5d6aне в BiS|r")
	end
end
