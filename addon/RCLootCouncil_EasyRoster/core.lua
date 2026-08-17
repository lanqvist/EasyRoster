-- RCLootCouncil_EasyRoster — ядро: доступ к данным db.lua, нормализация имён, опции, /rc er
local addon = LibStub("AceAddon-3.0"):GetAddon("RCLootCouncil")
local ER = addon:NewModule("RCEasyRoster", "AceEvent-3.0", "AceTimer-3.0", "AceHook-3.0", "AceConsole-3.0")
_G.RCEasyRoster = ER

ER.version = C_AddOns and C_AddOns.GetAddOnMetadata and C_AddOns.GetAddOnMetadata("RCLootCouncil_EasyRoster", "Version") or "0.4.2"
ER.COLOR = "|cffd9a441"
ER.PREFIXES = { MAIN = "RCer" }

-- Данные, полученные от других игроков (мастер лута/совет): itemID -> { [nameKey] = entry }
ER.shared = {}
ER.sharedTimestamp = 0

-- Настройки по умолчанию (хранятся в профиле RCLC через addon:Getdb())
ER.defaults = {
	easyroster = {
		showColumn = true,
		showLootFrame = true,
		showRankOnly = false, -- показывать только ранг (#1/#2), без статуса
		exportGuild = true,
	},
}

local function strlowerSafe(s)
	if not s then return "" end
	return string.lower(s)
end

-- Индекс ключей персонажей в нижнем регистре: "имя-реалм" -> исходный ключ db.lua
local lowerIndex = {}
local function rebuildIndex()
	wipe(lowerIndex)
	if type(EasyRosterData) ~= "table" then return end
	for key in pairs(EasyRosterData) do
		lowerIndex[strlowerSafe(key)] = key
	end
end

--- Есть ли вообще данные (свои или полученные по сети)
function ER:HasData()
	return (EasyRosterTimestamp and EasyRosterTimestamp > 0 and type(EasyRosterData) == "table") or next(self.shared) ~= nil
end

--- Возраст локальных данных в днях (nil если данных нет)
function ER:DataAgeDays()
	if not EasyRosterTimestamp or EasyRosterTimestamp == 0 then return nil end
	return (GetServerTime() - EasyRosterTimestamp) / 86400
end

--- Нормализация имени кандидата RCLC ("Name-Realm") в ключ таблицы
--- Возвращает запись из EasyRosterData по имени и itemID (или nil)
function ER:GetEntry(itemID, candidateName)
	if not itemID or not candidateName then return nil end
	local entry
	-- 1) собственные данные из db.lua
	if type(EasyRosterData) == "table" then
		local t = EasyRosterData[candidateName]
		if not t then
			local key = lowerIndex[strlowerSafe(candidateName)]
			if key then t = EasyRosterData[key] end
		end
		if not t then
			-- без реалма (свой реалм) — Ambiguate
			local short = Ambiguate(candidateName, "short")
			for key, data in pairs(EasyRosterData) do
				if strlowerSafe(key):find("^" .. strlowerSafe(short):gsub("%p", "%%%0") .. "%-") then
					t = data
					break
				end
			end
		end
		if t then entry = t[itemID] end
	end
	-- 2) данные, присланные другими (если свежее или своих нет)
	local shared = self.shared[itemID]
	if shared then
		local se = shared[candidateName] or shared[lowerIndex[strlowerSafe(candidateName)] or ""]
		if not se then
			for k, v in pairs(shared) do
				if strlowerSafe(k) == strlowerSafe(candidateName) then se = v break end
			end
		end
		if se and (not entry or (self.sharedTimestamp or 0) > (EasyRosterTimestamp or 0)) then
			entry = se
		end
	end
	return entry
end

--- Все записи по предмету среди своих данных: { [name] = entry }
function ER:GetEntriesForItem(itemID)
	local out = {}
	if type(EasyRosterData) == "table" then
		for name, items in pairs(EasyRosterData) do
			local e = items[itemID]
			if e then out[name] = e end
		end
	end
	return out
end

local STATUS_TEXT = {
	y = { text = "есть", color = "|cff4fbf7a" },
	l = { text = "есть ↓", color = "|cffe0b64a" },
	c = { text = "катализ.", color = "|cff7cc4ff" },
	n = { text = "нужно", color = "|cffe06060" },
}
ER.STATUS_TEXT = STATUS_TEXT

