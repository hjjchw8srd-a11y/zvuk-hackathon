import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Play,
  Pause,
  Music,
  Plus,
  Search,
  Check,
  Headphones,
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

const STUDIO_TRACKS = [
  {
    key: "bustin",
    title: "Bustin Loose With Lead",
    artist: "Audionautix",
    genre: "Рок",
    duration: "2:08",
    duration_seconds: 128,
    color: "#e05638",
    gradient: "from-red-600 via-orange-600 to-amber-700",
    description: "Драйвовый классический гитарный рок с мощными риффами и энергичным соло.",
  },
  {
    key: "funk90",
    title: "90 Seconds Of Funk",
    artist: "Audionautix",
    genre: "Фанк",
    duration: "1:31",
    duration_seconds: 91,
    color: "#f59e0b",
    gradient: "from-amber-500 via-yellow-600 to-orange-700",
    description: "Качающий фанковый ритм с пружинистым слэп-басом и ярким грувом.",
  },
  {
    key: "cents5",
    title: "5 Cents Back",
    artist: "Audionautix",
    genre: "Рок",
    duration: "1:54",
    duration_seconds: 114,
    color: "#3b82f6",
    gradient: "from-blue-600 via-indigo-600 to-cyan-700",
    description: "Блюз-роковый ритм с глубоким звучанием электрогитары и плотным басом.",
  },
  {
    key: "fallingsky",
    title: "Falling Sky",
    artist: "Audionautix",
    genre: "Хаус",
    duration: "4:12",
    duration_seconds: 252,
    color: "#8b5cf6",
    gradient: "from-purple-600 via-violet-700 to-pink-700",
    description: "Клубный атмосферный хаус с глубокой бочкой, синтами и танцевальным настроением.",
  },
  {
    key: "dawn",
    title: "Первые лучи",
    artist: "Volna Studio",
    genre: "Эмбиент",
    duration: "0:48",
    duration_seconds: 48,
    color: "#f4b782",
    gradient: "from-amber-500 via-orange-600 to-amber-700",
    description: "Мягкий атмосферный саундскейп для медитации, учёбы и спокойного утра.",
  },
  {
    key: "city",
    title: "После пар",
    artist: "Volna Studio",
    genre: "Лоу-фай",
    duration: "0:56",
    duration_seconds: 56,
    color: "#b2a1df",
    gradient: "from-violet-600 via-purple-700 to-indigo-900",
    description: "Теплый винтажный лоу-фай бит с мягкими клавишными для вечерней прогулки.",
  },
  {
    key: "orbit",
    title: "Орбита",
    artist: "Volna Studio",
    genre: "Электроника",
    duration: "0:52",
    duration_seconds: 52,
    color: "#80cdd3",
    gradient: "from-cyan-500 via-teal-600 to-blue-800",
    description: "Космический пульсирующий синтезаторный грув с ритмичной перкуссией.",
  },
  {
    key: "rain",
    title: "Тихий двор",
    artist: "Volna Studio",
    genre: "Инди",
    duration: "0:44",
    duration_seconds: 44,
    color: "#a8c794",
    gradient: "from-emerald-500 via-teal-600 to-green-800",
    description: "Меланхоличные аккорды с акустическим теплом и шумом лёгкого дождя.",
  },
  {
    key: "night",
    title: "Ночной маршрут",
    artist: "Volna Studio",
    genre: "Синтвейв",
    duration: "1:00",
    duration_seconds: 60,
    color: "#f099b2",
    gradient: "from-pink-500 via-rose-600 to-purple-800",
    description: "Энергичный ретро-синтвейв с пилообразными басами и огнями ночного города.",
  },
  {
    key: "sea",
    title: "Морской бриз",
    artist: "Volna Studio",
    genre: "Чилаут",
    duration: "0:50",
    duration_seconds: 50,
    color: "#76c7c0",
    gradient: "from-teal-400 via-cyan-600 to-sky-800",
    description: "Освежающий лёгкий чилаут с шумом волн и воздушными гармониями.",
  },
];

const GENRES = ["Все жанры", "Рок", "Фанк", "Хаус", "Эмбиент", "Лоу-фай", "Электроника", "Инди", "Синтвейв", "Чилаут"];

