import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Flame,
  PartyPopper,
  Play,
  Pause,
  Copy,
  Check,
  ExternalLink,
  Search,
  Users,
  Crown,
  Sparkles,
  Clock,
  Music,
  Heart,
  Radio,
  SkipBack,
  SkipForward,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { audioService } from "@/lib/audioService";

function fmt2(n) {
  return String(n).padStart(2, "0");
}

function fmtTimer(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${fmt2(h)}:${fmt2(m)}:${fmt2(s)}`;
}

export function PartyPage() {
  const { id: routeRoomId } = useParams();
  const { user: authUser } = useAuth();

  const [currentRoomId, setCurrentRoomId] = useState(routeRoomId || null);
  const [partyStatus, setPartyStatus] = useState({
    is_active: false,
    name: "Вечеринка",
    started_at: null,
    duration_seconds: 0,
    members_count: 0,
    banger_track: null,
    hitmaker: null,
    tracks: [],
    playback: null,
    can_moderate: false,
  });

  const [tracks, setTracks] = useState([]);
  const [elapsedTimer, setElapsedTimer] = useState(0);
  const [isCopied, setIsCopied] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // Modal start party
  const [modalStart, setModalStart] = useState(false);
  const [modalStop, setModalStop] = useState(false);
  const [partyNameInput, setPartyNameInput] = useState("Хакатон Night 🔥");

  // Player state
  const [player, setPlayer] = useState({
    trackId: null,
    playing: false,
    progress: 0,
    elapsed: 0,
  });

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Unlock audio on click
  useEffect(() => {
    const unlock = () => audioService.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Resolve active community if not in route
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
  }, [routeRoomId]);

  // Load party status from backend
  const fetchPartyStatus = useCallback((roomId) => {
    if (!roomId) return;
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`/api/communities/${roomId}/party/status`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setPartyStatus(data);
        if (Array.isArray(data.tracks)) {
          setTracks(data.tracks);
        }
        if (data.is_active && data.started_at) {
          const diff = Math.max(
            0,
            Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000)
          );
          setElapsedTimer(diff);
        } else {
          setElapsedTimer(0);
        }

        // Sync playback state if available
        if (data.playback) {
          if (data.playback.state === "playing" && data.playback.current_track_id) {
            const tr = data.tracks?.find((t) => String(t.id) === String(data.playback.current_track_id));
            if (tr) {
              setPlayer((p) => ({ ...p, trackId: tr.id, playing: true }));
              if (audioService.currentTrack?.id !== tr.id || !audioService.isPlaying) {
                audioService.play({
                  ...tr,
                  room_id: roomId,
                  library_key: tr.library_key || "dawn",
                }).catch(() => {});
              }
            }
          } else if (data.playback.state === "paused" && audioService.isPlaying) {
            audioService.pause();
            setPlayer((p) => ({ ...p, playing: false }));
          }
        }
      })
      .catch(() => {});
  }, []);

  // WebSocket for real-time room & party updates
  useEffect(() => {
    if (!currentRoomId) return;
    fetchPartyStatus(currentRoomId);

    let ws = null;
    let reconnectTimeout = null;
    let isMounted = true;

    function connectWs() {
      if (!isMounted) return;
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/api/ws/communities/${currentRoomId}`;
        ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (
              data?.type === "party_status_changed" ||
              data?.action === "party_status_changed" ||
              data?.type === "room_updated"
            ) {
              fetchPartyStatus(currentRoomId);
            }
          } catch {}
        };

        ws.onclose = () => {
          if (isMounted) reconnectTimeout = setTimeout(connectWs, 2000);
        };
        ws.onerror = () => {
          if (ws) ws.close();
        };
      } catch {
        if (isMounted) reconnectTimeout = setTimeout(connectWs, 2000);
      }
    }

    connectWs();
    const pollInterval = setInterval(() => fetchPartyStatus(currentRoomId), 3000);

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pollInterval) clearInterval(pollInterval);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [currentRoomId, fetchPartyStatus]);

  // Live timer tick every 1s
  useEffect(() => {
    if (!partyStatus.is_active || !partyStatus.started_at) return;
    const interval = setInterval(() => {
      const diff = Math.max(
        0,
        Math.floor((Date.now() - new Date(partyStatus.started_at).getTime()) / 1000)
      );
      setElapsedTimer(diff);
    }, 1000);
    return () => clearInterval(interval);
  }, [partyStatus.is_active, partyStatus.started_at]);

  // Audio subscription
  useEffect(() => {
    const unsub = audioService.subscribe((state) => {
      if (state.track) {
        setPlayer({
          trackId: state.track.id,
          playing: state.isPlaying,
          progress: state.progress,
          elapsed: state.seconds,
        });
      }
    });
    return () => unsub();
  }, []);

  // Start Party
  const handleStartParty = async () => {
    if (!currentRoomId) return;
    try {
      const token = localStorage.getItem("token");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(`/api/communities/${currentRoomId}/party/start`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: partyNameInput.trim() || "Вечеринка" }),
      });
      if (res.ok) {
        setModalStart(false);
        showToast("🔥 Вечеринка началась! Эфир активен для всех.");
        fetchPartyStatus(currentRoomId);
      } else {
        const err = await res.json();
        showToast(err.detail || "Ошибка запуска вечеринки");
      }
    } catch {
      showToast("Не удалось подключиться к серверу");
    }
  };

  // Stop Party
  const handleStopParty = async () => {
    if (!currentRoomId) return;
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/communities/${currentRoomId}/party/stop`, {
        method: "POST",
        headers,
      });
      if (res.ok) {
        setModalStop(false);
        showToast("⏹ Вечеринка завершена.");
        fetchPartyStatus(currentRoomId);
      } else {
        const err = await res.json();
        showToast(err.detail || "Ошибка остановки");
      }
    } catch {
      showToast("Не удалось подключиться к серверу");
    }
  };

  // Export tracklist for Yandex Music
  const handleExportYandex = async () => {
    if (!tracks || tracks.length === 0) {
      showToast("В плейлисте пока нет треков для экспорта");
      return;
    }

    // Format: "Исполнитель - Трек\n"
    const textToCopy = tracks
      .map((t) => `${t.artist.trim()} - ${t.title.trim()}`)
      .join("\n");

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setIsCopied(true);
      showToast(`✓ Скопировано ${tracks.length} треков в формате Яндекс Музыки!`);
      setTimeout(() => setIsCopied(false), 3000);
    } catch {
      showToast("Ошибка при копировании в буфер обмена");
    }
  };

  // Playback control
  const handlePlayTrack = async (track) => {
    if (!partyStatus.can_moderate) {
      if (player.trackId === track.id && player.playing) {
        audioService.unlock();
        showToast("🎧 Вы слушаете общий эфир вечеринки");
        return;
      }
      showToast("⚠️ Управлять воспроизведением может только хост");
      return;
    }

    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    if (player.trackId === track.id && player.playing) {
      audioService.pause();
      setPlayer((p) => ({ ...p, playing: false }));
      await fetch(`/api/communities/${currentRoomId}/tracks/${track.id}/pause`, {
        method: "POST",
        headers,
      }).catch(() => {});
    } else {
      audioService.play({
        ...track,
        room_id: currentRoomId,
        library_key: track.library_key || "dawn",
      });
      setPlayer({ trackId: track.id, playing: true, progress: 0, elapsed: 0 });
      await fetch(`/api/communities/${currentRoomId}/tracks/${track.id}/play`, {
        method: "POST",
        headers,
      }).catch(() => {});
    }
  };

  // Vote
  const handleVote = async (trackId, dir) => {
    const t = tracks.find((x) => x.id === trackId);
    if (!t) return;
    const currentVote = t.my_vote ?? t.userVote ?? 0;
    const nextVote = currentVote === dir ? 0 : dir;

    // Optimistic update
    setTracks((prev) =>
      prev.map((x) =>
        x.id === trackId
          ? {
              ...x,
              my_vote: nextVote,
              vote_score: (x.vote_score || 0) + (nextVote - currentVote),
              score: (x.score || 0) + (nextVote - currentVote),
            }
          : x
      )
    );

    try {
      const token = localStorage.getItem("token");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      await fetch(`/api/communities/${currentRoomId}/tracks/${trackId}/vote`, {
        method: "POST",
        headers,
        body: JSON.stringify({ value: nextVote }),
      });
      fetchPartyStatus(currentRoomId);
    } catch {}
  };

  const currentPlayingTrack = tracks.find((t) => t.id === player.trackId) || null;

  return (
    <div className="w-full pb-36 max-w-7xl mx-auto">
      {/* ═══ ТОП БАР ВЕЧЕРИНКИ ════════════════════════════════════════════════ */}
      <div className="relative rounded-3xl overflow-hidden mb-6 bg-gradient-to-br from-[#1a1311] via-[#141414] to-[#0f1510] border border-[#2e2624] p-6 shadow-2xl">
        <div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full pointer-events-none opacity-20"
          style={{
            background: partyStatus.is_active
              ? "radial-gradient(circle, #f97316 0%, #ef4444 40%, transparent 70%)"
              : "radial-gradient(circle, #a3e635 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 border transition-all shadow-xl",
                partyStatus.is_active
                  ? "bg-gradient-to-br from-amber-500 to-rose-600 border-amber-400/40 text-white shadow-orange-500/20"
                  : "bg-[#1c1c1c] border-[#2e2e2e] text-neutral-500"
              )}
            >
              <Flame size={32} className={partyStatus.is_active ? "animate-pulse" : ""} />
            </div>

            <div>
              <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                {partyStatus.is_active ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-black tracking-widest uppercase animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-ping inline-block" />
                    LIVE · В ЭФИРЕ
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400 text-xs font-semibold tracking-wider uppercase">
                    ПАУЗА / ОЖИДАНИЕ
                  </span>
                )}

                <span className="inline-flex items-center gap-1 text-xs text-neutral-400 bg-neutral-900/80 px-2.5 py-1 rounded-lg border border-neutral-800">
                  <Users size={12} className="text-[#a3e635]" />
                  {partyStatus.members_count} тусеров
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
                {partyStatus.name || "Вечеринка"}
                {partyStatus.is_active && (
                  <span className="text-base font-normal text-amber-400">⚡</span>
                )}
              </h1>
            </div>
          </div>

          {/* Таймер и кнопка управления */}
          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
            <div className="bg-[#171717] border border-[#2a2a2a] rounded-2xl px-5 py-3 text-center min-w-[130px]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-0.5 flex items-center justify-center gap-1">
                <Clock size={11} className={partyStatus.is_active ? "text-amber-400" : ""} />
                Таймер тусовки
              </p>
              <p className={cn("text-2xl font-mono font-black tabular-nums", partyStatus.is_active ? "text-white" : "text-neutral-500")}>
                {fmtTimer(elapsedTimer)}
              </p>
            </div>

            {partyStatus.can_moderate && (
              <div>
                {!partyStatus.is_active ? (
                  <button
                    onClick={() => setModalStart(true)}
                    className="h-12 px-6 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-400 hover:to-rose-500 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-orange-600/30 flex items-center gap-2 cursor-pointer active:scale-95"
                  >
                    <PartyPopper size={18} />
                    Запустить тусовку
                  </button>
                ) : (
                  <button
                    onClick={() => setModalStop(true)}
                    className="h-12 px-5 rounded-2xl bg-red-950/40 hover:bg-red-900/60 border border-red-700/50 text-red-300 font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                  >
                    Завершить тусовку
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ ОСНОВНОЙ КОНТЕНТ: 2 КОЛОНКИ ══════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ЛЕВАЯ КОЛОНКА (5 из 12) — Экспорт в Яндекс Музыку и номинации */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* КАРТОЧКА 1: ЭКСПОРТ ДЛЯ ЯНДЕКС МУЗЫКИ */}
          <div className="rounded-3xl bg-[#171717] border border-[#262626] p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#221c17] border border-[#402d1d] flex items-center justify-center text-amber-400">
                <Music size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400">ЭКСПОРТ СЕССИИ</p>
                <h3 className="text-lg font-bold text-white">Забрать плейлист</h3>
              </div>
            </div>

            <p className="text-xs text-neutral-400 mb-5 leading-relaxed">
              Скопируйте весь треклист вечеринки в один клик. Формат готов для мгновенного переноса в Яндекс Музыку.
            </p>

            <button
              onClick={handleExportYandex}
              className={cn(
                "w-full py-4 px-5 rounded-2xl font-bold text-sm tracking-wide transition-all shadow-xl flex items-center justify-center gap-3 cursor-pointer select-none active:scale-98",
                isCopied
                  ? "bg-[#1c231d] border border-[#2e402d] text-[#a3e635]"
                  : "bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:opacity-95 text-white shadow-orange-500/20"
              )}
            >
              {isCopied ? (
                <>
                  <Check size={18} className="text-[#a3e635]" />
                  <span>Скопировано в буфер!</span>
                </>
              ) : (
                <>
                  <Copy size={18} />
                  <span>Скопировать для Яндекс Музыки</span>
                </>
              )}
            </button>

            <div className="mt-4 pt-4 border-t border-[#242424] flex items-center justify-between text-xs text-neutral-500">
              <span>{tracks.length} треков готово</span>
              <a
                href="https://music.yandex.ru"
                target="_blank"
                rel="noreferrer"
                className="text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1 transition-colors"
              >
                Открыть Яндекс Музыку <ExternalLink size={12} />
              </a>
            </div>
          </div>

          {/* КАРТОЧКА 2: БЭНГЕР ВЕЧЕРИНКИ */}
          <div className="rounded-3xl bg-[#171717] border border-[#262626] p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-orange-400 bg-orange-950/40 border border-orange-800/40 px-3 py-1 rounded-full">
                <Flame size={13} /> Бэнгер вечеринки
              </span>
              <span className="text-xs text-neutral-500">№1 по баллам</span>
            </div>

            {partyStatus.banger_track ? (
              <div className="flex items-center gap-4 bg-[#121212] border border-[#242424] rounded-2xl p-4">
                <div
                  className="w-16 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-rose-600 flex items-center justify-center shrink-0 shadow-lg cursor-pointer group relative overflow-hidden"
                  onClick={() => handlePlayTrack(partyStatus.banger_track)}
                >
                  <Music size={24} className="text-white/80 group-hover:scale-90 transition-transform" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Play size={20} className="fill-white text-white ml-0.5" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-white truncate">
                    {partyStatus.banger_track.title}
                  </p>
                  <p className="text-xs text-neutral-400 truncate">
                    {partyStatus.banger_track.artist}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Предложил:{" "}
                    <span className="text-neutral-300 font-medium">
                      {partyStatus.banger_track.contributor || "@участник"}
                    </span>
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-lg font-black text-[#a3e635]">
                    +{partyStatus.banger_track.vote_score ?? partyStatus.banger_track.score ?? 0}
                  </span>
                  <p className="text-[10px] text-neutral-500">голосов</p>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-neutral-500 text-sm">
                Пока нет проголосованных треков
              </div>
            )}
          </div>

          {/* КАРТОЧКА 3: ГЛАВНЫЙ ХИТМЕЙКЕР */}
          <div className="rounded-3xl bg-[#171717] border border-[#262626] p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-950/40 border border-amber-800/40 px-3 py-1 rounded-full">
                <Crown size={13} /> Главный Хитмейкер
              </span>
              <span className="text-xs text-neutral-500">Любимец публики</span>
            </div>

            {partyStatus.hitmaker ? (
              <div className="flex items-center gap-4 bg-[#121212] border border-[#242424] rounded-2xl p-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-neutral-950 font-black text-xl flex items-center justify-center shrink-0 shadow-lg">
                  {partyStatus.hitmaker.avatar || "У"}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-white truncate flex items-center gap-1.5">
                    {partyStatus.hitmaker.name}
                    <Sparkles size={14} className="text-amber-400 shrink-0" />
                  </p>
                  <p className="text-xs text-neutral-400">
                    Добавил треков: {partyStatus.hitmaker.tracks_count}
                  </p>
                  <p className="text-[11px] text-[#a3e635] mt-0.5 font-semibold">
                    Набрал суммарно: +{partyStatus.hitmaker.total_score} голосов
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-neutral-500 text-sm">
                Предлагайте треки, чтобы стать хитмейкером
              </div>
            )}
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА (7 из 12) — Живой плейлист тусовки с кнопкой Яндекс Музыки */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="rounded-3xl bg-[#171717] border border-[#262626] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#a3e635]">ЖИВОЙ ЧАРТ</p>
                <h2 className="text-xl font-bold text-white">Плейлист текущей тусовки</h2>
              </div>

              <Link
                to={currentRoomId ? `/community/${currentRoomId}` : "/playlist"}
                className="text-xs font-semibold text-neutral-400 hover:text-white transition-colors bg-neutral-900 px-3 py-1.5 rounded-xl border border-neutral-800"
              >
                Все треки сообщества →
              </Link>
            </div>

            {/* Список треков */}
            <div className="flex flex-col gap-2">
              {tracks.map((track, idx) => {
                const isPlaying = player.trackId === track.id && player.playing;
                const medals = ["🥇", "🥈", "🥉"];
                const yandexQuery = encodeURIComponent(`${track.artist} ${track.title}`);
                const yandexUrl = `https://music.yandex.ru/search?text=${yandexQuery}`;

                return (
                  <div
                    key={track.id}
                    className={cn(
                      "flex items-center gap-3 px-3.5 py-3 rounded-2xl border transition-all group",
                      isPlaying
                        ? "bg-[#1c231d] border-[#2e402d]"
                        : "bg-[#141414] border-[#242424] hover:bg-[#1a1a1a] hover:border-[#2e2e2e]"
                    )}
                  >
                    {/* Ранг / Медаль */}
                    <div className="w-6 text-center shrink-0">
                      {idx < 3 ? (
                        <span className="text-base select-none">{medals[idx]}</span>
                      ) : (
                        <span className="text-xs font-bold text-neutral-500">{idx + 1}</span>
                      )}
                    </div>

                    {/* Обложка и Play */}
                    <div
                      className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center shrink-0 cursor-pointer overflow-hidden shadow-md"
                      onClick={() => handlePlayTrack(track)}
                      title="Воспроизвести"
                    >
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        {isPlaying ? (
                          <Pause size={16} className="text-[#a3e635] fill-[#a3e635]" />
                        ) : (
                          <Play size={16} className="text-white fill-white ml-0.5" />
                        )}
                      </div>
                    </div>

                    {/* Название и исполнитель */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm font-semibold truncate",
                          isPlaying ? "text-[#a3e635]" : "text-white"
                        )}
                      >
                        {track.title}
                      </p>
                      <p className="text-xs text-neutral-400 truncate">
                        {track.artist}
                      </p>
                      <p className="text-[10px] text-neutral-500 mt-0.5">
                        {track.contributor ? `@${track.contributor}` : "@участник"}
                      </p>
                    </div>

                    {/* Баллы */}
                    <span className="text-sm font-extrabold text-[#a3e635] px-2 py-0.5 rounded-lg bg-[#1a231b] border border-[#2c3d2b] tabular-nums shrink-0">
                      +{track.vote_score ?? track.score ?? 0}
                    </span>

                    {/* Блок голосования */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => handleVote(track.id, 1)}
                        className={cn(
                          "w-6 h-5 rounded flex items-center justify-center transition-colors cursor-pointer",
                          (track.my_vote || track.userVote) === 1
                            ? "bg-[#243025] text-[#a3e635]"
                            : "text-neutral-500 hover:text-neutral-200"
                        )}
                        title="Голосовать «За»"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => handleVote(track.id, -1)}
                        className={cn(
                          "w-6 h-5 rounded flex items-center justify-center transition-colors cursor-pointer",
                          (track.my_vote || track.userVote) === -1
                            ? "bg-red-950/40 text-red-400"
                            : "text-neutral-500 hover:text-neutral-200"
                        )}
                        title="Голосовать «Против»"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    {/* КНОПКА ПОИСКА В ЯНДЕКС МУЗЫКЕ */}
                    <a
                      href={yandexUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-8 h-8 rounded-xl bg-[#1c1c1c] border border-[#2b2b2b] hover:bg-[#252525] hover:border-amber-500/50 text-neutral-400 hover:text-amber-400 flex items-center justify-center shrink-0 transition-all cursor-pointer"
                      title="Найти этот трек в Яндекс Музыке"
                    >
                      <Search size={14} />
                    </a>
                  </div>
                );
              })}

              {tracks.length === 0 && (
                <div className="py-16 text-center text-neutral-500 text-sm">
                  В тусовке пока нет треков. Добавьте треки в плейлист сообщества!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ МИНИ-ПЛЕЕР ВНИЗУ ЭКРАНА ═════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0e0e0e]/95 backdrop-blur-xl border-t border-[#262626]">
        <div className="h-0.5 w-full bg-neutral-800">
          <div
            className="h-full bg-[#a3e635] transition-[width] duration-500"
            style={{ width: `${player.progress}%` }}
          />
        </div>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-[160px]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-white shrink-0 shadow">
              <Music size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white truncate max-w-[160px]">
                  {currentPlayingTrack?.title ?? "Общий эфир"}
                </p>
                {player.playing && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#a3e635] bg-[#1c231d] border border-[#2e402d] px-1.5 py-0.2 rounded-md">
                    <Radio size={10} className="animate-pulse" /> LIVE
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 truncate max-w-[160px]">
                {currentPlayingTrack?.artist ?? "ритм."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (currentPlayingTrack) handlePlayTrack(currentPlayingTrack);
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[#1c231d] border border-[#2e402d] text-white hover:bg-[#243025] transition-colors cursor-pointer"
              title={partyStatus.can_moderate ? "Воспроизведение / Пауза" : "Слушать общий эфир"}
            >
              {player.playing ? (
                <Pause size={17} className="fill-[#a3e635] text-[#a3e635]" />
              ) : (
                <Play size={17} className="fill-[#a3e635] text-[#a3e635] ml-0.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ ТОСТ-УВЕДОМЛЕНИЯ ════════════════════════════════════════════════ */}
      {toast && (
        <div className="fixed top-5 right-5 z-[200] bg-[#1a1a1a] border border-[#2e2e2e] text-white text-sm font-medium px-4 py-3 rounded-2xl shadow-2xl">
          {toast}
        </div>
      )}

      {/* ═══ МОДАЛКА: ЗАПУСК ВЕЧЕРИНКИ ═══════════════════════════════════════ */}
      <Dialog open={modalStart} onOpenChange={setModalStart}>
        <DialogContent className="sm:max-w-[480px] bg-[#171717] border-[#262626] text-white">
          <div className="w-10 h-10 rounded-xl bg-orange-950/40 border border-orange-800/40 text-orange-400 flex items-center justify-center">
            <Flame size={20} />
          </div>
          <DialogTitle className="text-xl font-bold text-white m-0">
            Запустить вечеринку
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-400 m-0">
            Запустится режим живой тусовки с таймером, обновлением чартов и синхронизацией треков.
          </DialogDescription>

          <div className="flex flex-col gap-4 mt-2">
            <div>
              <label className="block text-xs font-semibold text-neutral-400 mb-1.5">
                Название тусовки
              </label>
              <input
                type="text"
                value={partyNameInput}
                onChange={(e) => setPartyNameInput(e.target.value)}
                placeholder="Например: Хакатон Night 🔥"
                className="w-full bg-[#1c1c1c] border border-[#262626] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-orange-500/50"
              />
            </div>

            <div className="flex gap-2">
              {["Хакатон Night 🔥", "Субботний Движ ⚡", "Пятничный Чилл 🌴"].map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setPartyNameInput(name)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-[#222] border border-[#333] hover:border-neutral-500 text-neutral-300 cursor-pointer"
                >
                  {name}
                </button>
              ))}
            </div>

            <button
              onClick={handleStartParty}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-400 hover:to-rose-500 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-orange-600/30 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              <PartyPopper size={16} />
              Запустить тусовку
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ МОДАЛКА: ЗАВЕРШЕНИЕ ВЕЧЕРИНКИ ═══════════════════════════════════ */}
      <Dialog open={modalStop} onOpenChange={setModalStop}>
        <DialogContent className="sm:max-w-[420px] bg-[#171717] border-[#262626] text-white">
          <DialogTitle className="text-lg font-bold text-white m-0">
            Завершить вечеринку?
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-400 m-0">
            Таймер будет остановлен, а режим тусовки перейдет в режим ожидания.
          </DialogDescription>
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => setModalStop(false)}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold text-neutral-300 cursor-pointer"
            >
              Отмена
            </button>
            <button
              onClick={handleStopParty}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-semibold text-white cursor-pointer"
            >
              Завершить
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
