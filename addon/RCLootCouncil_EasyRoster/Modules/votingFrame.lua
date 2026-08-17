-- Колонки «BiS», «Альт M+», «Альт рейд» в окне голосования RCLootCouncil
local addon = LibStub("AceAddon-3.0"):GetAddon("RCLootCouncil")
local RCVotingFrame = addon:GetModule("RCVotingFrame")
local ER = addon:GetModule("RCEasyRoster")
local VF = ER:NewModule("EasyRosterVotingFrame", "AceEvent-3.0", "AceTimer-3.0", "AceHook-3.0")

local tconcat = table.concat -- параметр DoCellUpdate называется `table` и затеняет стандартную библиотеку
local session = 1
local COL_NAME = "easyroster"
local COL_ALT_MPLUS = "easyroster_alt_mplus"
local COL_ALT_RAID = "easyroster_alt_raid"

local function currentItemID()
	local lt = addon:GetLootTable()
	local it = lt and lt[session]
	return it and it.itemID, it
end

--- Запись и трек выпавшего предмета для кандидата (по текущей сессии)
local function entryFor(name)
	local itemID, it = currentItemID()
	if not itemID then return nil, nil end
	return ER:GetEntry(itemID, name), ER:TrackOfLink(it and it.link)
end

-- lib-st может вызывать DoCellUpdate с разными сигнатурами (старые версии без rowFrame)
local function normalizeArgs(rowFrame, frame, data, cols, row, realrow, column, fShow, table)
	if type(rowFrame) ~= "table" or not frame or type(frame) ~= "table" or not frame.text then
		return rowFrame, frame, data, cols, row, realrow, column, fShow
	end
	return frame, data, cols, row, realrow, column, fShow, table
end

local function setTooltip(frame, title, lines)
	frame:SetScript("OnEnter", function() addon:CreateTooltip(title, unpack(lines)) end)
	frame:SetScript("OnLeave", function() addon:HideTooltip() end)
end

-- ---------------------------------------------------------------- колонка BiS

function VF.SetCell(rowFrame, frame, data, cols, row, realrow, column, fShow, table, ...)
	local frame, data, cols, row, realrow, column, fShow, table = normalizeArgs(rowFrame, frame, data, cols, row, realrow, column, fShow, table)
	if not (data and data[realrow]) then return end
	local name = data[realrow].name
	local entry, track = entryFor(name)

	local text
	if not ER:HasData() then
		text = "|cff9a9dabнет данных|r"
	elseif entry then
		text = ER:FormatEntry(entry, track)
	else
		text = "|cff5a5d6a—|r"
	end
	frame.text:SetText(text)
	data[realrow].cols[column].value = ER:SortValue(entry, track)

	local lines = ER:TooltipLines(entry, name, track)
	if entry then
		setTooltip(frame, "EasyRoster - " .. tostring(name), lines)
	else
		local age = ER:DataAgeDays()
		setTooltip(frame, "EasyRoster", { lines[1], age and string.format("|cff9a9dabданные %.1f дн назад|r", age) or "|cffe06060данные не загружены|r" })
	end
end

-- ---------------------------------------------------------------- колонки альтернатив

local function makeAltCell(key, label)
	return function(rowFrame, frame, data, cols, row, realrow, column, fShow, table, ...)
		local frame, data, cols, row, realrow, column, fShow, table = normalizeArgs(rowFrame, frame, data, cols, row, realrow, column, fShow, table)
		if not (data and data[realrow]) then return end
		local name = data[realrow].name
		local entry, track = entryFor(name)
		frame.text:SetText(entry and ER:FormatAlt(entry, key, track) or "|cff5a5d6a—|r")
		data[realrow].cols[column].value = ER:AltSortValue(entry, key, track)

		local a, pct = ER:AltFor(entry, key, track)
		if a then
			local own = ER:PctForTrack(entry, track)
			local lines = {
				string.format("%s: %s%s", label, ER:ItemName(a.i), a.n and (" — " .. a.n) or ""),
			}
			if pct ~= nil and own ~= nil then
				local diff = own - pct
				tinsert(lines, string.format("Альтернатива даст %+.1f%%, выпавшее — %+.1f%%", pct, own))
				tinsert(lines, ER.DiffColor(diff) .. (diff >= 1 and "Выпавшее заметно лучше — слот иначе так не закрыть" or diff >= 0.3 and "Выпавшее немного лучше альтернативы" or diff > -0.3 and "Примерно равноценно — слот закрывается и без рейда" or "Альтернатива лучше — этот предмет ему не приоритет") .. "|r")
			elseif pct ~= nil then
				tinsert(lines, string.format("балл в BiS-листе %d (сима нет)", pct))
			end
			if type(a.pt) == "table" then
				local parts = {}
				for _, tr in ipairs({ "Champion", "Hero", "Myth" }) do
					if a.pt[tr] then tinsert(parts, string.format("%s %+.1f%%", tr, a.pt[tr])) end
				end
				if #parts > 0 then tinsert(lines, "По трекам: " .. tconcat(parts, " - ")) end
			end
			-- остальные типы — коротко
			for _, k in ipairs(ER.ALT_KINDS) do
				if k.key ~= key then
					local b, bp = ER:AltFor(entry, k.key, track)
					if b then tinsert(lines, string.format("|cff9a9dab%s: %s%s|r", k.label, ER:ItemName(b.i), bp and string.format(" %+.1f%%", bp) or "")) end
				end
			end
			setTooltip(frame, "EasyRoster - " .. tostring(name), lines)
		else
			setTooltip(frame, "EasyRoster - " .. tostring(name), { entry and ("Альтернативы (" .. label .. ") в BiS-листе нет — предмет для этого слота незаменим") or "|cff9a9dabНет в BiS-листе|r" })
		end
	end
