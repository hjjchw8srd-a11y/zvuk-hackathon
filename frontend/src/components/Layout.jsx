import { useLocation, Link } from "react-router-dom";
import { Headphones, Home, ListMusic, Flame, Library, Heart, Menu, ShieldAlert } from "lucide-react";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SearchBar } from "@/components/SearchBar";
import { CommunitySwitcher } from "@/components/CommunitySwitcher";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { title: "Главная", url: "/", icon: Home },
  { title: "Плейлист", url: "/playlist", icon: ListMusic },
  { title: "Вечеринка", url: "/party", icon: Flame, badge: "LIVE" },
  { title: "Медиатека", url: "/library", icon: Library },
  { title: "Избранное", url: "/favorites", icon: Heart },
];

function RhythmLogo({ compact = false }) {
  return (
    <div className={`flex ${compact ? "h-7 w-7 rounded-lg" : "h-9 w-9 rounded-xl"} shrink-0 items-center justify-center bg-[#FDE047] shadow-xs`}>
      <svg viewBox="0 0 36 36" fill="none" className={compact ? "h-4 w-4" : "h-6 w-6"} aria-hidden="true">
        <rect x="7.5" y="13" width="3" height="10" rx="1.5" fill="#171717" />
        <rect x="12.5" y="9" width="3" height="18" rx="1.5" fill="#171717" />
        <rect x="17.5" y="6" width="3" height="24" rx="1.5" fill="#171717" />
        <rect x="22.5" y="9" width="3" height="18" rx="1.5" fill="#171717" />
        <rect x="27.5" y="13" width="3" height="10" rx="1.5" fill="#171717" />
      </svg>
    </div>
  );
}

function LayoutInner({ children }) {
  const location = useLocation();
  const { toggleSidebar } = useSidebar();
  const { user } = useAuth();

  const isPartyPage =
    location.pathname === "/party" ||
    location.pathname.startsWith("/party") ||
    location.pathname.endsWith("/party");
  const isPlaylistPage =
    !isPartyPage &&
    (location.pathname === "/playlist" ||
      location.pathname.startsWith("/playlist/") ||
      location.pathname.startsWith("/community"));
  const isLibraryPage = location.pathname === "/library";
  const isHomePage = location.pathname === "/";
  const mobileItems = user?.is_superuser
    ? [...NAV_ITEMS, { title: "Админ", url: "/superadmin", icon: ShieldAlert }]
    : NAV_ITEMS;

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 w-full min-h-screen bg-[#121212] text-white">
        <div className="md:hidden sticky top-0 z-40 bg-[#121212]/95 backdrop-blur-md border-b border-[#262626]/80 px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={toggleSidebar} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1b1b1b] border border-[#282828] text-neutral-300 hover:text-white transition-colors cursor-pointer" title="Открыть меню" aria-label="Открыть меню">
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/" className="flex items-center gap-2 select-none">
              <RhythmLogo compact />
              <span className="text-xl font-bold tracking-tight text-white flex items-baseline">ритм<span className="text-[#FDE047] text-xl font-black">.</span></span>
            </Link>
          </div>
          {isPlaylistPage && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#242016] border border-[#4a3f24] text-[#FDE047]">Плейлист</span>}
          {isPartyPage && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 flex items-center gap-1 animate-pulse"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> PARTY</span>}
        </div>

        <div className="md:hidden px-3.5 pt-2">
          {isPlaylistPage ? <div className="pb-2"><CommunitySwitcher /></div> : isHomePage ? <div className="pb-2"><SearchBar placeholder="Поиск музыки..." /></div> : null}
        </div>

        <header className={cn("hidden md:block w-full px-6 lg:px-8 z-30", isLibraryPage ? "pt-6 pb-6 bg-[#121212]" : "sticky top-0 pt-5 pb-3 bg-[#121212]/95 backdrop-blur-sm")}>
          {isPlaylistPage ? (
            <CommunitySwitcher />
          ) : isLibraryPage ? (
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#242016] border border-[#4a3f24] text-[#FDE047] text-xs font-semibold uppercase tracking-wider mb-2"><Headphones className="h-3.5 w-3.5" /><span>Студийная фонотека Volna Studio</span></div>
              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">Медиатека</h1>
              <p className="text-neutral-400 text-sm sm:text-base max-w-2xl leading-relaxed">Фирменные звуковые дорожки без авторских ограничений. Слушайте и добавляйте их в плейлисты ваших сообществ.</p>
            </div>
          ) : isHomePage ? (
            <SearchBar placeholder="Поиск музыки по названию, автору или жанру..." />
          ) : null}
        </header>

        <main className="flex-1 w-full px-3.5 sm:px-6 md:px-8 pt-2 sm:pt-4 pb-24 md:pb-8 min-w-0 transition-all duration-300">{children}</main>

        <nav aria-label="Мобильная навигация" className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#121212]/95 backdrop-blur-xl border-t border-[#262626] flex items-center justify-around h-[calc(58px+env(safe-area-inset-bottom))] px-1 pb-[env(safe-area-inset-bottom)]">
          {mobileItems.map((item) => {
            const active = item.url === "/" ? location.pathname === "/" : item.url === "/playlist" ? isPlaylistPage : item.url === "/party" ? isPartyPage : location.pathname === item.url || location.pathname.startsWith(`${item.url}/`);
            return (
              <Link key={item.title} to={item.url} className={cn("relative flex flex-col items-center justify-center flex-1 min-w-0 h-full py-1 text-center transition-colors select-none", active ? "text-[#FDE047]" : "text-neutral-400 hover:text-white")}>
                <div className="relative"><item.icon className="h-5 w-5" />{item.badge && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />}</div>
                <span className="text-[9px] sm:text-[10px] font-medium tracking-tight mt-1 truncate max-w-full px-0.5">{item.title}</span>
                {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[#FDE047]" />}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}

export default function Layout({ children }) {
  return <SidebarProvider className="bg-[#121212] text-white"><LayoutInner>{children}</LayoutInner></SidebarProvider>;
}