export function LibraryPage() {
  const [search, setSearch] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("Все жанры");
  const [playingKey, setPlayingKey] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [targetTrack, setTargetTrack] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    document.title = "Медиатека · ритм.";

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

    return () => unsub();
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

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
        showToast(`✓ «${targetTrack.title}» добавлен в комнату «${roomName}»`);
        setIsAddOpen(false);
      } else {
        const data = await res.json();
        showToast(`⚠️ ${data.detail || "Не удалось добавить трек"}`);
      }
    } catch {
      showToast("⚠️ Ошибка соединения с сервером");
    }
  };

  const filtered = STUDIO_TRACKS.filter((t) => {
    const matchesSearch =
      !search.trim() ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.artist.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchesGenre = selectedGenre === "Все жанры" || t.genre === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  return (
    <div className="w-full text-white space-y-8 pb-24">
      {/* Тост */}
      {toast && (
        <div className="fixed top-5 right-5 z-[200] bg-[#1a1a1a] border border-[#2e402d] text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          <span>{toast}</span>
        </div>
      )}

      {/* Заголовок страницы */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1e261d] border border-[#2e402d] text-[#a3e635] text-xs font-semibold uppercase tracking-wider">
          <Headphones className="h-3.5 w-3.5" />
          <span>Студийная фонотека Volna Studio</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
          Медиатека
        </h1>
        <p className="text-neutral-400 text-sm sm:text-base max-w-2xl leading-relaxed">
          Фирменные звуковые дорожки без авторских ограничений. Слушайте, тестируйте в реальном времени и добавляйте в плейлисты ваших сообществ.
        </p>
      </div>

      {/* Поиск и фильтры по жанрам */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию или описанию..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#171717] border border-[#262626] text-sm text-white placeholder-neutral-500 outline-none focus:border-[#a3e635] transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full pb-1 scrollbar-none">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGenre(g)}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer",
                  selectedGenre === g
                    ? "bg-[#233525] border border-[#2e402d] text-[#a3e635]"
                    : "bg-[#171717] border border-[#262626] text-neutral-400 hover:text-white"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Сетка треков */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((track) => {
          const isPlaying = playingKey === track.key;
          return (
            <div
              key={track.key}
              className={cn(
                "rounded-2xl border p-5 flex flex-col justify-between transition-all group bg-[#171717]",
                isPlaying
                  ? "border-[#2e402d] shadow-lg shadow-[#a3e635]/5 bg-gradient-to-b from-[#1c241d] to-[#171717]"
                  : "border-[#262626] hover:border-neutral-700"
              )}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  {/* Обложка с кнопкой Play */}
                  <div
                    onClick={() => handlePlayToggle(track)}
                    className={cn(
                      "relative h-16 w-16 rounded-2xl bg-gradient-to-br flex items-center justify-center cursor-pointer shadow-md overflow-hidden shrink-0 group/cover",
                      track.gradient
                    )}
                  >
                    <Music className="h-7 w-7 text-white/50 group-hover/cover:scale-90 transition-transform" />
                    <div
                      className={cn(
                        "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
                        isPlaying ? "opacity-100" : "opacity-0 group-hover/cover:opacity-100"
                      )}
                    >
                      {isPlaying ? (
                        <Pause className="h-6 w-6 text-[#a3e635] fill-[#a3e635]" />
                      ) : (
                        <Play className="h-6 w-6 text-white fill-white ml-0.5" />
                      )}
                    </div>
                  </div>

                  {/* Бейдж жанра и длительность */}
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#1e261d] border border-[#2e402d] text-[#a3e635]">
                      {track.genre}
                    </span>
                    <span className="text-xs text-neutral-500 tabular-nums font-mono">
                      {track.duration}
                    </span>
                  </div>
                </div>

                {/* Инфо о треке */}
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-[#a3e635] transition-colors truncate">
                    {track.title}
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">{track.artist}</p>
                  <p className="text-xs text-neutral-500 mt-2 line-clamp-2 leading-relaxed">
                    {track.description}
                  </p>
                </div>
              </div>

              {/* Нижняя панель действий */}
              <div className="pt-4 mt-4 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handlePlayToggle(track)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer",
                    isPlaying
                      ? "bg-[#233525] text-[#a3e635]"
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
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#233525] border border-[#2e402d] text-[#a3e635] text-xs font-semibold hover:bg-[#2b412e] transition-colors cursor-pointer"
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

      {filtered.length === 0 && (
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#233525] border border-[#2e402d] text-[#a3e635]">
            <FolderPlus className="h-5 w-5" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#a3e635] m-0">
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
                  className="flex items-center justify-between p-3 rounded-xl bg-[#202020] border border-neutral-800 hover:border-[#2e402d] hover:bg-[#233024] transition-all text-left group cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white group-hover:text-[#a3e635] transition-colors truncate">
                      {c.name}
                    </div>
                    <div className="text-xs text-neutral-500">
                      Код: {c.invite_code || "ZVUK26"}
                    </div>
                  </div>
                  <Plus className="h-4 w-4 text-neutral-400 group-hover:text-[#a3e635] transition-colors shrink-0" />
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