end

-- ---------------------------------------------------------------- сортировка

--- Общий компаратор: значение берётся из value(entry, track) — уже кэшированного при отрисовке недостаточно
--- (lib-st сортирует до отрисовки), поэтому пересчитываем.
local function makeSort(valueFn)
	return function(table, rowa, rowb, sortbycol)
		local column = table.cols[sortbycol]
		local ra, rb = table:GetRow(rowa), table:GetRow(rowb)
		if not (ra and rb) then return false end
		local ea, ta = entryFor(ra.name)
		local eb, tb = entryFor(rb.name)
		local a, b = valueFn(ea, ta), valueFn(eb, tb)
		if a == b then
			if column.sortnext then
				local nextcol = table.cols[column.sortnext]
				if nextcol and not nextcol.sort then
					if nextcol.comparesort then
						return nextcol.comparesort(table, rowa, rowb, column.sortnext)
					else
						return table:CompareSort(rowa, rowb, column.sortnext)
					end
				end
			end
			return false
		end
		local direction = column.sort or column.defaultsort or 1
		if direction == 1 then return a > b else return a < b end
	end
end

VF.Sort = makeSort(function(e, t) return ER:SortValue(e, t) end)

-- ---------------------------------------------------------------- спецификации колонок

local specs = {
	{
		colName = COL_NAME,
		name = ER.COLOR .. "BiS|r",
		width = 120,
		align = "LEFT",
		DoCellUpdate = VF.SetCell,
		comparesort = VF.Sort,
		sortnext = "response",
		defaultsort = 1,
	},
	{
		colName = COL_ALT_MPLUS,
		name = ER.COLOR .. "Альт M+|r",
		width = 78,
		align = "LEFT",
		DoCellUpdate = makeAltCell("am", "Альтернатива из M+"),
		comparesort = makeSort(function(e, t) return ER:AltSortValue(e, "am", t) end),
		sortnext = COL_NAME,
		defaultsort = 1,
		alt = true,
	},
	{
		colName = COL_ALT_RAID,
		name = ER.COLOR .. "Альт рейд|r",
		width = 78,
		align = "LEFT",
		DoCellUpdate = makeAltCell("ar", "Альтернатива с другого босса"),
		comparesort = makeSort(function(e, t) return ER:AltSortValue(e, "ar", t) end),
		sortnext = COL_NAME,
		defaultsort = 1,
		alt = true,
	},
}

--- Добавить/убрать колонки по текущим опциям (Column API ≥ 3.23 — на лету; иначе только при загрузке)
function VF:ApplyColumns()
	local wantMain = ER:GetOpt("showColumn")
	local wantAlt = wantMain and ER:GetOpt("showAltColumns")
	if RCVotingFrame.AddColumn and RCVotingFrame.GetColumnIndex then
		local after = "diff"
		local changed = false
		for _, spec in ipairs(specs) do
			local want = spec.alt and wantAlt or (not spec.alt and wantMain)
			local present = RCVotingFrame:GetColumnIndex(spec.colName)
			if want and not present then
				local s = CopyTable(spec)
				s.alt = nil
				local ok, err = pcall(RCVotingFrame.AddColumn, RCVotingFrame, s, after, "after")
				if not ok then ER:Print("не удалось добавить колонку " .. spec.colName .. ": " .. tostring(err)) end
				changed = true
			elseif not want and present then
				if RCVotingFrame.RemoveColumn then
					pcall(RCVotingFrame.RemoveColumn, RCVotingFrame, spec.colName)
					changed = true
				else
					ER:Print("скрытие колонки применится после /reload")
				end
			end
			if want then after = spec.colName end
		end
		if changed and RCVotingFrame.RefreshColumnLayout then pcall(RCVotingFrame.RefreshColumnLayout, RCVotingFrame) end
		return true
	end
	return false
end

function VF:OnInitialize()
	if not RCVotingFrame.scrollCols then
		return self:ScheduleTimer("OnInitialize", 0.5)
	end
	self:RegisterMessage("RCSessionChangedPre", "OnSessionChanged")
	if not ER:GetOpt("showColumn") then return end
	local showAlt = ER:GetOpt("showAltColumns")

	if self:ApplyColumns() then return end

	-- Старый способ: вставка в scrollCols с пересчётом sortnext (как в RCLootCouncil_wowaudit)
	local sortnext = {}
	for _, v in ipairs(RCVotingFrame.scrollCols) do
		if v.sortnext and type(v.sortnext) == "number" and RCVotingFrame.scrollCols[v.sortnext] then
			sortnext[v.colName] = RCVotingFrame.scrollCols[v.sortnext].colName
		end
	end
	local pos = 8
	for _, spec in ipairs(specs) do
		if not spec.alt or showAlt then
			local legacy = CopyTable(spec)
			legacy.alt = nil
			local nextName = legacy.sortnext
			legacy.sortnext = nil
			tinsert(RCVotingFrame.scrollCols, pos, legacy)
			sortnext[spec.colName] = nextName
			pos = pos + 1
		end
	end
	for _, col in ipairs(RCVotingFrame.scrollCols) do
		local target = sortnext[col.colName]
		if target then
			for j, c2 in ipairs(RCVotingFrame.scrollCols) do
				if c2.colName == target then col.sortnext = j end
			end
		end
	end
	local frame = RCVotingFrame:GetFrame()
	if frame and frame.st then
		frame.st:SetDisplayCols(RCVotingFrame.scrollCols)
		frame:SetWidth(frame.st.frame:GetWidth() + 20)
	end
end

function VF:OnSessionChanged(_, s)
	session = s or 1
end
