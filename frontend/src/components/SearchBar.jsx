import { useState, useRef, useEffect, useCallback } from "react";
import {
  Search,
  X,
  Play,
  Pause,
  Plus,
  Check,
  Music,
  Sparkles,
  Loader2,
  Users,
  Radio,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { audioService } from "@/lib/audioService";
import { showTrackAddedToast, showTrackAddErrorToast } from "@/lib/notifications";

const SUGGESTED_QUERIES = [
  "Bustin Loose",
  "90 Seconds Of Funk",
  "Audionautix",
  "Первые лучи",
  "Рок",
  "Хаус",
  "Синтвейв",
  "Лоу-фай",
];

export function SearchBar({
  value,
  onChange,
  onSearch,
  placeholder = "Поиск музыки (нечеткий поиск с опечатками)...",
  className,
  ...props
}) {
  const [internalValue, setInternalValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [playingTrackKey, setPlayingTrackKey] = useState(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Add to community playlist state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const query = value !== undefined ? value : internalValue;

  // Sync playback state with audioService
  useEffect(() => {
    const unsub = audioService.subscribe((state) => {
      setIsPlayingAudio(state.isPlaying);
      if (state.isPlaying && state.track) {
        setPlayingTrackKey(state.track.library_key || state.track.key || state.track.id);
      } else {
        setPlayingTrackKey(null);
      }
    });
    return () => unsub();
  }, []);

  // Fetch user communities for adding tracks
  const loadCommunities = useCallback(async () => {
    setIsLoadingCommunities(true);
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch("/api/me/communities", { headers });
      if (res.ok) {
        const data = await res.json();
        const all = [...(data.created || []), ...(data.joined || [])];
        if (all.length > 0) {
          setCommunities(all);
          setIsLoadingCommunities(false);
          return;
        }
      }
      const bRes = await fetch("/api/bootstrap", { headers });
      if (bRes.ok) {
        const bData = await bRes.json();
        if (bData?.communities?.length > 0) {
          setCommunities(bData.communities);
        }
      }
    } catch {
    } finally {
      setIsLoadingCommunities(false);
    }
  }, []);

  // Perform fuzzy search using PostgreSQL pg_trgm
  const performSearch = useCallback((searchTerm) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const trimmed = (searchTerm || "").trim();
    setIsLoading(true);

    const url = trimmed
      ? `/api/tracks/search?q=${encodeURIComponent(trimmed)}&limit=15`
      : `/api/tracks/search?limit=8`;

    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tracks) {
          setResults(data.tracks);
        } else {
          setResults([]);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setResults([]);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Debounced search on input change
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (isOpen) {
        performSearch(query);
      }
    }, 240);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, isOpen, performSearch]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    if (value === undefined) setInternalValue(val);
    onChange?.(val);
    setIsOpen(true);
  };

  const handleClear = () => {
    if (value === undefined) setInternalValue("");
    onChange?.("");
    inputRef.current?.focus();
    performSearch("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      onSearch?.(query);
      performSearch(query);
      setIsOpen(true);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setIsOpen(true);
    performSearch(query);
  };

  const handleSelectQuery = (suggested) => {
    if (value === undefined) setInternalValue(suggested);
    onChange?.(suggested);
    performSearch(suggested);
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleTogglePlay = (track, e) => {
    e?.stopPropagation();
    const trackKey = track.key || track.library_key || track.id;
    if (playingTrackKey === trackKey && isPlayingAudio) {
      audioService.pause();
    } else {
      audioService.play({
        id: track.id || `lib-${track.key}`,
        key: track.key,
        library_key: track.key || track.library_key,
        title: track.title,
        artist: track.artist,
        genre: track.genre,
        duration_seconds: track.duration_seconds,
        audio_url: track.audio_url,
        file: track.file,
        source_type: track.source_type || "library",
      });
    }
  };

  const handleOpenAddModal = (track, e) => {
    e?.stopPropagation();
    setSelectedTrack(track);
    loadCommunities();
    setIsAddModalOpen(true);
  };

  const handleAddToCommunity = async (community) => {
    if (!selectedTrack) return;
    setIsAdding(true);
    try {
      const token = localStorage.getItem("token");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const key = selectedTrack.key || selectedTrack.library_key;
      const res = await fetch(`/api/communities/${community.id}/tracks/library`, {
        method: "POST",
        headers,
        body: JSON.stringify({ key, library_key: key }),
      });
      if (res.ok) {
        showTrackAddedToast(community.name);
        setIsAddModalOpen(false);
        window.dispatchEvent(new Event("communities_updated"));
      } else {
        showTrackAddErrorToast(community.name);
      }
    } catch {
      showTrackAddErrorToast(community.name);
    } finally {
      setIsAdding(false);
    }
  };

  const isCentered = !isFocused && !query;

  return (
    <div ref={containerRef} className="relative w-full">

      {/* Поисковая строка */}
      <div
        role="search"
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "relative flex items-center w-full h-11 rounded-full bg-[#1a1a1a] hover:bg-[#222222] focus-within:bg-[#222222] transition-all px-4 cursor-text select-none border border-transparent focus-within:border-neutral-700/80 shadow-xs",
          isOpen && "ring-1 ring-[#FDE047]/40 bg-[#222222]",
          className
        )}
        {...props}
      >
        {/* По центру в неактивном состоянии (когда поле пустое и нет фокуса) */}
        {isCentered && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 pointer-events-none text-neutral-300 text-sm px-4">
            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            <span className="font-normal truncate">{placeholder}</span>
          </div>
        )}

        {/* Иконка слева в активном состоянии (фокус или введен текст) */}
        {!isCentered && (
          <div className="mr-2.5 flex items-center pointer-events-none">
            {isLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 text-[#FDE047] animate-spin" />
            ) : (
              <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            )}
          </div>
        )}

        {/* Поле ввода */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={isCentered ? "" : placeholder}
          className={cn(
            "w-full h-full bg-transparent text-white text-base sm:text-sm placeholder-neutral-500 outline-none",
            isCentered && "opacity-0"
          )}
        />

        {/* Бейдж pg_trgm на десктопе при наличии текста */}
        {query && (
          <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#242016] border border-[#443820] text-[#FDE047] select-none mr-1.5">
            <Sparkles className="h-2.5 w-2.5" />
            pg_trgm
          </span>
        )}

        {/* Кнопка быстрой очистки при наличии текста */}
        {query && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-neutral-700/60 transition-colors cursor-pointer ml-1.5"
            title="Очистить"
            aria-label="Очистить поиск"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ─── ВЫПАДАЮЩЕЕ ОКНО РЕЗУЛЬТАТОВ FUZZY SEARCH (pg_trgm) ─── */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-[#161616]/98 backdrop-blur-xl border border-neutral-800 shadow-2xl overflow-hidden transition-all text-white animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Верхняя строка статуса */}
          <div className="px-4 py-2.5 border-b border-neutral-800/80 bg-neutral-900/60 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-neutral-300">
              <Sparkles className="h-3.5 w-3.5 text-[#FDE047]" />
              <span>
                {query.trim()
                  ? `Нечеткий поиск (pg_trgm): «${query.trim()}»`
                  : "Популярные студийные треки"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isLoading && (
                <span className="text-neutral-400 flex items-center gap-1 text-[11px]">
                  <Loader2 className="h-3 w-3 animate-spin text-[#FDE047]" />
                  поиск...
                </span>
              )}
              <span className="text-[11px] text-neutral-400">
                Найдено: <strong className="text-white">{results.length}</strong>
              </span>
            </div>
          </div>

          {/* Быстрые подсказки / чипы запросов */}
          <div className="px-3.5 py-2 border-b border-neutral-800/60 bg-neutral-900/30 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="text-[11px] font-medium text-neutral-500 whitespace-nowrap mr-1 shrink-0">
              Примеры:
            </span>
            {SUGGESTED_QUERIES.map((sq) => (
              <button
                key={sq}
                type="button"
                onClick={() => handleSelectQuery(sq)}
                className="px-2.5 py-1 rounded-lg bg-[#202020] hover:bg-[#282828] text-[11px] font-medium text-neutral-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer shrink-0 border border-neutral-800"
              >
                {sq}
              </button>
            ))}
          </div>

          {/* Список найденных треков */}
          <div className="max-h-[360px] sm:max-h-[420px] overflow-y-auto divide-y divide-neutral-800/50 p-1.5">
            {isLoading && results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                <Loader2 className="h-7 w-7 animate-spin text-[#FDE047] mb-2.5" />
                <p className="text-xs">Выполняется триграммный поиск через pg_trgm...</p>
              </div>
            ) : results.length > 0 ? (
              results.map((track) => {
                const trackKey = track.key || track.library_key || track.id;
                const isPlayingThis = playingTrackKey === trackKey && isPlayingAudio;
                const sim = track.similarity;

                return (
                  <div
                    key={track.id || track.key}
                    onClick={() => handleTogglePlay(track)}
                    className={cn(
                      "group flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-xl transition-all cursor-pointer",
                      isPlayingThis
                        ? "bg-[#242016]/80 border border-[#443820]/60"
                        : "hover:bg-[#202020]"
                    )}
                  >
                    {/* Левая часть: обложка с кнопкой play и названием */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Обложка */}
                      <div
                        className={cn(
                          "relative h-10 w-10 sm:h-11 sm:w-11 rounded-lg shrink-0 flex items-center justify-center text-white shadow-xs overflow-hidden",
                          track.gradient
                            ? `bg-gradient-to-br ${track.gradient}`
                            : "bg-gradient-to-br from-[#e05638] to-[#f59e0b]"
                        )}
                        style={track.color && !track.gradient ? { backgroundColor: track.color } : {}}
                      >
                        {/* Анимированный эквалайзер при воспроизведении */}
                        {isPlayingThis ? (
                          <div className="flex items-end gap-0.5 h-4">
                            <span className="w-1 bg-white rounded-full animate-bounce [animation-delay:-0.3s] h-3.5" />
                            <span className="w-1 bg-white rounded-full animate-bounce [animation-delay:-0.15s] h-4" />
                            <span className="w-1 bg-white rounded-full animate-bounce h-2.5" />
                          </div>
                        ) : (
                          <Music className="h-4 w-4 text-white/90 group-hover:hidden" />
                        )}

                        {/* Кнопка воспроизведения по ховеру */}
                        <div
                          className={cn(
                            "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
                            isPlayingThis ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          )}
                        >
                          {isPlayingThis ? (
                            <Pause className="h-4 w-4 fill-white text-white" />
                          ) : (
                            <Play className="h-4 w-4 fill-white text-white ml-0.5" />
                          )}
                        </div>
                      </div>

                      {/* Текстовая информация */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-white truncate group-hover:text-[#FDE047] transition-colors">
                            {track.title}
                          </p>

                          {/* Индикатор релевантности / сходства pg_trgm */}
                          {sim !== undefined && sim !== null && query.trim() && (
                            <span
                              className={cn(
                                "hidden sm:inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 border",
                                sim >= 0.85
                                  ? "bg-emerald-950/70 border-emerald-800/70 text-emerald-300"
                                  : sim >= 0.4
                                  ? "bg-yellow-950/70 border-yellow-800/70 text-yellow-300"
                                  : "bg-neutral-800 border-neutral-700 text-neutral-400"
                              )}
                              title={`Триграммное сходство pg_trgm: ${Math.round(sim * 100)}%`}
                            >
                              {sim >= 0.95 ? "100%" : `${Math.round(sim * 100)}%`}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-neutral-400 truncate mt-0.5">
                          <span className="truncate">{track.artist || "Студия"}</span>
                          {track.genre && (
                            <>
                              <span className="text-neutral-600">•</span>
                              <span className="text-[11px] px-1.5 py-0.2 rounded bg-neutral-800/80 text-neutral-300 border border-neutral-700/50 shrink-0">
                                {track.genre}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Правая часть: длительность и действия */}
                    <div className="flex items-center gap-2 shrink-0">
                      {track.duration && (
                        <span className="text-xs text-neutral-400 font-mono hidden sm:inline-block">
                          {track.duration}
                        </span>
                      )}

                      {/* Кнопка воспроизведения */}
                      <button
                        type="button"
                        onClick={(e) => handleTogglePlay(track, e)}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer",
                          isPlayingThis
                            ? "bg-[#FDE047] text-neutral-950 hover:bg-[#FEF08A]"
                            : "bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white"
                        )}
                        title={isPlayingThis ? "Пауза" : "Слушать"}
                      >
                        {isPlayingThis ? (
                          <Pause className="h-3.5 w-3.5 fill-current" />
                        ) : (
                          <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                        )}
                      </button>

                      {/* Кнопка "В плейлист" */}
                      <button
                        type="button"
                        onClick={(e) => handleOpenAddModal(track, e)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-[#262626] border border-neutral-700/70 hover:border-neutral-600 text-xs font-semibold text-neutral-200 hover:text-white transition-all cursor-pointer"
                        title="Добавить в плейлист сообщества"
                      >
                        <Plus className="h-3.5 w-3.5 text-[#FDE047]" />
                        <span className="hidden sm:inline">В плейлист</span>
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              /* Пустое состояние */
              <div className="py-10 px-4 text-center space-y-2">
                <Music className="h-8 w-8 text-neutral-600 mx-auto" />
                <p className="text-sm font-semibold text-neutral-300">
                  Ничего не найдено по запросу «{query}»
                </p>
                <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                  pg_trgm не нашел совпадений даже с учетом опечаток. Попробуйте поискать по жанру (рок, фанк, хаус) или исполнителю.
                </p>
              </div>
            )}
          </div>

          {/* Подвал с подсказками */}
          <div className="px-4 py-2 border-t border-neutral-800/60 bg-neutral-900/60 flex items-center justify-between text-[11px] text-neutral-500">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              pg_trgm Fuzzy Search активен
            </span>
            <span>Нажмите <kbd className="px-1 py-0.5 rounded bg-neutral-800 text-neutral-300">Esc</kbd> чтобы закрыть</span>
          </div>
        </div>
      )}

      {/* ─── МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ В СООБЩЕСТВО ─── */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-md bg-[#181818] border border-neutral-800 text-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Plus className="h-5 w-5 text-[#FDE047]" />
              Добавить в плейлист
            </DialogTitle>
            <DialogDescription className="text-neutral-400 text-xs sm:text-sm">
              Выберите сообщество, в очередь которого вы хотите добавить трек «{selectedTrack?.title}».
            </DialogDescription>
          </DialogHeader>

          {/* Карточка выбранного трека */}
          {selectedTrack && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-900/80 border border-neutral-800">
              <div
                className={cn(
                  "h-10 w-10 rounded-lg shrink-0 flex items-center justify-center text-white",
                  selectedTrack.gradient
                    ? `bg-gradient-to-br ${selectedTrack.gradient}`
                    : "bg-[#e05638]"
                )}
              >
                <Music className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{selectedTrack.title}</p>
                <p className="text-xs text-neutral-400 truncate">
                  {selectedTrack.artist} • {selectedTrack.genre}
                </p>
              </div>
              <span className="text-xs font-mono text-neutral-400">{selectedTrack.duration}</span>
            </div>
          )}

          {/* Список доступных сообществ */}
          <div className="space-y-2 mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Ваши сообщества
            </p>

            {isLoadingCommunities ? (
              <div className="flex items-center justify-center py-6 text-neutral-400">
                <Loader2 className="h-5 w-5 animate-spin text-[#FDE047] mr-2" />
                <span className="text-xs">Загрузка сообществ...</span>
              </div>
            ) : communities.length > 0 ? (
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {communities.map((comm) => (
                  <button
                    key={comm.id}
                    type="button"
                    disabled={isAdding}
                    onClick={() => handleAddToCommunity(comm)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#202020] hover:bg-[#282828] border border-neutral-800 hover:border-neutral-700 transition-colors text-left cursor-pointer group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-300 group-hover:text-[#FDE047] transition-colors shrink-0">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{comm.name}</p>
                        <p className="text-[11px] text-neutral-400">
                          {comm.role === "admin" ? "Администратор" : "Участник"}
                        </p>
                      </div>
                    </div>

                    <span className="text-xs font-medium text-[#FDE047] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      Добавить →
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-neutral-800 rounded-xl space-y-2">
                <p className="text-xs text-neutral-400">У вас пока нет активных сообществ</p>
                <a
                  href="/playlist"
                  className="inline-flex items-center gap-1.5 text-xs text-[#FDE047] font-semibold hover:underline"
                >
                  Перейти к плейлистам
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { SearchBar as SearchInput, SearchBar as MusicSearch };
export default SearchBar;
