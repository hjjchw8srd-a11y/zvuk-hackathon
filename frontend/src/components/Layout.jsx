import { useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SearchBar } from "@/components/SearchBar";
import { CommunitySwitcher } from "@/components/CommunitySwitcher";

export default function Layout({ children }) {
  const location = useLocation();
  const isPlaylistPage =
    location.pathname === "/playlist" ||
    location.pathname.startsWith("/playlist/") ||
    location.pathname.startsWith("/community");

  return (
    <SidebarProvider className="bg-[#121212] text-white">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 w-full min-h-screen bg-[#121212] text-white">
        {/* Верхняя шапка: на странице плейлиста переключатель сообществ, на остальных поиск */}
        <header className="sticky top-0 z-40 w-full px-8 pt-5 pb-3 bg-[#121212]/95 backdrop-blur-sm">
          {isPlaylistPage ? <CommunitySwitcher /> : <SearchBar />}
        </header>

        {/* Основное содержимое страницы */}
        <main className="flex-1 w-full px-8 pb-8 min-w-0 transition-all duration-300">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}