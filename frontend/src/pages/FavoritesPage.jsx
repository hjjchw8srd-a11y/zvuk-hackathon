import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Heart,
  Music,
  Play,
  Pause,
  Trash2,
  Users,
  ArrowRight,
  Sparkles,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { audioService } from "@/lib/audioService";

export function FavoritesPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("tracks"); // "tracks" | "communities"
  const [favorites, setFavorites] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [toast, setToast] = useState(null);

  const fetchFavorites = () => {
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch("/api/me/favorites", { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.favorites) {
          setFavorites(data.favorites);
        } else {
          // Запасной запрос в /api/me/tracks
          fetch("/api/me/tracks", { headers })
            .then((r) => (r.ok ? r.json() : null))
            .then((tData) => {
              if (tData?.tracks) {
                setFavorites(tData.tracks);
              }
            });
        }
      })
      .catch(() => {});
  };

  const fetchCommunities = () => {
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch("/api/me/communities", { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          const all = [...(data.created || []), ...(data.joined || [])];
          setCommunities(all);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    document.title = "Избранное · ритм.";
    fetchFavorites();
    fetchCommunities();

    const unsub = audioService.subscribe((state) => {
      if (state.isPlaying && state.track) {
        setPlayingId(state.track.id);
      } else {
        setPlayingId(null);
      }
    });

    return () => unsub();
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handlePlayToggle = (track) => {
    if (playingId === track.id) {
      audioService.pause();
      setPlayingId(null);
    } else {
      audioService.play({
        id: track.id,
        title: track.title,
        artist: track.artist,
        room_id: track.room_id,
        source_type: track.source_type,
        library_key: track.library_key || "dawn",
        duration_seconds: track.duration_seconds || 45,
      });
      setPlayingId(track.id);
    }
  };

  const handleRemoveFavorite = async (track) => {
    setFavorites((prev) => prev.filter((t) => t.id !== track.id));
    showToast(`Трек «${track.title}» удалён из избранного`);

    if (track.room_id) {
      try {
        const token = localStorage.getItem("token");
        await fetch(`/api/communities/${track.room_id}/tracks/${track.id}/favorite`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ value: false }),
        });
      } catch {}
    }
  };

  const fmtDuration = (sec) => {
    if (!sec) return "0:45";
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  const grads = [
    "from-violet-600 to-purple-800",
    "from-pink-500 to-rose-700",
    "from-sky-400 to-cyan-600",
    "from-emerald-400 to-teal-600",
    "from-amber-400 to-orange-600",
  ];

  return (
    <div className="w-full text-white space-y-8 pb-24">
      {/* Тост */}
      {toast && (
        <div className="fixed top-5 right-5 z-[200] bg-[#1a1a1a] border border-[#443820] text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          <span>{toast}</span>
        </div>
      )}

      {/* Заголовок */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#242016] border border-[#4a3f24] text-[#FDE047] text-xs font-semibold uppercase tracking-wider">
          <Heart className="h-3.5 w-3.5 fill-[#FDE047]" />
          <span>Ваша коллекция</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
          Избранное
        </h1>
        <p className="text-neutral-400 text-sm sm:text-base max-w-2xl leading-relaxed">
          Всё, что вы отметили сердечком во время прослушивания, и сообщества, в которых вы участвуете.
        </p>
      </div>

      {/* Вкладки: Треки и Сообщества */}
      <div className="flex w-full sm:w-fit bg-[#171717] border border-[#262626] rounded-xl p-1 gap-1">
        <button
          onClick={() => setActiveTab("tracks")}
          className={cn(
            "flex-1 sm:flex-initial px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2",
            activeTab === "tracks"
              ? "bg-[#262626] text-white"
              : "text-neutral-400 hover:text-white"
          )}
        >
          <Music className="h-4 w-4 text-[#FDE047] shrink-0" />
          <span>Треки ({favorites.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("communities")}
          className={cn(
            "flex-1 sm:flex-initial px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2",
            activeTab === "communities"
              ? "bg-[#262626] text-white"
              : "text-neutral-400 hover:text-white"
          )}
        >
          <Users className="h-4 w-4 text-[#FDE047] shrink-0" />
          <span>Сообщества ({communities.length})</span>
        </button>
      </div>

      {/* Вкладка 1: Избранные треки */}
      {activeTab === "tracks" && (
        <div className="space-y-3">
          {favorites.length > 0 ? (
            <div className="flex flex-col gap-2">
              {favorites.map((track, idx) => {
                const isPlaying = playingId === track.id;
                const grad = grads[idx % grads.length];
                return (
                  <div
                    key={track.id}
                    className={cn(
                      "flex items-center justify-between gap-2.5 sm:gap-3 p-2.5 sm:p-4 rounded-xl border transition-all bg-[#171717]",
                      isPlaying
                        ? "border-[#443820] bg-[#242016]/90 shadow-md"
                        : "border-[#262626] hover:border-neutral-700"
                    )}
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                      {/* Обложка с Play */}
                      <div
                        onClick={() => handlePlayToggle(track)}
                        className={cn(
                          "relative h-10 w-10 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-gradient-to-br flex items-center justify-center cursor-pointer shadow-sm overflow-hidden shrink-0 group/cover",
                          grad
                        )}
                      >
                        <Music className="h-4 w-4 sm:h-5 sm:w-5 text-white/50" />
                        <div
                          className={cn(
                            "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
                            isPlaying ? "opacity-100" : "opacity-90 sm:opacity-0 sm:group-hover/cover:opacity-100"
                          )}
                        >
                          {isPlaying ? (
                            <Pause className="h-4 w-4 sm:h-5 sm:w-5 text-[#FDE047] fill-[#FDE047]" />
                          ) : (
                            <Play className="h-4 w-4 sm:h-5 sm:w-5 text-white fill-white ml-0.5" />
                          )}
                        </div>
                      </div>

                      {/* Текст */}
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "text-xs sm:text-sm font-bold truncate",
                            isPlaying ? "text-[#FDE047]" : "text-white"
                          )}
                        >
                          {track.title}
                        </div>
                        <div className="text-[11px] sm:text-xs text-neutral-400 truncate">
                          {track.artist}
                        </div>
                        {track.room_name && (
                          <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-0.5 truncate">
                            Из комнаты: <span className="text-neutral-400">{track.room_name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-neutral-500 tabular-nums font-mono hidden sm:block">
                        {fmtDuration(track.duration_seconds)}
                      </span>

                      {track.room_id && (
                        <Link
                          to={`/community/${track.room_id}`}
                          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                          title="Перейти в комнату"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveFavorite(track)}
                        className="p-2 rounded-lg text-rose-500 hover:text-rose-400 hover:bg-rose-950/20 transition-colors cursor-pointer"
                        title="Удалить из избранного"
                      >
                        <Heart className="h-4 w-4 fill-rose-500" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 rounded-2xl bg-[#171717] border border-[#262626] space-y-3">
              <Heart className="h-10 w-10 text-neutral-600 mx-auto" />
              <h3 className="text-base font-bold text-white">Список избранного пуст</h3>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Нажимайте на сердечко рядом с любимыми треками в плейлистах сообществ, чтобы они сохранились здесь.
              </p>
              <div className="pt-2">
                <Link
                  to="/library"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#282216] border border-[#443820] text-[#FDE047] text-xs font-bold hover:bg-[#342b1b] transition-colors"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Открыть медиатеку</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Вкладка 2: Сообщества */}
      {activeTab === "communities" && (
        <div className="space-y-4">
          {communities.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
              {communities.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl bg-[#171717] border border-[#262626] p-4 sm:p-5 flex flex-col justify-between hover:border-neutral-700 transition-all group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#282216] border border-[#443820] text-[#FDE047]">
                        <Users className="h-5 w-5" />
                      </div>
                      <span className="text-xs text-neutral-400 font-mono bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                        {c.invite_code || "ZVUK26"}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-white group-hover:text-[#FDE047] transition-colors truncate">
                        {c.name}
                      </h3>
                      <p className="text-xs text-neutral-400 mt-1">
                        {c.member_count ? `${c.member_count} участников` : "Совместный плейлист"}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-neutral-800/80">
                    <button
                      type="button"
                      onClick={() => navigate(`/community/${c.id}`)}
                      className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#202020] hover:bg-[#282216] hover:text-[#FDE047] text-xs font-bold text-neutral-200 transition-colors cursor-pointer"
                    >
                      <span>Открыть комнату</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 rounded-2xl bg-[#171717] border border-[#262626] space-y-3">
              <Users className="h-10 w-10 text-neutral-600 mx-auto" />
              <h3 className="text-base font-bold text-white">Вы пока не состоите в сообществах</h3>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Создайте собственную комнату или вступите по коду от друзей на главной странице.
              </p>
              <div className="pt-2">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#282216] border border-[#443820] text-[#FDE047] text-xs font-bold hover:bg-[#342b1b] transition-colors"
                >
                  <ArrowRight className="h-4 w-4" />
                  <span>На главную страницу</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FavoritesPage;
