import { useEffect } from "react";

export function MainPage() {
  useEffect(() => {
    document.title = "Главная страница";
  }, []);

  return <div>Тест</div>;
}
