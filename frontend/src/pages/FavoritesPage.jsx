import { useEffect } from "react";

export function FavoritesPage() {
  useEffect(() => {
    document.title = "Избранное";
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Избранное</h1>
      <p className="text-neutral-500">Здесь находятся ваши избранные треки и сообщества.</p>
    </div>
  );
}
