import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Play,
  Pause,
  Music,
  Plus,
  Search,
  Check,
  SlidersHorizontal,
  FolderPlus,
  Radio,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { audioService } from "@/lib/audioService";
import { showTrackAddedToast, showTrackAddErrorToast } from "@/lib/notifications";

export function LibraryPage() {
  const [tracks, setTracks] = useState([]);
  const [genres, setGenres] = useState(["Все жанры"]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("Все жанры");
  const [playingKey, setPlayingKey] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [targetTrack, setTargetTrack] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Загрузка треков фонотеки из базы данных через FastAPI
  const fetchLibrary = useCallback(() => {
    setIsLoading(true);
    fetch("/api/library")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          const trackList = Array.isArray(data) ? data : (data.tracks || []);
          setTracks(trackList);
          if (data.genres && Array.isArray(data.genres) && data.genres.length > 0) {
            setGenres(data.genres);
          } else {
            const dynamicGenres = ["Все жанры", ...new Set(trackList.map((t) => t.genre).filter(Boolean))];
            setGenres(dynamicGenres);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    document.title = "Медиатека · ритм.";

    fetchLibrary();
    window.addEventListener("library_updated", fetchLibrary);
    window.addEventListener("focus", fetchLibrary);

    // Загрузка сообществ пользователя для быстрого добавления треков
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch("/api/me/communities", { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          const all = [...(data.created || []), ...(data.joined || [])];
          if (all.length > 0) {
            setCommunities(all);
            return;
          }
        }
        return fetch("/api/bootstrap", { headers })
          .then((r) => (r.ok ? r.json() : null))
          .then((bData) => {
            if (bData?.communities?.length > 0) {
              setCommunities(bData.communities);
            }
          });
      })
      .catch(() => {});

    // Синхронизация состояния плеера
    const unsub = audioService.subscribe((state) => {
      if (state.isPlaying && state.track) {
        setPlayingKey(state.track.library_key || state.track.key);
      } else {
        setPlayingKey(null);
      }
    });

    return () => {
      unsub();
      window.removeEventListener("library_updated", fetchLibrary);
      window.removeEventListener("focus", fetchLibrary);
    };
  }, [fetchLibrary]);

  const handlePlayToggle = (track) => {
    if (playingKey === track.key) {
      audioService.pause();
      setPlayingKey(null);
    } else {
      audioService.play({
        id: `lib-${track.key}`,
        key: track.key,
        library_key: track.key,
        title: track.title,
        artist: track.artist,
        duration_seconds: track.duration_seconds,
      });
      setPlayingKey(track.key);
    }
  };

  const handleOpenAddModal = (track) => {
    setTargetTrack(track);
    setIsAddOpen(true);
  };

  const handleAddToCommunity = async (roomId, roomName) => {
    if (!targetTrack) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/communities/${roomId}/tracks/library`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          key: targetTrack.key,
          library_key: targetTrack.key,
        }),
      });

      if (res.ok) {
        showTrackAddedToast(roomName);
        setIsAddOpen(false);
      } else {
        showTrackAddErrorToast(roomName);
      }
    } catch {
      showTrackAddErrorToast(roomName);
    }
  };

  const filtered = tracks.filter((t) => {
    const matchesSearch =
      !search.trim() ||
      (t.title && t.title.toLowerCase().includes(search.toLowerCase())) ||
      (t.artist && t.artist.toLowerCase().includes(search.toLowerCase())) ||
      (t.description && t.description.toLowerCase().includes(search.toLowerCase()));
    const matchesGenre = selectedGenre === "Все жанры" || t.genre === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  return (
    <div className="w-full text-white space-y-6 pb-24">
      {/* Поиск и фильтры по жанрам */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
          <div className="relative w-full sm:w-96 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию или описанию..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#171717] border border-[#262626] text-base sm:text-sm text-white placeholder-neutral-500 outline-none focus:border-[#FDE047] transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full scrollbar-none pb-1">
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGenre(g)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0",
                  selectedGenre === g
                    ? "bg-[#282216] border border-[#443820] text-[#FDE047]"
                    : "bg-[#171717] border border-[#262626] text-neutral-400 hover:text-white"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Индикатор загрузки */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FDE047] border-t-transparent mb-3" />
          <p className="text-xs">Загрузка треков из базы данных...</p>
        </div>
      ) : (
        /* Сетка треков */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
          {filtered.map((track) => {
            const isPlaying = playingKey === track.key;
            return (
              <div
                key={track.key}
                className={cn(
                  "rounded-2xl border p-4 sm:p-5 flex flex-col justify-between transition-all group bg-[#171717]",
                  isPlaying
                    ? "border-[#443820] shadow-lg shadow-[#FDE047]/10 bg-gradient-to-b from-[#262116] to-[#171717]"
                    : "border-[#262626] hover:border-neutral-700"
                )}
              >
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between">
                    {/* Обложка с кнопкой Play */}
                    <div
                      onClick={() => handlePlayToggle(track)}
                      className={cn(
                        "relative h-14 w-14 sm:h-16 sm:w-16 rounded-xl sm:rounded-2xl bg-gradient-to-br flex items-center justify-center cursor-pointer shadow-md overflow-hidden shrink-0 group/cover",
                        track.gradient || "from-violet-600 to-purple-800"
                      )}
                    >
                      <Music className="h-6 w-6 sm:h-7 sm:w-7 text-white/50 group-hover/cover:scale-90 transition-transform" />
                      <div
                        className={cn(
                          "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
                          isPlaying ? "opacity-100" : "opacity-90 sm:opacity-0 sm:group-hover/cover:opacity-100"
                        )}
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5 sm:h-6 sm:w-6 text-[#FDE047] fill-[#FDE047]" />
                        ) : (
                          <Play className="h-5 w-5 sm:h-6 sm:w-6 text-white fill-white ml-0.5" />
                        )}
                      </div>
                    </div>

                    {/* Бейдж жанра и длительность */}
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#242016] border border-[#4a3f24] text-[#FDE047]">
                        {track.genre}
                      </span>
                      <span className="text-xs text-neutral-500 tabular-nums font-mono">
                        {track.duration || `${Math.floor((track.duration_seconds || 0) / 60)}:${String((track.duration_seconds || 0) % 60).padStart(2, "0")}`}
                      </span>
                    </div>
                  </div>

                  {/* Инфо о треке */}
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-[#FDE047] transition-colors truncate">
                      {track.title}
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5 truncate">{track.artist}</p>
                    <p className="text-xs text-neutral-500 mt-1.5 sm:mt-2 line-clamp-2 leading-relaxed">
                      {track.description}
                    </p>
                  </div>
                </div>

                {/* Нижняя панель действий */}
                <div className="pt-3.5 mt-3.5 sm:pt-4 sm:mt-4 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handlePlayToggle(track)}
                    className={cn(
                      "flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer",
                      isPlaying
                        ? "bg-[#282216] text-[#FDE047]"
                        : "bg-[#202020] text-neutral-300 hover:text-white"
                    )}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="h-3.5 w-3.5" />
                        <span>Пауза</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        <span>Слушать</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenAddModal(track)}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg bg-[#282216] border border-[#443820] text-[#FDE047] text-xs font-semibold hover:bg-[#342b1b] transition-colors cursor-pointer whitespace-nowrap"
                    title="Добавить в плейлист комнаты"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    <span>В плейлист</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 rounded-2xl bg-[#171717] border border-[#262626]">
          <Music className="h-10 w-10 text-neutral-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">Треки не найдены</h3>
          <p className="text-xs text-neutral-500 mt-1">
            Попробуйте изменить поисковый запрос или выбрать другой жанр.
          </p>
        </div>
      )}

      {/* Модальное окно выбора сообщества для добавления */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[440px] bg-[#171717] border-[#262626] text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#282216] border border-[#443820] text-[#FDE047]">
            <FolderPlus className="h-5 w-5" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#FDE047] m-0">
            ДОБАВЛЕНИЕ В ОЧЕРЕДЬ
          </p>
          <DialogTitle className="text-xl font-bold text-white m-0">
            В какое сообщество добавить?
          </DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-neutral-400 m-0">
              Вы добавляете композицию «{targetTrack?.title}». Выберите комнату для отправки в плейлист:
            </p>
          </DialogDescription>

          <div className="flex flex-col gap-2 mt-3 max-h-60 overflow-y-auto">
            {communities.length > 0 ? (
              communities.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleAddToCommunity(c.id, c.name)}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#202020] border border-neutral-800 hover:border-[#443820] hover:bg-[#282216] transition-all text-left group cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white group-hover:text-[#FDE047] transition-colors truncate">
                      {c.name}
                    </div>
                    <div className="text-xs text-neutral-500">
                      Код: {c.invite_code || "ZVUK26"}
                    </div>
                  </div>
                  <Plus className="h-4 w-4 text-neutral-400 group-hover:text-[#FDE047] transition-colors shrink-0" />
                </button>
              ))
            ) : (
              <div className="p-4 rounded-xl bg-[#202020] text-center text-xs text-neutral-400">
                У вас пока нет комнат. Создайте первое сообщество на главной странице.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LibraryPage;
