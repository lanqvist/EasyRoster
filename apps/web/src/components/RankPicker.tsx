import { useState } from "react";
import type { GuildProbeResult } from "@easyroster/core";

interface Props {
  value: number[];
  onChange: (ranks: number[]) => void;
  /** распределение по рангам из probe (необязательно) */
  probe?: GuildProbeResult["ranks"];
  labels: Record<string, string>;
  onLabelsChange: (labels: Record<string, string>) => void;
}

/** Ранги задаются вручную числами (0 = ГМ … 9). Список из API — только подсказка. */
export function RankPicker({ value, onChange, probe, labels, onLabelsChange }: Props) {
  const [text, setText] = useState(value.join(", "));

  const commitText = (t: string) => {
    setText(t);
    const nums = t
      .split(/[\s,;]+/)
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 9);
    onChange([...new Set(nums)].sort((a, b) => a - b));
  };

  const toggle = (rank: number) => {
    const next = value.includes(rank) ? value.filter((r) => r !== rank) : [...value, rank].sort((a, b) => a - b);
    onChange(next);
    setText(next.join(", "));
  };

  const ranks = probe && probe.length > 0 ? probe.map((r) => r.rank) : Array.from({ length: 10 }, (_, i) => i);

  return (
    <div>
      <div className="field">
        <label>Индексы рангов рейдеров</label>
        <input value={text} onChange={(e) => commitText(e.target.value)} placeholder="например: 1, 2" />
        <span className="hint">
          Через запятую. 0 — гильдмастер. Blizzard API отдаёт только номер ранга; название можно подписать ниже.
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Ранг</th>
            <th>Подпись (необязательно)</th>
            {probe && <th className="num">Персонажей</th>}
            {probe && <th className="num">Макс. уровень</th>}
            <th>Рейдеры</th>
          </tr>
        </thead>
        <tbody>
          {ranks.map((rank) => {
            const p = probe?.find((r) => r.rank === rank);
            const on = value.includes(rank);
            return (
              <tr key={rank} className={on ? "selected" : undefined}>
                <td className="num">{rank}</td>
                <td>
                  <input
                    style={{ width: 180 }}
                    value={labels[String(rank)] ?? ""}
                    placeholder={rank === 0 ? "ГМ" : ""}
                    onChange={(e) => onLabelsChange({ ...labels, [String(rank)]: e.target.value })}
                  />
                </td>
                {probe && <td className="num">{p?.total ?? 0}</td>}
                {probe && <td className="num">{p?.maxLevel ?? 0}</td>}
                <td>
                  <button type="button" className={on ? "primary" : undefined} onClick={() => toggle(rank)}>
                    {on ? "Да" : "Нет"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
