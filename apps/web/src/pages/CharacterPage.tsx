import { useNavigate, useParams } from "react-router-dom";
import { CharacterView } from "../components/CharacterView";

export function CharacterPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const cid = Number(id);
  if (!cid) return <div className="alert bad">Некорректный id персонажа</div>;
  return (
    <div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); nav(-1); }}>← назад</a>
      </div>
      <CharacterView id={cid} layout="page" />
    </div>
  );
}