--- Название трека выпавшего предмета по bonusID в ссылке (EasyRosterTracks из db.lua)
function ER:TrackOfLink(link)
	if not link or type(EasyRosterTracks) ~= "table" then return nil end
	local s = link:match("|Hitem:([%-%d:]+)|h")
	if not s then return nil end
	local f = {}
	for v in (s .. ":"):gmatch("([^:]*):") do f[#f + 1] = v end
	local n = tonumber(f[13]) or 0
	for i = 1, n do
		local id = tonumber(f[13 + i])
		if id and EasyRosterTracks[id] then return EasyRosterTracks[id] end
	end
	return nil
end

--- % апгрейда для конкретного трека (если есть разбивка), иначе общий
function ER:PctForTrack(entry, track)
	if not entry then return nil end
	if track and type(entry.pt) == "table" and entry.pt[track] then return entry.pt[track], track end
	return entry.p, nil
end

--- Короткий текст для ячейки: "BiS #1 · нужно (+3.2%)"
function ER:FormatEntry(entry, track)
	if not entry then return nil end
	local st = STATUS_TEXT[entry.s] or STATUS_TEXT.n
	local rank = entry.r or 9
	local rankText
	if rank == 1 then
		rankText = "|cff4fbf7aBiS|r"
	elseif rank <= 3 then
		rankText = "|cffe0b64a#" .. rank .. "|r"
	else
		rankText = "|cff9a9dab#" .. rank .. "|r"
	end
	local text = rankText
	if entry.k == 1 then text = text .. " |cff9a9dab(токен)|r" end
	if entry.c == 1 then text = text .. " |cff9a9dab(→катализ.)|r" end
	if entry.tc == 4 then text = text .. " |cff4fbf7aзакроет 4pc|r" elseif entry.tc == 2 then text = text .. " |cffe0b64aзакроет 2pc|r" end
	if not self:GetOpt("showRankOnly") then
		text = text .. " " .. st.color .. st.text .. "|r"
	end
	local pct = self:PctForTrack(entry, track)
	if pct and pct ~= 0 then
		local color = pct > 0 and "|cff7cc4ff" or "|cff9a9dab"
		text = text .. string.format(" %s%+.1f%%|r", color, pct)
		if entry.dt then text = text .. string.format(" |cff9a9dab(урон %+.1f%%)|r", entry.dt) end
		-- незаменимость: насколько лучше фармабельной альтернативы
		if entry.ag then
			local gcol = entry.ag >= 2 and "|cff4fbf7a" or (entry.ag >= 0.8 and "|cffe0b64a" or "|cff9a9dab")
			text = text .. string.format(" %s▲%.1f|r", gcol, entry.ag)
		end
	end
	return text
end

--- Числовое значение для сортировки: чем больше — тем «нужнее»
function ER:SortValue(entry, track)
	if not entry then return -1 end
	local v = 100 - (entry.r or 9) * 10
	if entry.s == "n" then v = v + 40 elseif entry.s == "c" then v = v + 25 elseif entry.s == "l" then v = v + 10 end
	local pct = self:PctForTrack(entry, track)
	if pct then v = v + pct * 5 end
	return v
end

--- Тултип по записи
function ER:TooltipLines(entry, name)
	local lines = {}
	if not entry then
		tinsert(lines, "|cff9a9dabНет в BiS-листе|r")
		return lines
	end
	local st = STATUS_TEXT[entry.s] or STATUS_TEXT.n
	tinsert(lines, string.format("Слот: %s · место в листе: #%d · балл %s", tostring(entry.sl or "?"), entry.r or 0, tostring(entry.sc or "?")))
	tinsert(lines, "Статус: " .. st.color .. st.text .. "|r" .. (entry.d and (" — " .. entry.d) or ""))
	if entry.p then
		if type(entry.pt) == "table" then
			local parts = {}
			for _, tr in ipairs({ "Champion", "Hero", "Myth" }) do
				if entry.pt[tr] then tinsert(parts, string.format("%s %+.1f%%", tr, entry.pt[tr])) end
			end
			tinsert(lines, "Сим: " .. table.concat(parts, " · "))
		else
			tinsert(lines, string.format("Сим: %+.1f%%", entry.p))
		end
		if entry.dd then tinsert(lines, string.format("Прирост DPS (лучший трек): %+d", entry.dd)) end
		if entry.dt or entry.hp then
			tinsert(lines, string.format("Танк: входящий урон %+.1f%%%s", entry.dt or 0, entry.hp and string.format(", самолечение %+.1f%%", entry.hp) or ""))
		end
	end
	local SRC = { r = "рейд", m = "M+", v = "тайник", c = "катализатор", k = "крафт", w = "мировой босс", o = "другое" }
	if entry.ap or entry.ai then
		local altName = entry.ai and (C_Item.GetItemInfo(entry.ai) or ("#" .. entry.ai)) or "?"
		tinsert(lines, string.format("Лучшая альтернатива: %s (%s) %+.1f%%", altName, SRC[entry.as or "o"] or "?", entry.ap or 0))
	end
	if entry.ag then
		tinsert(lines, string.format("Незаменимость (над фармабельной альтернативой): %+.1f%%%s", entry.ag, entry.an and (" · альтернатив ≥95%%: " .. entry.an) or ""))
	end
	if entry.t == 1 then
		local tl = "Тир-предмет"
		if entry.tp then tl = tl .. string.format(" · надето %d/5", entry.tp) end
		if entry.t4 then tl = tl .. string.format(" · 4pc = %+.1f%%", entry.t4) end
		if entry.t2 then tl = tl .. string.format(" · 2pc = %+.1f%%", entry.t2) end
		if entry.tc == 4 then tl = tl .. " · |cff4fbf7aэта часть закроет 4pc|r" elseif entry.tc == 2 then tl = tl .. " · закроет 2pc" end
		tinsert(lines, tl)
	end
	if entry.k == 1 then tinsert(lines, "Тир-токен: содержит BiS-предмет для этого персонажа") end
	if entry.c == 1 then tinsert(lines, "Рейдовый предмет — источник для Катализатора") end
	return lines
end

-- ---------------------------------------------------------------- опции

function ER:GetOpt(key)
	local db = addon:Getdb()
	if db and db.easyroster and db.easyroster[key] ~= nil then return db.easyroster[key] end
	return self.defaults.easyroster[key]
end
function ER:SetOpt(key, value)
	local db = addon:Getdb()
	if not db then return end
	db.easyroster = db.easyroster or {}
	db.easyroster[key] = value
end

local optionsTable = {
	type = "group",
	name = "EasyRoster",
	args = {
		desc = { type = "description", order = 0, name = "Данные генерирует локальное приложение EasyRoster (Data\\db.lua). После обновления файла сделайте /reload." },
		showColumn = {
			type = "toggle", order = 1, name = "Колонка BiS в окне голосования", width = "full",
			get = function() return ER:GetOpt("showColumn") end,
			set = function(_, v) ER:SetOpt("showColumn", v); ER:Print("изменение колонки применится после /reload") end,
		},
		showLootFrame = {
			type = "toggle", order = 2, name = "Подсказка в окне ролла", width = "full",
			get = function() return ER:GetOpt("showLootFrame") end,
			set = function(_, v) ER:SetOpt("showLootFrame", v) end,
		},
		showRankOnly = {
			type = "toggle", order = 3, name = "Показывать только место в листе (без статуса)", width = "full",
			get = function() return ER:GetOpt("showRankOnly") end,
			set = function(_, v) ER:SetOpt("showRankOnly", v); if addon:GetActiveModule("votingframe") then addon:GetActiveModule("votingframe"):Update(true) end end,
		},
		exportGuild = {
			type = "toggle", order = 4, name = "Экспортировать ростер гильдии (ранги, заметки) в SavedVariables", width = "full",
			get = function() return ER:GetOpt("exportGuild") end,
			set = function(_, v) ER:SetOpt("exportGuild", v) end,
		},
		status = {
			type = "description", order = 10,
			name = function()
				local age = ER:DataAgeDays()
				if not age then return "|cffe06060Данные не загружены (нет Data\\db.lua)|r" end
				local n = 0
				if type(EasyRosterData) == "table" then for _ in pairs(EasyRosterData) do n = n + 1 end end
				return string.format("Данные от %s (%.1f дн назад), персонажей: %d, сезон: %s", date("%d.%m.%Y %H:%M", EasyRosterTimestamp), age, n, tostring(EasyRosterSeason or "?"))
			end,
		},
	},
}

function ER:OnInitialize()
	if not addon.optionsFrame then
		return self:ScheduleTimer("OnInitialize", 0.5)
	end
	rebuildIndex()
	LibStub("AceConfigRegistry-3.0"):RegisterOptionsTable("RCLootCouncil_EasyRoster", optionsTable)
	addon.optionsFrame.easyroster = LibStub("AceConfigDialog-3.0"):AddToBlizOptions("RCLootCouncil_EasyRoster", "EasyRoster", "RCLootCouncil")
	addon:ModuleChatCmd(self, "ShowStatus", nil, "Статус данных EasyRoster", "er", "easyroster")
	local age = self:DataAgeDays()
	if age then
		self:Print(string.format("данные от %s (%s)", date("%d.%m %H:%M", EasyRosterTimestamp), age > 3 and ("|cffe0b64a" .. string.format("%.0f дн назад", age) .. "|r") or "свежие"))
	else
		self:Print("|cffe06060нет данных|r — сгенерируйте db.lua в приложении EasyRoster и сделайте /reload")
	end
end

function ER:ShowStatus()
	local age = self:DataAgeDays()
	if not age then self:Print("данных нет"); return end
	local n = 0
	for _ in pairs(EasyRosterData) do n = n + 1 end
	self:Print(string.format("данные от %s (%.1f дн), персонажей %d, сезон %s, версия %s", date("%d.%m.%Y %H:%M", EasyRosterTimestamp), age, n, tostring(EasyRosterSeason), self.version))
end

function ER:Print(msg)
	print(self.COLOR .. "EasyRoster|r: " .. tostring(msg))
end
