import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Users, ChevronRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export function CommunitySwitcher() {
  const location = useLocation();
  const navigate = useNavigate();
  const [communities, setCommunities] = useState([]);

  const loadCommunities = useCallback(() => {
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
              }))
            );
            return;
          }
        }
        return fetch("/api/bootstrap", { headers })
          .then((res) => (res.ok ? res.json() : null))
          .then((bData) => {
            if (bData?.communities?.length > 0) {
              setCommunities(
                bData.communities.map((c) => ({
                  id: c.id,
                  name: c.name,
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
    loadCommunities();
    window.addEventListener("communities_updated", loadCommunities);
    return () => {
      window.removeEventListener("communities_updated", loadCommunities);
    };
  }, [loadCommunities]);

  // Отображать переключатель только ЕСЛИ сообществ больше одного
  if (communities.length <= 1) {
    return null;
  }

  // Определяем активное сообщество по URL
  const currentPath = location.pathname;
  const activeId = communities.find((c) => currentPath === `/community/${c.id}`)?.id || communities[0]?.id;

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
      <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium shrink-0 mr-1">
        <Layers className="h-4 w-4 text-[#FDE047]" />
        <span>Сообщества:</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {communities.map((comm) => {
          const isActive = comm.id === activeId;
          return (
            <button
              key={comm.id}
              type="button"
              onClick={() => navigate(`/community/${comm.id}`)}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs transition-all cursor-pointer border",
                isActive
                  ? "bg-[#242016] border-[#4a3f24] text-[#FDE047] font-bold shadow-sm shadow-[#FDE047]/10"
                  : "bg-[#171717] border-[#262626] text-neutral-400 hover:text-white hover:border-neutral-700 font-medium"
              )}
            >
              <Users className={cn("h-3.5 w-3.5", isActive ? "text-[#FDE047]" : "text-neutral-500")} />
              <span className="truncate max-w-[140px] sm:max-w-[200px]">{comm.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
