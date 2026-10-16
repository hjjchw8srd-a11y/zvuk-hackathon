import { useEffect } from "react";

export function PlaylistPage() {
  useEffect(() => {
    document.title = "Плейлист";
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Плейлист</h1>
      <p className="text-neutral-500">Здесь находятся ваши плейлисты.</p>
    </div>
  );
}
