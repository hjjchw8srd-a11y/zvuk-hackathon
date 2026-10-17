import { useLocation, Link } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CommunitySwitcher } from "@/components/CommunitySwitcher";
import { useAuth } from "@/lib/auth";
import { Home, Flame, Library, ShieldAlert, LogOut } from "lucide-react";

export default function Layout({ children }) {
  const location = useLocation();
  const { user, logout } = useAuth();

  const isPlaylistPage =
    location.pathname === "/playlist" ||
    location.pathname.startsWith("/playlist/") ||
    location.pathname.startsWith("/community") ||
    location.pathname === "/party" ||
    location.pathname.startsWith("/party");

  return (
    <SidebarProvider className="bg-[#121212] text-white">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 w-full min-h-screen bg-[#121212] text-white">
        {/* Верхняя шапка: на странице плейлиста переключатель сообществ, SearchBar удален */}
        {isPlaylistPage && (
          <header className="sticky top-0 z-40 w-full px-4 sm:px-8 pt-4 pb-3 bg-[#121212]/95 backdrop-blur-sm">
            <CommunitySwitcher />
          </header>
        )}

        {/* Основное содержимое страницы с отступом под мобильную нижнюю панель */}
        <main className="flex-1 w-full px-4 sm:px-8 pb-24 md:pb-8 pt-4 min-w-0 transition-all duration-300">
          {children}
        </main>

        {/* Мобильная нижняя панель навигации (md:hidden) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 flex items-center justify-around py-2.5 px-2 text-[11px] text-zinc-400">
          <Link
            to="/"
            className={`flex flex-col items-center gap-1 transition-colors ${
              location.pathname === "/" ? "text-white font-semibold" : "hover:text-white"
            }`}
          >
            <Home className="w-5 h-5" />
            <span>Комнаты</span>
          </Link>

          <Link
            to="/party"
            className={`flex flex-col items-center gap-1 transition-colors ${
              location.pathname.startsWith("/party")
                ? "text-orange-400 font-semibold"
                : "text-zinc-400 hover:text-orange-300"
            }`}
          >
            <Flame className="w-5 h-5" />
            <span>Вечеринка</span>
          </Link>

          <Link
            to="/library"
            className={`flex flex-col items-center gap-1 transition-colors ${
              location.pathname === "/library" ? "text-white font-semibold" : "hover:text-white"
            }`}
          >
            <Library className="w-5 h-5" />
            <span>Библиотека</span>
          </Link>

          {user?.is_superuser && (
            <Link
              to="/superadmin"
              className={`flex flex-col items-center gap-1 transition-colors ${
                location.pathname === "/superadmin"
                  ? "text-purple-400 font-semibold"
                  : "text-zinc-400 hover:text-purple-300"
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
              <span>Админ</span>
            </Link>
          )}

          <button
            onClick={logout}
            className="flex flex-col items-center gap-1 text-zinc-400 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Выход</span>
          </button>
        </nav>
      </div>
    </SidebarProvider>
  );
}