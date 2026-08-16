-- RCLootCouncil_EasyRoster: заглушка фазы 0. Реализация колонки — фаза 4.
local addonName = ...
local addon = LibStub("AceAddon-3.0"):GetAddon("RCLootCouncil", true)
if not addon then return end

local Mod = addon:NewModule("RCEasyRoster", "AceEvent-3.0", "AceTimer-3.0", "AceHook-3.0")

function Mod:OnInitialize()
	self:Print("загружен (данные от " .. date("%Y-%m-%d %H:%M", EasyRosterTimestamp or 0) .. ")")
end

function Mod:Print(msg)
	print("|cffd9a441EasyRoster|r: " .. tostring(msg))
end
