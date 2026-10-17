import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Play, Pause, SkipBack, SkipForward, Music, Plus, Search,
  Copy, Check, Users, History, ShieldCheck, Trash2,
  CheckCircle, XCircle, Upload, ChevronUp, ChevronDown,
  Minus, Crown, UserPlus, Image as ImageIcon, Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { audioService } from "@/lib/audioService";

// ─── Заготовки под будущий бэкенд (когда появится авторизация и API) ────────
const DEFAULT_USER = {
  id: "u1",
  name: "Алексей М.",
  username: "@alex_m",
  avatar: "АМ",
  avatarColor: "#7c3aed",
};

const DEFAULT_PLAYLIST = {
  id: "e397a23e-50c5-40f0-81b1-39c27b52d1b0",
  name: "ИИНОД-82",
  faculty: "ИИНОД-82",
  memberCount: 28,
  creatorId: "u1",
  admins: ["u1"],
  gradient: "from-violet-700 via-fuchsia-600 to-pink-500",
  customCover: null,
};

// ─── Начальные списки (пустые для новых комнат, заполняются из API) ──────────
const INITIAL_TRACKS = [];
const INITIAL_MOD_QUEUE = [];

const LIBRARY_TRACKS = [
  { id: "bustin", key: "bustin", title: "Bustin Loose With Lead", artist: "Audionautix", genre: "Рок", duration: "2:08", duration_seconds: 128, gradient: "from-red-600 to-amber-700" },
  { id: "funk90", key: "funk90", title: "90 Seconds Of Funk", artist: "Audionautix", genre: "Фанк", duration: "1:31", duration_seconds: 91, gradient: "from-amber-500 to-orange-700" },
  { id: "cents5", key: "cents5", title: "5 Cents Back", artist: "Audionautix", genre: "Рок", duration: "1:54", duration_seconds: 114, gradient: "from-blue-600 to-cyan-700" },
  { id: "fallingsky", key: "fallingsky", title: "Falling Sky", artist: "Audionautix", genre: "Хаус", duration: "4:12", duration_seconds: 252, gradient: "from-purple-600 to-pink-700" },
  { id: "dawn", key: "dawn", title: "Первые лучи", artist: "Volna Studio", genre: "Эмбиент", duration: "0:48", duration_seconds: 48, gradient: "from-amber-500 to-orange-700" },
  { id: "city", key: "city", title: "После пар", artist: "Volna Studio", genre: "Лоу-фай", duration: "0:56", duration_seconds: 56, gradient: "from-violet-600 to-indigo-800" },
  { id: "orbit", key: "orbit", title: "Орбита", artist: "Volna Studio", genre: "Электроника", duration: "0:52", duration_seconds: 52, gradient: "from-cyan-500 to-blue-700" },
  { id: "rain", key: "rain", title: "Тихий двор", artist: "Volna Studio", genre: "Инди", duration: "0:44", duration_seconds: 44, gradient: "from-emerald-500 to-teal-700" },
  { id: "night", key: "night", title: "Ночной маршрут", artist: "Volna Studio", genre: "Синтвейв", duration: "1:00", duration_seconds: 60, gradient: "from-pink-500 to-rose-700" },
  { id: "sea", key: "sea", title: "Морской бриз", artist: "Volna Studio", genre: "Чилаут", duration: "0:50", duration_seconds: 50, gradient: "from-teal-400 to-cyan-600" },
];

const LAST_WEEK = [
  { rank: 1, title: "Bad Guy",          artist: "Billie Eilish", votes: 67 },
  { rank: 2, title: "Blinding Lights",  artist: "The Weeknd",    votes: 54 },
  { rank: 3, title: "Watermelon Sugar", artist: "Harry Styles",  votes: 41 },
];

// Участники сообщества (для назначения администраторов)
const MOCK_MEMBERS = [
  { id: "u1", name: "Алексей М.",  username: "@alex_m",  avatar: "АМ", avatarColor: "#7c3aed" },
  { id: "u2", name: "Катя П.",     username: "@kate_p",  avatar: "КП", avatarColor: "#db2777" },
  { id: "u3", name: "Дима К.",     username: "@dima_k",  avatar: "ДК", avatarColor: "#0891b2" },
  { id: "u4", name: "Маша Р.",     username: "@masha_r", avatar: "МР", avatarColor: "#059669" },
  { id: "u5", name: "Петя З.",     username: "@petya_z", avatar: "ПЗ", avatarColor: "#d97706" },
];

