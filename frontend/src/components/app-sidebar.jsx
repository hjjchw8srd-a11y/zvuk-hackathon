import { useState, useEffect, useCallback } from "react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Home,
  ListMusic,
  Library,
  Heart,
  Plus,
  Trash2,
  Users,
  KeyRound,
  Headphones,
  ArrowRight,
  LogOut,
  User as UserIcon,
  Flame,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Popup } from "./Popup";
import { useAuth } from "@/lib/auth";

const items = [
  { title: "Главная", url: "/", icon: Home },
  { title: "Плейлист", url: "/playlist", icon: ListMusic },
  { title: "Вечеринка", url: "/party", icon: Flame, badge: "LIVE" },
  { title: "Медиатека", url: "/library", icon: Library },
  { title: "Избранное", url: "/favorites", icon: Heart },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const { open } = useSidebar();
  const { user, isAuthenticated, logout } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  // Загрузка реальных сообществ из бэкенда
  const fetchCommunities = useCallback(() => {
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch("/api/me/communities", { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          const all = [...(data.created || []), ...(data.joined || [])];
          if (all.length > 0) {
            setCommunities(
              all.map((c) => ({
                id: c.id,
                name: c.name,
                url: `/community/${c.id}`,
              }))
            );
            return;
          }
        }
        // Запасной запрос в /api/bootstrap
        return fetch("/api/bootstrap", { headers })
          .then((res) => (res.ok ? res.json() : null))
          .then((bData) => {
            if (bData?.communities?.length > 0) {
              setCommunities(
                bData.communities.map((c) => ({
                  id: c.id,
                  name: c.name,
                  url: `/community/${c.id}`,
                }))
              );
            } else {
              setCommunities([]);
            }
          });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCommunities();
    window.addEventListener("communities_updated", fetchCommunities);
    return () => {
      window.removeEventListener("communities_updated", fetchCommunities);
    };
  }, [fetchCommunities, user]);

  const handleCreateCommunity = async (communityName) => {
    try {
      const token = localStorage.getItem("token");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch("/api/communities", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: communityName }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          localStorage.setItem("token", data.access_token);
        }
        window.dispatchEvent(new Event("communities_updated"));
        navigate(`/community/${data.id}`);
        return;
      }
    } catch {}

    navigate("/playlist");
  };

  const handleRemoveCommunity = async (idToRemove) => {
    setCommunities((prev) => prev.filter((item) => item.id !== idToRemove));

    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await fetch(`/api/communities/${idToRemove}`, {
        method: "DELETE",
        headers,
      });
    } catch {}

    window.dispatchEvent(new Event("communities_updated"));

    if (window.location.pathname === `/community/${idToRemove}`) {
      navigate("/playlist");
    }
  };

  const handleJoinByCode = async (inviteCode) => {
    try {
      const token = localStorage.getItem("token");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch("/api/join", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: inviteCode.trim().toUpperCase() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          localStorage.setItem("token", data.access_token);
        }
        window.dispatchEvent(new Event("communities_updated"));
        navigate(`/community/${data.id}`);
        return;
      }
    } catch {}
    navigate("/playlist");
  };

  return (
    <Sidebar>
      {/* Самый верхний уровень: Логотип сайта и кнопка сворачивания */}
      <SidebarHeader
        className={cn(
          "border-b border-[#262626]/60 p-3 transition-all",
          open
            ? "flex-row items-center justify-between"
            : "flex-col items-center justify-center gap-3 px-2 py-3"
        )}
        style={{
          display: "flex",
          justifyContent: open ? "space-between" : "center",
          alignItems: "center",
        }}
      >
        {open ? (
          <>
            <Link
              to="/"
              className="flex items-center gap-3 px-2 py-1 rounded-xl transition-colors hover:bg-neutral-800/50 select-none min-w-0"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#a3e635] shadow-xs">
                <svg
                  viewBox="0 0 36 36"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                >
                  <rect x="7.5" y="13" width="3" height="10" rx="1.5" fill="#171717" />
                  <rect x="12.5" y="9" width="3" height="18" rx="1.5" fill="#171717" />
                  <rect x="17.5" y="6" width="3" height="24" rx="1.5" fill="#171717" />
                  <rect x="22.5" y="9" width="3" height="18" rx="1.5" fill="#171717" />
                  <rect x="27.5" y="13" width="3" height="10" rx="1.5" fill="#171717" />
                </svg>
              </div>
              <span className="text-2xl font-bold tracking-tight text-white flex items-baseline truncate">
                ритм<span className="text-[#a3e635] text-2xl font-black">.</span>
              </span>
            </Link>
            <SidebarTrigger />
          </>
        ) : (
          <>
            <SidebarTrigger />
            <Link
              to="/"
              title="ритм."
              className="flex items-center justify-center rounded-xl transition-colors hover:bg-neutral-800/50 select-none p-1"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#a3e635] shadow-xs">
                <svg
                  viewBox="0 0 36 36"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                >
                  <rect x="7.5" y="13" width="3" height="10" rx="1.5" fill="#171717" />
                  <rect x="12.5" y="9" width="3" height="18" rx="1.5" fill="#171717" />
                  <rect x="17.5" y="6" width="3" height="24" rx="1.5" fill="#171717" />
                  <rect x="22.5" y="9" width="3" height="18" rx="1.5" fill="#171717" />
                  <rect x="27.5" y="13" width="3" height="10" rx="1.5" fill="#171717" />
                </svg>
              </div>
            </Link>
          </>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {open && <SidebarGroupLabel>Музыка</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link to={item.url} title={item.title} className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <item.icon className={item.badge ? "text-orange-400" : ""} />
                        {open && <span>{item.title}</span>}
                      </div>
                      {open && item.badge && (
                        <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Разделительная черта */}
        <SidebarSeparator />

        {/* Твои сообщества */}
        <SidebarGroup>
          {open ? (
            <div className="flex items-center justify-between pr-2 mb-1">
              <SidebarGroupLabel>Твои сообщества</SidebarGroupLabel>
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-[#262626] hover:text-white transition-colors cursor-pointer"
                title="Добавить сообщество"
                aria-label="Добавить сообщество"
              >
                <Plus className="h-4 w-4" />
                <span className="sr-only">+</span>
              </button>
            </div>
          ) : (
            <div className="flex justify-center mb-1 w-full">
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-[#262626] hover:text-white transition-colors cursor-pointer"
                title="Добавить сообщество"
                aria-label="Добавить сообщество"
              >
                <Plus className="h-5 w-5" />
                <span className="sr-only">+</span>
              </button>
            </div>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {communities.map((community) => (
                <SidebarMenuItem key={community.id} className="group relative">
                  <SidebarMenuButton asChild className={cn(open ? "pr-8" : "justify-center px-0")}>
                    <Link to={community.url} title={community.name}>
                      <Users className="h-4 w-4 shrink-0" />
                      {open && <span className="truncate">{community.name}</span>}
                    </Link>
                  </SidebarMenuButton>
                  {open && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveCommunity(community.id);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded text-neutral-400 opacity-0 group-hover:opacity-100 hover:bg-[#333] hover:text-red-400 transition-opacity transition-colors cursor-pointer"
                      title="Удалить сообщество"
                      aria-label="Удалить сообщество"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sr-only">Удалить</span>
                    </button>
                  )}
                </SidebarMenuItem>
              ))}

              {/* Кнопка "Вступить по коду" */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setIsJoinOpen(true)}
                  className={cn("text-neutral-400 hover:text-white", !open && "justify-center px-0")}
                  title="Вступить по коду"
                >
                  <KeyRound className="h-4 w-4 shrink-0" />
                  {open && <span>Вступить по коду</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Самый нижний уровень */}
      <SidebarFooter className="border-t border-[#262626]/60 p-2 mt-auto flex flex-col gap-2 transition-all duration-300">
        {/* Профиль пользователя или кнопка авторизации */}
        {isAuthenticated && user ? (
          <div
            className={cn(
              "flex items-center justify-between rounded-2xl bg-[#191919] border border-[#262626] p-2 transition-all",
              open ? "w-full" : "w-[50px] h-[50px] justify-center p-0 mx-auto"
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#262626] text-[#a3e635] font-bold border border-[#333] overflow-hidden">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.display_name || "Аватар"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (user.display_name || "U")[0].toUpperCase()
                )}
              </div>
              {open && (
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">
                    {user.display_name || "Слушатель"}
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate">
                    {user.email || "Гость"}
                  </div>
                </div>
              )}
            </div>
            {open && (
              <button
                type="button"
                onClick={logout}
                title="Выйти из аккаунта"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:text-red-400 hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span className="sr-only">Выйти</span>
              </button>
            )}
          </div>
        ) : (
          <Link
            to="/register"
            title="Войти или зарегистрироваться"
            className={cn(
              "rounded-2xl bg-[#1e281f] border border-[#2e402d] text-[#a3e635] flex items-center hover:bg-[#263527] transition-all cursor-pointer group",
              open
                ? "w-full h-11 px-3 gap-2.5 justify-start text-xs font-bold"
                : "w-[50px] h-[50px] p-0 justify-center mx-auto"
            )}
          >
            <UserIcon className="h-4 w-4 shrink-0" />
            {open && <span>Войти / Регистрация</span>}
          </Link>
        )}

        <button
          type="button"
          onClick={() => setIsInviteOpen(true)}
          title="Музыка лучше вместе — Пригласи друзей"
          className={cn(
            "rounded-2xl bg-[#1c231d] border border-[#2b392d] flex items-center text-left hover:bg-[#232e25] transition-all duration-300 ease-in-out cursor-pointer group overflow-hidden",
            open
              ? "w-full h-[70px] p-2 gap-3"
              : "w-[50px] h-[50px] p-0 gap-0 justify-center mx-auto"
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#293d2c] text-[#a3e635]">
            <Headphones className="h-5 w-5" />
          </div>
          <div
            className={cn(
              "transition-all duration-300 ease-in-out overflow-hidden shrink-0",
              open ? "w-[160px] opacity-100" : "w-0 opacity-0 pointer-events-none"
            )}
          >
            <div className="w-[160px]">
              <div className="text-sm font-bold text-white leading-tight truncate">
                Музыка лучше вместе
              </div>
              <div className="text-xs text-neutral-400 leading-snug mt-0.5 line-clamp-2">
                Пригласи друзей и выбирайте, что слушать
              </div>
            </div>
          </div>
        </button>
      </SidebarFooter>

      {/* Единый компонент всплывающих окон (popup) */}
      <Popup
        type="create"
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreateCommunity={handleCreateCommunity}
      />

      <Popup
        type="join"
        open={isJoinOpen}
        onOpenChange={setIsJoinOpen}
        onJoinByCode={handleJoinByCode}
      />

      <Popup
        type="invite"
        open={isInviteOpen}
        onOpenChange={setIsInviteOpen}
      />
    </Sidebar>
  );
}