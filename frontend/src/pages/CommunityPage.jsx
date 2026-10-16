import { useEffect } from "react";
import { useParams } from "react-router-dom";

export function CommunityPage() {
  const { id } = useParams();

  useEffect(() => {
    document.title = `Сообщество ${id || ""}`;
  }, [id]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Сообщество</h1>
      <p className="text-neutral-500">Страница сообщества #{id}</p>
    </div>
  );
}
