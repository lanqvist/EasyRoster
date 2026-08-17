-- Колонка «BiS» в окне голосования RCLootCouncil
local addon = LibStub("AceAddon-3.0"):GetAddon("RCLootCouncil")
local RCVotingFrame = addon:GetModule("RCVotingFrame")
local ER = addon:GetModule("RCEasyRoster")
local VF = ER:NewModule("EasyRosterVotingFrame", "AceEvent-3.0", "AceTimer-3.0", "AceHook-3.0")

local session = 1
local COL_NAME = "easyroster"

local function currentItemID()
	local lt = addon:GetLootTable()
	local it = lt and lt[session]
	return it and it.itemID, it
end

--- Значение сортировки для строки (кэшируется в data[realrow].cols[column].value)
local function rowValue(name)
	local itemID, it = currentItemID()
	if not itemID then return -1 end
	return ER:SortValue(ER:GetEntry(itemID, name), ER:TrackOfLink(it and it.link))
end

function VF.SetCell(rowFrame, frame, data, cols, row, realrow, column, fShow, table, ...)
	-- lib-st может вызывать DoCellUpdate с разными сигнатурами (старые версии без rowFrame)
	if type(rowFrame) ~= "table" or not frame or type(frame) ~= "table" or not frame.text then
		-- сдвиг аргументов: (frame, data, cols, row, realrow, column, fShow, table)
		frame, data, cols, row, realrow, column, fShow, table = rowFrame, frame, data, cols, row, realrow, column, fShow
	end
	if not (data and data[realrow]) then return end
	local name = data[realrow].name
	local itemID, it = currentItemID()
	local entry = itemID and ER:GetEntry(itemID, name) or nil
	local track = ER:TrackOfLink(it and it.link)

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

	frame:SetScript("OnEnter", function()
		local lines = ER:TooltipLines(entry, name)
		if entry then
			addon:CreateTooltip("EasyRoster · " .. tostring(name), unpack(lines))
		else
			local age = ER:DataAgeDays()
			addon:CreateTooltip("EasyRoster", lines[1], age and string.format("|cff9a9dabданные %.1f дн назад|r", age) or "|cffe06060данные не загружены|r")
		end
	end)
	frame:SetScript("OnLeave", function() addon:HideTooltip() end)
end

function VF.Sort(table, rowa, rowb, sortbycol)
	local column = table.cols[sortbycol]
	local ra, rb = table:GetRow(rowa), table:GetRow(rowb)
	if not (ra and rb) then return false end
	local a, b = rowValue(ra.name), rowValue(rb.name)
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

local spec = {
	colName = COL_NAME,
	name = ER.COLOR .. "BiS|r",
	width = 120,
	align = "LEFT",
	DoCellUpdate = VF.SetCell,
	comparesort = VF.Sort,
	sortnext = "response",
	defaultsort = 1,
}

function VF:OnInitialize()
	if not RCVotingFrame.scrollCols then
		return self:ScheduleTimer("OnInitialize", 0.5)
	end
	if not ER:GetOpt("showColumn") then return end
	self:RegisterMessage("RCSessionChangedPre", "OnSessionChanged")

	if RCVotingFrame.AddColumn and RCVotingFrame.GetColumnIndex then
		-- RCLootCouncil ≥ 3.23: официальный Column API
		if not RCVotingFrame:GetColumnIndex(COL_NAME) then
			local ok, err = pcall(RCVotingFrame.AddColumn, RCVotingFrame, spec, "diff", "after")
			if not ok then ER:Print("не удалось добавить колонку: " .. tostring(err)) end
		end
	else
		-- Старый способ: вставка в scrollCols с пересчётом sortnext (как в RCLootCouncil_wowaudit)
		local sortnext = {}
		for _, v in ipairs(RCVotingFrame.scrollCols) do
			if v.sortnext and type(v.sortnext) == "number" and RCVotingFrame.scrollCols[v.sortnext] then
				sortnext[v.colName] = RCVotingFrame.scrollCols[v.sortnext].colName
			end
		end
		local legacy = CopyTable(spec)
		legacy.sortnext = nil
		tinsert(RCVotingFrame.scrollCols, 8, legacy)
		sortnext[COL_NAME] = "response"
		for index, col in ipairs(RCVotingFrame.scrollCols) do
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
end

function VF:OnSessionChanged(_, s)
	session = s or 1
end
