import { useEffect, useState } from "react";
import { api } from "../lib/api";

/** Кнопка таргетного пересима персонажа с состоянием (в очереди / идёт / готово). */
export function SimNowButton({ characterId, onDone, small = false, label = "⟳ Симить" }: { characterId: number; onDone?: () => void; small?: boolean; label?: string }) {
  const [state, setState] = useState<"idle" | "queued" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "queued" && state !== "running") return;
    const id = setInterval(async () => {
      try {
        const s = await api.simStatus();
        const me = s.characters.find((c) => c.characterId === characterId);
        if (s.current?.characterId === characterId) setState("running");
        else if (me && !me.queued) {
          setState(me.lastOk ? "done" : "error");
          setMsg(me.lastOk ? null : me.lastMessage);
          onDone?.();
          clearInterval(id);
        }
      } catch { /* ignore */ }
    }, 2500);
    return () => clearInterval(id);
  }, [state, characterId, onDone]);

  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMsg(null);
    try {
      const st = await api.simStatus();
      if (!st.simcPath) throw new Error("SimC не установлен (страница BiS → Установить)");
      const r = await api.simRun({ ids: [characterId] });
      if (r.queued === 0) throw new Error("не поставлен (хил / нет спеки / уже в очереди)");
      setState("queued");
    } catch (err) {
      setState("error");
      setMsg((err as Error).message);
    }
  };
  const text = state === "queued" ? "в очереди…" : state === "running" ? "симлю…" : state === "done" ? "✓ готово" : state === "error" ? "ошибка" : label;
  return (
    <button
      onClick={run}
      disabled={state === "queued" || state === "running"}
      title={msg ?? "Пересимить этого персонажа (предметы и тир-сет)"}
      style={{ padding: small ? "1px 8px" : "3px 10px", fontSize: small ? 11 : 12, color: state === "error" ? "var(--bad)" : state === "done" ? "var(--ok)" : undefined }}
    >
      {text}
    </button>
  );
}
