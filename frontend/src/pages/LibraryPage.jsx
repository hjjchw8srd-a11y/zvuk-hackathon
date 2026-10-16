import { useEffect } from "react";

export function LibraryPage() {
  useEffect(() => {
    document.title = "Медиатека";
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Медиатека</h1>
      <p className="text-neutral-500">Здесь находится ваша медиатека.</p>
    </div>
  );
}