// ─── Вспомогательные функции ─────────────────────────────────────────────────
function sortedTracks(tracks) { return [...tracks].sort((a, b) => b.votes - a.votes); }
function fmt2(n) { return String(n).padStart(2, "0"); }
function nowStr() { const d = new Date(); return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}:${fmt2(d.getSeconds())}`; }

// ─── Компоненты элементов списка ─────────────────────────────────────────────
function TrackThumb({ gradient, size = 48 }) {
  return (
    <div
      className={cn("rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br", gradient)}
      style={{ width: size, height: size, minWidth: size }}
    >
      <Music size={size * 0.38} className="text-white/50" />
    </div>
  );
}

function VoteBlock({ track, onVote }) {
  const cnt = track.votes;
  const cntColor = cnt > 0 ? "text-[#a3e635]" : cnt < 0 ? "text-red-400" : "text-neutral-400";
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={() => onVote(track.id, 1)}
        className={cn(
          "w-7 h-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer",
          track.userVote === 1
            ? "bg-[#1c231d] border-[#2e402d] text-[#a3e635]"
            : "bg-[#1f1f1f] border-[#2e2e2e] text-neutral-400 hover:border-[#2e402d] hover:text-[#a3e635]"
        )}
        title="За"
      >
        <ChevronUp size={13} />
      </button>
      <span className={cn("min-w-[30px] text-center text-sm font-bold tabular-nums", cntColor)}>
        {cnt > 0 ? `+${cnt}` : cnt}
      </span>
      <button
        onClick={() => onVote(track.id, -1)}
        className={cn(
          "w-7 h-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer",
          track.userVote === -1
            ? "bg-red-950/40 border-red-600/40 text-red-400"
            : "bg-[#1f1f1f] border-[#2e2e2e] text-neutral-400 hover:border-red-600/40 hover:text-red-400"
        )}
        title="Против"
      >
        <ChevronDown size={13} />
      </button>
    </div>
  );
}

function TrackRow({ track, rank, isPlaying, canModerate, onPlay, onVote, onFavorite, onDelete }) {
  const delta = (track.prevRank || rank) - rank;
  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all group",
      isPlaying
        ? "bg-[#1c231d]/90 border-[#2e402d]"
        : "bg-transparent border-transparent hover:bg-[#171717] hover:border-[#262626]"
    )}>
      <span className="w-5 text-center text-sm font-bold text-neutral-600 shrink-0">{rank}</span>

      {/* Индикатор динамики */}
      <span className="w-5 text-center shrink-0">
        {delta > 0
          ? <span className="text-[11px] text-[#a3e635] font-bold">▲{delta}</span>
          : delta < 0
          ? <span className="text-[11px] text-red-400 font-bold">▼{Math.abs(delta)}</span>
          : <Minus size={10} className="text-neutral-700 inline" />}
      </span>

      <div className="relative cursor-pointer shrink-0" onClick={() => onPlay(track.id)}>
        <TrackThumb gradient={track.gradient} size={44} />
        <div className={cn(
          "absolute inset-0 rounded-xl bg-black/60 flex items-center justify-center transition-opacity",
          isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          {isPlaying ? <Pause size={16} className="text-[#a3e635] fill-[#a3e635]" /> : <Play size={16} className="text-white fill-white" />}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold truncate", isPlaying ? "text-[#a3e635]" : "text-white")}>{track.title}</p>
        <p className="text-xs text-neutral-400 truncate">{track.artist}</p>
        <p className="text-[11px] text-neutral-500 mt-0.5">
          Предложил: <span className="text-neutral-400">{track.proposer}</span> · {track.duration}
        </p>
      </div>

      <span className="text-xs text-neutral-500 tabular-nums hidden sm:block shrink-0">{track.duration}</span>

      {/* Кнопка Добавить в избранное */}
      <button
        type="button"
        onClick={() => onFavorite?.(track.id)}
        className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0 cursor-pointer",
          track.is_favorite
            ? "text-rose-500 hover:text-rose-400"
            : "text-neutral-500 hover:text-rose-400 opacity-0 group-hover:opacity-100"
        )}
        title={track.is_favorite ? "В избранном" : "Добавить в избранное"}
      >
        <Heart size={14} className={track.is_favorite ? "fill-rose-500" : ""} />
      </button>

      <VoteBlock track={track} onVote={onVote} />

      {canModerate && (
        <button
          onClick={() => onDelete(track.id)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-red-950/30 transition-all opacity-0 group-hover:opacity-100 shrink-0 cursor-pointer"
          title="Удалить"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function ModRow({ track, canModerate, onApprove, onReject }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[#262626] bg-[#171717]">
      <TrackThumb gradient={track.gradient} size={42} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{track.title}</p>
        <p className="text-xs text-neutral-400 truncate">{track.artist}</p>
        <p className="text-[11px] text-neutral-500 mt-0.5">
          Предложил: <span className="text-neutral-400">{track.proposer}</span> · {track.duration}
        </p>
      </div>
      {canModerate ? (
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => onApprove(track.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1c231d] border border-[#2e402d] text-white hover:bg-[#243025] transition-colors cursor-pointer"
          >
            <CheckCircle size={12} className="text-[#a3e635]" /> Одобрить
          </button>
          <button
            onClick={() => onReject(track.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-950/30 border border-red-800/40 text-red-400 hover:bg-red-950/50 transition-colors cursor-pointer"
          >
            <XCircle size={12} /> Отклонить
          </button>
        </div>
      ) : (
        <span className="text-xs text-neutral-500 border border-neutral-800 rounded-lg px-2.5 py-1 shrink-0">
          Ожидает проверки
        </span>
      )}
    </div>
  );
}

function NextBadge({ tracks, currentId }) {
  const s = sortedTracks(tracks);
  const idx = s.findIndex((t) => t.id === currentId);
  const next = s.length > 0 ? s[(idx + 1) % s.length] : null;
  return (
    <div className="flex flex-col items-end gap-0.5 min-w-0 hidden md:flex">
      <span className="text-[11px] text-neutral-500">Следующий по рейтингу:</span>
      <span className="text-xs font-semibold text-white bg-[#1c231d] border border-[#2e402d] rounded-lg px-2.5 py-1 max-w-[190px] truncate">
        {next ? `${next.title} — ${next.artist}` : "—"}
      </span>
    </div>
  );
}

// ─── ОСНОВНОЙ КОМПОНЕНТ СТРАНИЦЫ ──────────────────────────────────────────────
export function PlaylistPage() {
  const { id: routeRoomId } = useParams();
  const { user: authUser } = useAuth();

  // Текущий пользователь из AuthContext или fallback
  const user = authUser
    ? {
        id: authUser.id,
        name: authUser.display_name || authUser.email.split("@")[0],
        username: `@${(authUser.display_name || authUser.email.split("@")[0]).toLowerCase().replace(/\s+/g, "_")}`,
        avatar: (authUser.display_name || "Я").slice(0, 2).toUpperCase(),
        avatarColor: "#7c3aed",
      }
    : DEFAULT_USER;

  const [currentRoomId, setCurrentRoomId] = useState(routeRoomId || null);
  const [playlist, setPlaylist] = useState(DEFAULT_PLAYLIST);
  const [admins, setAdmins] = useState(DEFAULT_PLAYLIST.admins);
  const [membersList, setMembersList] = useState(MOCK_MEMBERS);
  const [topHistory, setTopHistory] = useState(LAST_WEEK);

  // Права модератора: доступны владельцу или назначенным администраторам
  const canModerate = !!(user && (playlist.creatorId === user.id || admins.includes(user.id)));

  // Состояние списка треков и модерации
  const [tracks, setTracks] = useState(INITIAL_TRACKS);
  const [modQueue, setModQueue] = useState(INITIAL_MOD_QUEUE);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("queue");
  const [player, setPlayer] = useState({ trackId: null, playing: false, progress: 0, elapsed: 0 });
  const [nextId, setNextId] = useState(200);

  // Модальные окна
  const [modalAdd, setModalAdd] = useState(false);
  const [modalInvite, setModalInvite] = useState(false);
  const [modalHistory, setModalHistory] = useState(false);
  const [modalAdmins, setModalAdmins] = useState(false);

  // Форма добавления трека
  const [addTab, setAddTab] = useState("library");
  const [libSearch, setLibSearch] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadArtist, setUploadArtist] = useState("");
  const [uploadProposer, setUploadProposer] = useState(user.username);
  const [chosenFile, setChosenFile] = useState(null);

  // Ссылка приглашения
  const [copiedLink, setCopiedLink] = useState(false);

  // Тост-уведомления
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // Реф для смены обложки
  const avatarInputRef = useRef(null);

  // Таймер ротации
  const [countdown, setCountdown] = useState("—");

  // Автоопределение активного сообщества из API
  useEffect(() => {
    if (routeRoomId) {
      setCurrentRoomId(routeRoomId);
      return;
    }

    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch("/api/me/communities", { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const all = [...(data?.created || []), ...(data?.joined || [])];
        if (all.length > 0) {
          setCurrentRoomId(all[0].id);
          return;
        }
        return fetch("/api/bootstrap", { headers })
          .then((r) => (r.ok ? r.json() : null))
          .then((bData) => {
            if (bData?.communities?.length > 0) {
              setCurrentRoomId(bData.communities[0].id);
            }
          });
      })
      .catch(() => {});
  }, [routeRoomId, authUser]);

  // Загрузка состояния плейлиста и треков из API
  const fetchCommunityData = useCallback((roomId) => {
    if (!roomId) return;
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`/api/communities/${roomId}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.community) return;

        const comm = data.community;
        setPlaylist((prev) => ({
          ...prev,
          id: comm.id,
          name: comm.name,
          memberCount: data.stats?.members || data.members?.length || prev.memberCount,
          creatorId: comm.owner_id,
          inviteCode: comm.invite_code,
          customCover: comm.avatar_url || prev.customCover,
        }));

        if (Array.isArray(data.members) && data.members.length > 0) {
          const adminIds = data.members
            .filter((m) => m.role === "owner" || m.role === "moderator")
            .map((m) => m.id);
          if (comm.owner_id && !adminIds.includes(comm.owner_id)) adminIds.push(comm.owner_id);
          setAdmins(adminIds);

          const colors = ["#7c3aed", "#db2777", "#0891b2", "#059669", "#d97706"];
          setMembersList(
            data.members.map((m, i) => ({
              id: m.id,
              name: m.display_name,
              username: `@${m.display_name?.toLowerCase().replace(/\s+/g, "_") || "user"}`,
              avatar: (m.display_name || "У").slice(0, 2).toUpperCase(),
              avatarColor: colors[i % colors.length],
              role: m.role,
            }))
          );
        }

        if (Array.isArray(data.tracks)) {
          const grads = [
            "from-violet-600 to-purple-800",
            "from-pink-500 to-rose-700",
            "from-sky-400 to-cyan-600",
            "from-emerald-400 to-teal-600",
            "from-amber-400 to-orange-600",
            "from-fuchsia-500 to-purple-700",
            "from-yellow-400 to-pink-500",
          ];

          const active = data.tracks
            .filter((t) => t.status === "approved" || !t.status)
            .map((t, idx) => ({
              id: t.id,
              title: t.title,
              artist: t.artist,
              genre: t.genre,
              source_type: t.source_type,
              library_key: t.library_key,
              is_favorite: t.is_favorite ?? false,
              duration: t.duration_seconds
                ? `${Math.floor(t.duration_seconds / 60)}:${fmt2(t.duration_seconds % 60)}`
                : "0:45",
              duration_seconds: t.duration_seconds || 45,
              proposer: t.contributor ? `@${t.contributor}` : (t.created_by_name ? `@${t.created_by_name}` : "@volna"),
              votes: t.vote_score ?? t.score ?? 0,
              userVote: t.my_vote ?? t.user_vote ?? 0,
              gradient: grads[idx % grads.length],
              prevRank: idx + 1,
            }));
          setTracks(active);

          const pending = data.tracks
            .filter((t) => t.status === "pending")
            .map((t, idx) => ({
              id: t.id,
              title: t.title,
              artist: t.artist,
              genre: t.genre,
              source_type: t.source_type,
              library_key: t.library_key,
              duration: t.duration_seconds
                ? `${Math.floor(t.duration_seconds / 60)}:${fmt2(t.duration_seconds % 60)}`
                : "0:45",
              duration_seconds: t.duration_seconds || 45,
              proposer: t.contributor ? `@${t.contributor}` : (t.created_by_name ? `@${t.created_by_name}` : "@участник"),
              gradient: grads[(idx + 2) % grads.length],
            }));
          setModQueue((prev) => {
            const serverIds = new Set(pending.map((p) => p.id));
            const localUnsynced = prev.filter((p) => typeof p.id === "number" && !serverIds.has(p.id));
            return [...pending, ...localUnsynced];
          });
        }
      })
      .catch(() => {});

    // Загрузка снимков топа прошлых ротаций
    fetch(`/api/communities/${roomId}/top-history`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((snaps) => {
        if (Array.isArray(snaps) && snaps.length > 0 && Array.isArray(snaps[0].top_tracks)) {
          setTopHistory(
            snaps[0].top_tracks.map((t, i) => ({
              rank: i + 1,
              title: t.title,
              artist: t.artist,
              votes: t.score ?? t.votes ?? 0,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (currentRoomId) {
      fetchCommunityData(currentRoomId);
    }
  }, [currentRoomId, fetchCommunityData]);

  useEffect(() => {
    document.title = "Плейлист · ритм.";
  }, []);

  // Таймер обратного отсчета до ротации (ближайший понедельник)
  useEffect(() => {
    function tick() {
      const now = new Date();
      const target = new Date(now);
      const daysUntilMon = ((1 - now.getDay() + 7) % 7) || 7;
      target.setDate(now.getDate() + daysUntilMon);
      target.setHours(0, 0, 0, 0);
      const diff = target - now;
      if (diff <= 0) { setCountdown("Идёт ротация!"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${d > 0 ? d + "д " : ""}${fmt2(h)}:${fmt2(m)}:${fmt2(s)}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Плеер: методы управления воспроизведением с реальным звуком
  const playTrack = useCallback((trackId) => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;

    if (player.trackId === trackId && player.playing) {
      audioService.pause();
      setPlayer((p) => ({ ...p, playing: false }));
    } else {
      audioService.play({
        ...track,
        room_id: currentRoomId,
        library_key: track.library_key || "dawn",
      });
      setPlayer({ trackId, playing: true, progress: 0, elapsed: 0 });
    }
  }, [tracks, player.trackId, player.playing, currentRoomId]);

  const playerNext = useCallback(() => {
    const s = sortedTracks(tracks);
    if (!s.length) return;
    const idx = s.findIndex((t) => t.id === player.trackId);
    const next = s[(idx + 1) % s.length];
    audioService.play({
      ...next,
      room_id: currentRoomId,
      library_key: next.library_key || "dawn",
    });
    setPlayer({ trackId: next.id, playing: true, progress: 0, elapsed: 0 });
  }, [tracks, player.trackId, currentRoomId]);

  const playerPrev = useCallback(() => {
    const s = sortedTracks(tracks);
    if (!s.length) return;
    const idx = s.findIndex((t) => t.id === player.trackId);
    const prev = s[(idx - 1 + s.length) % s.length];
    audioService.play({
      ...prev,
      room_id: currentRoomId,
      library_key: prev.library_key || "dawn",
    });
    setPlayer({ trackId: prev.id, playing: true, progress: 0, elapsed: 0 });
  }, [tracks, player.trackId, currentRoomId]);

  const togglePlay = () => {
    if (!player.trackId && tracks.length > 0) {
      playTrack(sortedTracks(tracks)[0].id);
    } else if (player.playing) {
      audioService.pause();
      setPlayer((p) => ({ ...p, playing: false }));
    } else if (player.trackId) {
      const track = tracks.find((t) => t.id === player.trackId);
      if (track) {
        audioService.play({
          ...track,
          room_id: currentRoomId,
          library_key: track.library_key || "dawn",
        });
        setPlayer((p) => ({ ...p, playing: true }));
      }
    }
  };

  const seekPlayer = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const currentT = tracks.find((t) => t.id === player.trackId);
    const dur = currentT?.duration_seconds || 45;
    audioService.seek((pct / 100) * dur);
  };

  const currentTrack = tracks.find((t) => t.id === player.trackId) || null;
  const fmtTime = (sec) => `${Math.floor(sec / 60)}:${fmt2(Math.floor(sec % 60))}`;

  // Подписка на аудио движок
  useEffect(() => {
    audioService.onEnded = () => {
      playerNext();
    };
    const unsubscribe = audioService.subscribe((state) => {
      if (state.track) {
        setPlayer({
          trackId: state.track.id,
          playing: state.isPlaying,
          progress: state.progress,
          elapsed: state.seconds,
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [playerNext]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const handleToggleFavorite = async (trackId) => {
    const t = tracks.find((x) => x.id === trackId);
    if (!t) return;
    const nextVal = !t.is_favorite;
    setTracks((prev) => prev.map((x) => (x.id === trackId ? { ...x, is_favorite: nextVal } : x)));
    showToast(nextVal ? `♥ «${t.title}» добавлен в Избранное` : `«${t.title}» удален из Избранного`);

    if (currentRoomId) {
      try {
        const token = localStorage.getItem("token");
        await fetch(`/api/communities/${currentRoomId}/tracks/${trackId}/favorite`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ value: nextVal }),
        });
      } catch {}
    }
  };

  const addHistory = useCallback((action, track) => {
    const map = {
      vote_up:   { label: "Проголосовали «За»",     color: "#a3e635", symbol: "▲" },
      vote_down: { label: "Проголосовали «Против»",  color: "#ef4444", symbol: "▼" },
      unvote:    { label: "Отменили голос",          color: "#6b7280", symbol: "↩" },
      propose:   { label: "Предложили трек",         color: "#a78bfa", symbol: "✦" },
      approve:   { label: "Одобрили трек",           color: "#a3e635", symbol: "✓" },
      reject:    { label: "Отклонили трек",          color: "#ef4444", symbol: "✕" },
      delete:    { label: "Удалили трек",            color: "#ef4444", symbol: "🗑" },
    };
    const info = map[action] || { label: action, color: "#9ca3af", symbol: "·" };
    setHistory((h) => [
      { id: Date.now() + Math.random(), ...info, track: `${track.title} — ${track.artist}`, time: nowStr() },
      ...h.slice(0, 49),
    ]);
  }, []);

  // Голосование: максимум можно добавить или убрать один балл (+1 или -1)
  const handleVote = useCallback(
    async (trackId, dir) => {
      const targetTrack = tracks.find((t) => t.id === trackId);
      if (!targetTrack) return;

      const currentVote = targetTrack.userVote || 0;
      let nextVote = 0;
      let delta = 0;

      if (dir === 1) {
        if (currentVote === 1) {
          nextVote = 0;
          delta = -1;
          addHistory("unvote", targetTrack);
        } else if (currentVote === -1) {
          nextVote = 0;
          delta = 1;
          addHistory("unvote", targetTrack);
        } else {
          nextVote = 1;
          delta = 1;
          addHistory("vote_up", targetTrack);
        }
      } else if (dir === -1) {
        if (currentVote === -1) {
          nextVote = 0;
          delta = 1;
          addHistory("unvote", targetTrack);
        } else if (currentVote === 1) {
          nextVote = 0;
          delta = -1;
          addHistory("unvote", targetTrack);
        } else {
          nextVote = -1;
          delta = -1;
          addHistory("vote_down", targetTrack);
        }
      }

      setTracks((prev) => {
        const s = sortedTracks(prev);
        const withPrev = prev.map((t) => ({ ...t, prevRank: s.findIndex((x) => x.id === t.id) + 1 }));
        return withPrev.map((t) => {
          if (t.id !== trackId) return t;
          return {
            ...t,
            votes: t.votes + delta,
            userVote: nextVote,
          };
        });
      });

      if (currentRoomId) {
        try {
          const token = localStorage.getItem("token");
          await fetch(`/api/communities/${currentRoomId}/tracks/${trackId}/vote`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ value: nextVote }),
          });
        } catch {}
      }
    },
    [addHistory, tracks, currentRoomId]
  );

  // Модерация
  const deleteTrack = async (trackId) => {
    const t = tracks.find((x) => x.id === trackId);
    if (!t) return;
    setTracks((prev) => prev.filter((x) => x.id !== trackId));
    if (player.trackId === trackId) setPlayer({ trackId: null, playing: false, progress: 0, elapsed: 0 });
    addHistory("delete", t, 0);
    showToast(`Трек «${t.title}» удалён`);

    if (currentRoomId) {
      try {
        const token = localStorage.getItem("token");
        await fetch(`/api/communities/${currentRoomId}/tracks/${trackId}/moderate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ action: "remove" }),
        });
        fetchCommunityData(currentRoomId);
      } catch {}
    }
  };

  const approveTrack = async (id) => {
    const t = modQueue.find((x) => x.id === id);
    if (!t) return;
    const s = sortedTracks(tracks);
    const withPrev = tracks.map((x) => ({ ...x, prevRank: s.findIndex((y) => y.id === x.id) + 1 }));
    setTracks([...withPrev, { ...t, votes: 0, userVote: 0, prevRank: withPrev.length + 1 }]);
    setModQueue((prev) => prev.filter((x) => x.id !== id));
    addHistory("approve", t, 0);
    showToast(`✓ Трек «${t.title}» одобрен`);

    if (currentRoomId) {
      try {
        const token = localStorage.getItem("token");
        await fetch(`/api/communities/${currentRoomId}/tracks/${id}/moderate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ action: "approve" }),
        });
        fetchCommunityData(currentRoomId);
      } catch {}
    }
  };

  const rejectTrack = async (id) => {
    const t = modQueue.find((x) => x.id === id);
    if (!t) return;
    setModQueue((prev) => prev.filter((x) => x.id !== id));
    addHistory("reject", t, 0);
    showToast(`Трек «${t.title}» отклонён`);

    if (currentRoomId) {
      try {
        const token = localStorage.getItem("token");
        await fetch(`/api/communities/${currentRoomId}/tracks/${id}/moderate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ action: "reject" }),
        });
        fetchCommunityData(currentRoomId);
      } catch {}
    }
  };

  // Управление администраторами (только владелец)
  const toggleAdmin = async (memberId) => {
    if (memberId === playlist.creatorId) return;
    const isNowAdmin = !admins.includes(memberId);
    setAdmins((prev) =>
      isNowAdmin ? [...prev, memberId] : prev.filter((id) => id !== memberId)
    );

    if (currentRoomId) {
      try {
        const token = localStorage.getItem("token");
        await fetch(`/api/communities/${currentRoomId}/members/${memberId}/role`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ role: isNowAdmin ? "moderator" : "member" }),
        });
      } catch {}
    }
  };

  // Смена обложки плейлиста
  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPlaylist((prev) => ({ ...prev, customCover: url }));
      showToast("Обложка плейлиста обновлена");

      if (currentRoomId) {
        try {
          const token = localStorage.getItem("token");
          await fetch(`/api/communities/${currentRoomId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ avatar_url: url }),
          });
        } catch {}
      }
    }
  };

  // Добавление треков
  const addFromLibrary = async (libId) => {
    const t = LIBRARY_TRACKS.find((x) => x.id === libId || x.key === libId);
    if (!t) return;
    const libraryKey = t.key || t.id;

    if (currentRoomId) {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/communities/${currentRoomId}/tracks/library`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ key: libraryKey, library_key: libraryKey }),
        });
        if (res.ok) {
          const resData = await res.json();
          fetchCommunityData(currentRoomId);
          if (resData.status === "approved") {
            showToast(`✓ «${t.title}» добавлен в плейлист`);
            setActiveTab("queue");
          } else {
            showToast(`«${t.title}» отправлен на модерацию`);
            setActiveTab("moderation");
          }
          setModalAdd(false);
          return;
        } else {
          const err = await res.json();
          showToast(`⚠️ ${err.detail || "Не удалось добавить трек"}`);
          return;
        }
      } catch {}
    }

    const newId = nextId; setNextId((n) => n + 1);
    const newTrack = { id: newId, ...t, library_key: libraryKey, proposer: user.username, votes: 0, userVote: 0, prevRank: tracks.length + 1 };
    setModQueue((prev) => [...prev, newTrack]);
    addHistory("propose", newTrack, 0);
    showToast(`«${t.title}» отправлен на модерацию`);
    setActiveTab("moderation");
    setModalAdd(false);
  };

  const uploadTrack = async () => {
    if (!uploadTitle.trim() || !uploadArtist.trim()) { showToast("⚠️ Заполните название и исполнителя"); return; }
    if (currentRoomId && chosenFile) {
      try {
        const token = localStorage.getItem("token");
        const formData = new FormData();
        formData.append("file", chosenFile);
        formData.append("title", uploadTitle.trim());
        formData.append("artist", uploadArtist.trim());
        const res = await fetch(`/api/communities/${currentRoomId}/tracks/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        if (res.ok) {
          const resData = await res.json();
          fetchCommunityData(currentRoomId);
          if (resData.status === "approved") {
            showToast(`✓ «${uploadTitle.trim()}» добавлен в плейлист`);
            setActiveTab("queue");
          } else {
            showToast(`«${uploadTitle.trim()}» отправлен на модерацию`);
            setActiveTab("moderation");
          }
          setUploadTitle(""); setUploadArtist(""); setChosenFile(null);
          setModalAdd(false);
          return;
        }
      } catch {}
    }

    const grads = ["from-violet-600 to-purple-800","from-pink-500 to-rose-700","from-sky-400 to-cyan-600","from-emerald-400 to-teal-600","from-amber-400 to-orange-600"];
    const newId = nextId; setNextId((n) => n + 1);
    const newTrack = { id: newId, title: uploadTitle.trim(), artist: uploadArtist.trim(), duration: "—", proposer: uploadProposer.trim() || "@вы", votes: 0, userVote: 0, prevRank: tracks.length + 1, gradient: grads[newId % grads.length] };
    setModQueue((prev) => [...prev, newTrack]);
    addHistory("propose", newTrack, 0);
    showToast(`«${uploadTitle.trim()}» отправлен на модерацию`);
    setActiveTab("moderation");
    setUploadTitle(""); setUploadArtist(""); setChosenFile(null);
    setModalAdd(false);
  };

  const copyInviteLink = () => {
    const code = playlist.inviteCode || "ZVUK26";
    const shareUrl = `${window.location.origin}/community/${playlist.id || currentRoomId || ""}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    showToast(`Ссылка с кодом ${code} скопирована!`);
  };

  const filtered = sortedTracks(tracks);
  const filteredLib = LIBRARY_TRACKS.filter((t) =>
    !libSearch || t.title.toLowerCase().includes(libSearch.toLowerCase()) || t.artist.toLowerCase().includes(libSearch.toLowerCase())
  );

  return (
    <div className="w-full pb-32">

      {/* ═══ ШАПКА ПЛЕЙЛИСТА ═════════════════════════════════════════════════ */}
      <div className="relative rounded-2xl overflow-hidden mb-6 bg-[#171717] border border-[#262626]">

        {/* Фоновая плашка и центрированная обложка */}
        <div className="relative h-28 bg-gradient-to-br from-[#1c1c1c] to-[#111]">
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at 50% 120%, rgba(163,230,53,0.06) 0%, transparent 70%)" }} />

          {/* Центрированная аватарка плейлиста */}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-10 z-10">
            <div
              className={cn(
                "group relative w-[80px] h-[80px] rounded-2xl flex items-center justify-center shadow-xl ring-4 ring-[#171717] bg-gradient-to-br cursor-pointer overflow-hidden transition-transform",
                playlist.customCover ? "bg-cover bg-center" : playlist.gradient
              )}
              style={playlist.customCover ? { backgroundImage: `url(${playlist.customCover})` } : undefined}
              title="Нажмите, чтобы сменить обложку"
              onClick={() => avatarInputRef.current?.click()}
            >
              {!playlist.customCover && (
                <Music size={32} className="text-white/60 transition-transform group-hover:scale-90" />
              )}

              {/* Кнопка смены обложки, появляющаяся ТОЛЬКО при наведении на аватарку */}
              <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                <div className="w-8 h-8 rounded-full bg-[#1c231d] border border-[#2e402d] text-white flex items-center justify-center shadow-md">
                  <Plus size={16} className="text-[#a3e635]" strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-medium text-neutral-200">Обложка</span>
              </div>

              {/* Скрытый инпут для выбора файла обложки */}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
          </div>
        </div>

        {/* Мета-информация под обложкой */}
        <div className="pt-12 pb-5 px-5 text-center">
          <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-1">🎓 Сообщество · {playlist.faculty || "ИИНОД-82"}</p>
          <h1 className="text-xl font-extrabold text-white mb-3 leading-tight">{playlist.name}</h1>

          {/* Аватарки участников + статус */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
            <div className="flex">
              {membersList.slice(0, 5).map((m, i) => (
                <div key={m.id} className="w-6 h-6 rounded-full border-2 border-[#171717] flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: m.avatarColor, marginLeft: i === 0 ? 0 : -7 }}>
                  {m.avatar}
                </div>
              ))}
            </div>
            <span className="text-xs text-neutral-400">{playlist.memberCount} участников</span>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-950/30 border border-red-900/40 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Голосование активно
            </span>
          </div>

          {/* Таймер ротации и вспомогательные кнопки */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400 bg-neutral-900/70 border border-neutral-800 rounded-lg px-3 py-1.5">
              <span className="text-[#a3e635]">⏱</span>
              До ротации: <strong className="text-white tabular-nums ml-1">{countdown}</strong>
            </span>
            <button
              onClick={() => setModalInvite(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 border border-neutral-800 text-neutral-300 text-xs font-medium hover:bg-neutral-800 hover:text-white transition-colors cursor-pointer"
            >
              <Users size={13} className="text-[#a3e635]" /> Пригласить
            </button>
            <button
              onClick={() => setModalHistory(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 border border-neutral-800 text-neutral-300 text-xs font-medium hover:bg-neutral-800 hover:text-white transition-colors cursor-pointer"
            >
              <History size={13} className="text-[#a3e635]" /> История
            </button>
            {/* Управление администраторами доступно создателю */}
            {playlist.creatorId === user.id && (
              <button
                onClick={() => setModalAdmins(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 border border-neutral-800 text-neutral-300 text-xs font-medium hover:bg-neutral-800 hover:text-white transition-colors cursor-pointer"
              >
                <Crown size={13} className="text-[#a3e635]" /> Администраторы
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ ПАНЕЛЬ УПРАВЛЕНИЯ ════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {/* Родительский элемент для кнопок действий и плашки "Владелец" */}
        <div className="flex items-center gap-2.5">
          {/* Кнопка "Слушать всё" — стильная темная палитра с белым текстом и зеленым акцентом */}
          <button
            onClick={() => { const s = sortedTracks(tracks); if (s.length) playTrack(s[0].id); }}
            className="h-10 px-4 rounded-xl bg-[#1c231d] border border-[#2e402d] hover:bg-[#243025] hover:border-[#3c543b] text-white font-medium text-sm transition-all inline-flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Play size={15} className="fill-[#a3e635] text-[#a3e635]" />
            <span className="text-white font-medium">Слушать всё</span>
          </button>

          {/* Кнопка "Предложить трек" в том же стиле */}
          <button
            onClick={() => setModalAdd(true)}
            className="h-10 px-4 rounded-xl bg-[#1c231d] border border-[#2e402d] hover:bg-[#243025] hover:border-[#3c543b] text-white font-medium text-sm transition-all inline-flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Plus size={16} className="text-[#a3e635]" />
            <span className="text-white font-medium">Предложить трек</span>
          </button>

          {/* Элемент "Владелец" / "Модератор" — в точности такого же размера и формата (h-10, px-4, rounded-xl, text-sm) */}
          {canModerate && (
            <span className="h-10 px-4 rounded-xl bg-[#171717] border border-[#262626] text-sm font-medium inline-flex items-center gap-2 select-none">
              <ShieldCheck size={16} className="text-[#a3e635]" />
              <span className="text-white">{playlist.creatorId === user.id ? "Владелец" : "Модератор"}</span>
            </span>
          )}
        </div>

        {/* Вкладки: Очередь и Модерация */}
        <div className="flex bg-[#171717] border border-[#262626] rounded-xl p-1 gap-1">
          {[
            { key: "queue", label: "В очереди (Рейтинг)" },
            { key: "moderation", label: "На модерации", count: modQueue.length },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === key ? "bg-[#262626] text-white" : "text-neutral-400 hover:text-neutral-200"
              )}
            >
              {label}
              {count > 0 && (
                <span className="text-[11px] font-bold bg-[#1c231d] border border-[#2e402d] text-[#a3e635] rounded-full px-1.5 min-w-[18px] text-center">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ ВКЛАДКА: В ОЧЕРЕДИ (РЕЙТИНГ) ════════════════════════════════════ */}
      {activeTab === "queue" && (
        <div className="flex flex-col gap-1">
          {filtered.map((track, idx) => (
            <TrackRow
              key={track.id}
              track={track}
              rank={idx + 1}
              isPlaying={player.trackId === track.id}
              canModerate={canModerate}
              onPlay={playTrack}
              onVote={handleVote}
              onFavorite={handleToggleFavorite}
              onDelete={deleteTrack}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-neutral-600">
              <Music size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">В очереди нет треков</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ ВКЛАДКА: НА МОДЕРАЦИИ ═══════════════════════════════════════════ */}
      {activeTab === "moderation" && (
        <div className="flex flex-col gap-2">
          {!canModerate && modQueue.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#171717] border border-[#262626] text-neutral-400 text-sm mb-1">
              <ShieldCheck size={15} className="shrink-0 text-neutral-500" />
              Только модераторы и владелец могут одобрять или отклонять треки.
            </div>
          )}
          {modQueue.map((track) => (
            <ModRow
              key={track.id}
              track={track}
              canModerate={canModerate}
              onApprove={approveTrack}
              onReject={rejectTrack}
            />
          ))}
          {modQueue.length === 0 && (
            <div className="text-center py-16 text-neutral-600">
              <CheckCircle size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Нет треков на модерации</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ МИНИ-ПЛЕЕР ═════════════════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0e0e0e]/95 backdrop-blur-xl border-t border-[#262626]">
        <div className="h-0.5 w-full bg-neutral-800 cursor-pointer" onClick={seekPlayer}>
          <div className="h-full bg-[#a3e635] transition-[width] duration-500" style={{ width: `${player.progress}%` }} />
        </div>
        <div className="max-w-none px-6 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-[160px]">
            {currentTrack ? (
              <TrackThumb gradient={currentTrack.gradient} size={40} />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
                <Music size={16} className="text-neutral-600" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate max-w-[160px]">{currentTrack?.title ?? "—"}</p>
              <p className="text-xs text-neutral-400 truncate max-w-[160px]">{currentTrack?.artist ?? "Выберите трек"}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={playerPrev} className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-neutral-800 cursor-pointer">
              <SkipBack size={16} />
            </button>
            <button
              onClick={togglePlay}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[#1c231d] border border-[#2e402d] text-white hover:bg-[#243025] hover:border-[#3c543b] transition-colors cursor-pointer"
            >
              {player.playing ? <Pause size={17} className="fill-[#a3e635] text-[#a3e635]" /> : <Play size={17} className="fill-[#a3e635] text-[#a3e635] ml-0.5" />}
            </button>
            <button onClick={playerNext} className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-neutral-800 cursor-pointer">
              <SkipForward size={16} />
            </button>
          </div>

          <span className="text-xs text-neutral-500 tabular-nums shrink-0">{fmtTime(player.elapsed)} / 4:00</span>
          <NextBadge tracks={tracks} currentId={player.trackId} />
        </div>
      </div>

      {/* ═══ ТОСТ-УВЕДОМЛЕНИЯ ═══════════════════════════════════════════════ */}
      {toast && (
        <div className="fixed top-5 right-5 z-[200] bg-[#1a1a1a] border border-[#2e2e2e] text-white text-sm font-medium px-4 py-3 rounded-xl shadow-2xl">
          {toast}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
           МОДАЛЬНОЕ ОКНО 1: ПРЕДЛОЖИТЬ ТРЕК
          ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={modalAdd} onOpenChange={setModalAdd}>
        <DialogContent className="sm:max-w-[540px] bg-[#171717] border-[#262626] text-white max-h-[85vh] overflow-y-auto">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1c231d] border border-[#2e4730] text-[#a3e635]">
            <Plus size={18} />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#a3e635] m-0">НОВЫЙ ТРЕК</p>
          <DialogTitle className="text-xl font-bold text-white m-0">Предложить трек</DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-neutral-400 m-0">Выберите трек из библиотеки или загрузите файл — он попадёт на модерацию.</p>
          </DialogDescription>

          <div className="flex bg-[#1c1c1c] border border-[#262626] rounded-xl p-1 gap-1 mt-1">
            {[["library","Из библиотеки"],["file","Загрузить файл"]].map(([tab, label]) => (
              <button key={tab} onClick={() => setAddTab(tab)}
                className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer",
                  addTab === tab ? "bg-[#262626] text-white" : "text-neutral-400 hover:text-neutral-200")}>
                {label}
              </button>
            ))}
          </div>

          {addTab === "library" && (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input type="text" placeholder="Поиск..." value={libSearch} onChange={(e) => setLibSearch(e.target.value)}
                  className="w-full bg-[#1c1c1c] border border-[#262626] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-[#2e402d] transition-colors" />
              </div>
              <div className="flex flex-col gap-1">
                {filteredLib.length === 0 && <p className="text-center py-6 text-sm text-neutral-600">Ничего не найдено</p>}
                {filteredLib.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[#1c1c1c] transition-colors">
                    <TrackThumb gradient={t.gradient} size={38} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                      <p className="text-xs text-neutral-400">{t.artist} · {t.duration}</p>
                    </div>
                    <button onClick={() => addFromLibrary(t.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1c231d] border border-[#2e402d] text-white text-xs font-semibold hover:bg-[#243025] transition-colors shrink-0 cursor-pointer">
                      <Plus size={12} className="text-[#a3e635]" /> Добавить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {addTab === "file" && (
            <div className="flex flex-col gap-4">
              <label className="border-2 border-dashed border-[#303030] rounded-2xl p-8 text-center cursor-pointer hover:border-[#2e402d] hover:bg-[#1c231d]/20 transition-all"
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("audio/")) { setChosenFile(f); if (!uploadTitle) setUploadTitle(f.name.replace(/\.[^.]+$/,"")); } }}>
                <Upload size={28} className="mx-auto mb-2 text-neutral-500" />
                <p className="text-sm font-semibold text-neutral-300 mb-1">{chosenFile ? chosenFile.name : "Перетащите аудиофайл"}</p>
                <p className="text-xs text-neutral-500">или нажмите для выбора</p>
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (f) { setChosenFile(f); if (!uploadTitle) setUploadTitle(f.name.replace(/\.[^.]+$/,"")); } }} />
              </label>
              {chosenFile && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[#1c231d]/70 border border-[#2e402d] rounded-xl text-xs text-white">
                  <Music size={13} className="text-[#a3e635]" /> {chosenFile.name}
                </div>
              )}
              <div className="flex flex-col gap-3">
                {[
                  { label: "Название трека *", value: uploadTitle, set: setUploadTitle, placeholder: "Введите название..." },
                  { label: "Исполнитель *",   value: uploadArtist,   set: setUploadArtist,   placeholder: "Имя исполнителя..." },
                  { label: "Предложено от",   value: uploadProposer, set: setUploadProposer, placeholder: "@вы" },
                ].map(({ label, value, set, placeholder }) => (
                  <div key={label}>
                    <label className="block text-xs font-semibold text-neutral-400 mb-1.5">{label}</label>
                    <input type="text" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                      className="w-full bg-[#1c1c1c] border border-[#262626] rounded-xl px-3 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-[#2e402d] transition-colors" />
                  </div>
                ))}
                <button
                  onClick={uploadTrack}
                  className="w-full py-2.5 rounded-xl bg-[#1c231d] border border-[#2e402d] text-white hover:bg-[#243025] hover:border-[#3c543b] font-medium text-sm transition-colors mt-1 inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload size={15} className="text-[#a3e635]" /> Отправить на модерацию
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════
           МОДАЛЬНОЕ ОКНО 2: ПРИГЛАСИТЬ
          ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={modalInvite} onOpenChange={setModalInvite}>
        <DialogContent className="sm:max-w-[460px] bg-[#171717] border-[#262626] text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1c231d] border border-[#2e4730] text-[#a3e635]">
            <Users size={18} />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#a3e635] m-0">ВМЕСТЕ ГРОМЧЕ</p>
          <DialogTitle className="text-xl font-bold text-white m-0">Пригласить участников</DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-neutral-400 m-0">Поделись ссылкой или кодом — участники смогут слушать и голосовать.</p>
          </DialogDescription>
          <div className="flex flex-col gap-4 mt-1">
            <div>
              <label className="block text-xs font-semibold text-neutral-400 mb-1.5">Ссылка-приглашение</label>
              <div className="flex items-center gap-2">
                <input readOnly value={`${window.location.origin}/community/${playlist.id || currentRoomId || ""}`}
                  className="flex-1 bg-[#1c1c1c] border border-[#262626] rounded-xl px-3 py-2.5 text-sm text-[#a3e635] font-mono outline-none" />
                <button onClick={copyInviteLink}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#1c231d] border border-[#2e402d] text-white text-sm font-semibold hover:bg-[#243025] transition-colors shrink-0 cursor-pointer">
                  {copiedLink ? <Check size={14} className="text-[#a3e635]" /> : <Copy size={14} className="text-[#a3e635]" />}
                  {copiedLink ? "Скопировано" : "Копировать"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-400 mb-1.5">Код доступа</label>
              <div className="flex items-center justify-between bg-[#1c231d] border border-[#2e402d] rounded-xl px-4 py-3">
                <span className="text-2xl font-black tracking-widest text-white">{playlist.inviteCode || "ZVUK26"}</span>
                <span className="text-xs text-neutral-400">Введи в приложении</span>
              </div>
            </div>
            <div className="rounded-xl bg-neutral-900/60 border border-[#262626] p-4 flex items-center gap-4">
              <div className="shrink-0 bg-[#1c1c1c] rounded-xl p-2 border border-[#262626]">
                <svg width="72" height="72" viewBox="0 0 21 21">
                  {[
                    [1,1,1,1,1,1,1,0,1,0,0,0,1,1,1,1,1,1,1,0,0],
                    [1,0,0,0,0,0,1,0,0,1,0,0,1,0,0,0,0,0,1,0,0],
                    [1,0,1,1,1,0,1,0,1,0,0,1,0,1,0,1,1,1,0,1,0],
                    [1,0,1,1,1,0,1,0,0,1,0,0,1,0,0,1,1,1,0,1,0],
                    [1,0,0,0,0,0,1,0,1,0,0,0,1,0,0,0,0,0,1,0,0],
                    [1,1,1,1,1,1,1,0,1,0,1,0,1,1,1,1,1,1,1,0,0],
                    [0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0],
                    [1,0,1,1,0,1,1,0,0,0,1,0,1,1,0,1,0,1,0,1,0],
                    [0,1,0,1,0,0,0,1,0,1,0,0,0,0,1,0,1,0,1,0,1],
                    [1,0,1,0,1,0,1,0,1,0,1,1,0,1,0,1,0,0,1,0,0],
                    [0,0,0,0,0,0,0,0,1,1,0,0,1,0,0,0,1,0,1,0,1],
                    [1,1,1,1,1,1,1,0,0,0,1,0,0,1,0,1,1,1,1,0,0],
                    [1,0,0,0,0,0,1,0,1,0,0,1,1,0,1,0,1,0,0,0,1],
                    [1,0,1,1,1,0,1,0,0,0,1,0,0,1,0,1,0,1,0,1,0],
                    [1,0,1,1,1,0,1,0,1,0,0,1,0,0,1,0,1,0,0,0,1],
                    [1,0,0,0,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0],
                    [1,1,1,1,1,1,1,0,0,0,0,1,0,1,0,1,0,1,0,1,0],
                  ].map((row, r) => row.map((cell, c) => cell ? (
                    <rect key={`${r}-${c}`} x={c} y={r} width={0.85} height={0.85} fill="#a3e635" rx={0.1} />
                  ) : null))}
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-white">Сканируй и присоединяйся</p>
                <p className="text-xs text-neutral-400 mt-1 leading-snug">QR-код ведёт прямо в плейлист сообщества.</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════
           МОДАЛЬНОЕ ОКНО 3: ИСТОРИЯ
          ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={modalHistory} onOpenChange={setModalHistory}>
        <DialogContent className="sm:max-w-[520px] bg-[#171717] border-[#262626] text-white max-h-[85vh] overflow-y-auto">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-400">
            <History size={18} />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 m-0">ЖУРНАЛ</p>
          <DialogTitle className="text-xl font-bold text-white m-0">История голосований</DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-neutral-400 m-0">Все действия участников в реальном времени.</p>
          </DialogDescription>
          <div className="mt-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Активность сейчас</p>
            {history.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-6">Нет действий. Проголосуйте или добавьте трек!</p>
            ) : (
              <div className="flex flex-col max-h-52 overflow-y-auto">
                {history.slice(0, 30).map((h) => (
                  <div key={h.id} className="flex items-start gap-2.5 py-2.5 border-b border-[#1f1f1f] last:border-0">
                    <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: h.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-neutral-300">
                        <span className="mr-1">{h.symbol}</span>{h.label}:{" "}
                        <span className="font-semibold text-white">«{h.track}»</span>
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">{h.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Итоги прошлой ротации</p>
            <div className="flex flex-col gap-2">
              {topHistory.map((t, i) => {
                const medals = ["🥇","🥈","🥉"];
                const colors = ["#f59e0b","#9ca3af","#cd7c5f"];
                return (
                  <div key={t.rank} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1c1c1c] border border-[#262626]">
                    <span className="text-lg shrink-0">{medals[i]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                      <p className="text-xs text-neutral-400">{t.artist}</p>
                    </div>
                    <span className="text-sm font-bold shrink-0" style={{ color: colors[i] }}>+{t.votes}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════
           МОДАЛЬНОЕ ОКНО 4: УПРАВЛЕНИЕ АДМИНИСТРАТОРАМИ (ВЛАДЕЛЕЦ)
          ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={modalAdmins} onOpenChange={setModalAdmins}>
        <DialogContent className="sm:max-w-[460px] bg-[#171717] border-[#262626] text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1c231d] border border-[#2e4730] text-[#a3e635]">
            <Crown size={18} />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#a3e635] m-0">УПРАВЛЕНИЕ</p>
          <DialogTitle className="text-xl font-bold text-white m-0">Администраторы плейлиста</DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-neutral-400 m-0">
              Администраторы могут одобрять и отклонять треки на модерации, а также удалять треки из очереди.
              Только создатель плейлиста может управлять правами.
            </p>
          </DialogDescription>
          <div className="flex flex-col gap-2 mt-2">
            {membersList.map((m) => {
              const isOwner = m.id === playlist.creatorId;
              const isAdmin = admins.includes(m.id);
              return (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1c1c1c] border border-[#262626]">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ background: m.avatarColor }}>
                    {m.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{m.name}</p>
                    <p className="text-xs text-neutral-400">{m.username}</p>
                  </div>
                  {isOwner ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-[#a3e635] bg-[#1c231d] border border-[#2e402d] rounded-lg px-2.5 py-1 shrink-0">
                      <Crown size={12} /> Владелец
                    </span>
                  ) : (
                    <button
                      onClick={() => toggleAdmin(m.id)}
                      className={cn(
                        "flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors shrink-0 cursor-pointer",
                        isAdmin
                          ? "bg-[#1c231d] border-[#2e402d] text-[#a3e635] hover:bg-red-950/30 hover:border-red-800/40 hover:text-red-400"
                          : "bg-[#1c1c1c] border-[#303030] text-neutral-400 hover:bg-[#1c231d] hover:border-[#2e402d] hover:text-[#a3e635]"
                      )}
                    >
                      {isAdmin ? <><ShieldCheck size={12} /> Модератор</> : <><UserPlus size={12} /> Назначить</>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
