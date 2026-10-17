import { useState, useEffect } from "react";
import { useAuth } from "../lib/auth";
import { useNavigate } from "react-router-dom";
import {
  ShieldAlert,
  Music,
  Radio,
  Users,
  AlertTriangle,
  Ban,
  CheckCircle,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Search,
  ExternalLink,
} from "lucide-react";

export default function SuperAdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("tracks"); // "tracks" | "rooms"
  const [overview, setOverview] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Audio preview playback
  const [previewTrackId, setPreviewTrackId] = useState(null);
  const [audioElement, setAudioElement] = useState(null);

  useEffect(() => {
    if (!user?.is_superuser) {
      navigate("/", { replace: true });
      return;
    }
    fetchData();
  }, [user, navigate]);

  const token = localStorage.getItem("token");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ovRes, trRes, rmRes] = await Promise.all([
        fetch("/api/superadmin/overview", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/superadmin/tracks", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/superadmin/rooms", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (ovRes.ok) setOverview(await ovRes.json());
      if (trRes.ok) setTracks(await trRes.json());
      if (rmRes.ok) setRooms(await rmRes.json());
    } catch (err) {
      console.error("Failed to load admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearReports = async (trackId) => {
    setActionLoadingId(trackId);
    try {
      const res = await fetch(`/api/superadmin/tracks/${trackId}/clear-reports`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTracks((prev) =>
          prev.map((t) => (t.id === trackId ? { ...t, dmca_reports_count: 0 } : t))
        );
        if (overview) {
          setOverview((prev) => ({
            ...prev,
            reported_tracks_count: Math.max(0, prev.reported_tracks_count - 1),
          }));
        }
      }
    } catch (err) {
      console.error("Failed to clear reports:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDmcaBan = async (track) => {
    if (
      !window.confirm(
        `Заблокировать трек «${track.title}»?\nОн будет навсегда удален из очереди, а его отпечаток внесен в черный список DMCA.`
      )
    ) {
      return;
    }
    setActionLoadingId(track.id);
    try {
      const res = await fetch(`/api/superadmin/tracks/${track.id}/dmca-ban`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        if (previewTrackId === track.id && audioElement) {
          audioElement.pause();
          setPreviewTrackId(null);
        }
        setTracks((prev) => prev.filter((t) => t.id !== track.id));
        if (overview) {
          setOverview((prev) => ({
            ...prev,
            total_tracks: Math.max(0, prev.total_tracks - 1),
            blacklisted_tracks_count: prev.blacklisted_tracks_count + 1,
            reported_tracks_count:
              track.dmca_reports_count > 0
                ? Math.max(0, prev.reported_tracks_count - 1)
                : prev.reported_tracks_count,
          }));
        }
      }
    } catch (err) {
      console.error("Failed to ban track:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteRoom = async (room) => {
    if (!window.confirm(`Деактивировать комнату «${room.name}»?`)) return;
    setActionLoadingId(room.id);
    try {
      const res = await fetch(`/api/superadmin/rooms/${room.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setRooms((prev) =>
          prev.map((r) => (r.id === room.id ? { ...r, is_active: false } : r))
        );
      }
    } catch (err) {
      console.error("Failed to delete room:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const togglePreview = (track) => {
    if (previewTrackId === track.id) {
      if (audioElement) {
        audioElement.pause();
      }
      setPreviewTrackId(null);
      return;
    }

    if (audioElement) {
      audioElement.pause();
    }

    if (!track.audio_url) return;
    const audio = new Audio(track.audio_url);
    audio.play().catch(() => {});
    audio.onended = () => setPreviewTrackId(null);
    setAudioElement(audio);
    setPreviewTrackId(track.id);
  };

  const filteredTracks = tracks.filter((t) => {
    const q = searchQuery.toLowerCase();
    return (
      t.title?.toLowerCase().includes(q) ||
      t.artist?.toLowerCase().includes(q) ||
      t.room_name?.toLowerCase().includes(q) ||
      t.created_by_name?.toLowerCase().includes(q)
    );
  });

  const filteredRooms = rooms.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      r.name?.toLowerCase().includes(q) ||
      r.invite_code?.toLowerCase().includes(q) ||
      r.faculty?.toLowerCase().includes(q) ||
      r.owner_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Панель управления SuperAdmin</h1>
              <p className="text-xs sm:text-sm text-zinc-400">
                Мониторинг платформы, предотвращение нарушений DMCA и управление комнатами
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-medium hover:bg-zinc-800 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Metric Cards */}
        {overview && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
                <span>Всего треков</span>
                <Music className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold text-white">{overview.total_tracks}</div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
                <span>Активные комнаты</span>
                <Radio className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-white">{overview.active_rooms}</div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
                <span>Пользователей</span>
                <Users className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold text-white">{overview.total_users}</div>
            </div>

            <div
              className={`border rounded-2xl p-4 ${
                overview.reported_tracks_count > 0
                  ? "bg-red-950/30 border-red-500/40"
                  : "bg-zinc-900/80 border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-2 text-zinc-400">
                <span>Жалобы DMCA</span>
                <AlertTriangle
                  className={`w-4 h-4 ${
                    overview.reported_tracks_count > 0 ? "text-red-400 animate-pulse" : "text-zinc-500"
                  }`}
                />
              </div>
              <div
                className={`text-2xl font-bold ${
                  overview.reported_tracks_count > 0 ? "text-red-400" : "text-white"
                }`}
              >
                {overview.reported_tracks_count}
              </div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
                <span>Чёрный список DMCA</span>
                <Ban className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-white">{overview.blacklisted_tracks_count}</div>
            </div>
          </div>
        )}

        {/* Tab Controls & Search */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800/80 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab("tracks")}
              className={`flex-1 sm:flex-none px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                activeTab === "tracks"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Треки и DMCA-жалобы ({tracks.length})
            </button>
            <button
              onClick={() => setActiveTab("rooms")}
              className={`flex-1 sm:flex-none px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                activeTab === "rooms"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Все комнаты ({rooms.length})
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === "tracks" ? "Поиск по треку, автору..." : "Поиск по комнате, коду..."}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Tracks Tab */}
        {activeTab === "tracks" && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-zinc-950/60 border-b border-zinc-800 text-zinc-400">
                  <tr>
                    <th className="py-3.5 px-4 font-medium">Трек</th>
                    <th className="py-3.5 px-4 font-medium">Комната / Автор</th>
                    <th className="py-3.5 px-4 font-medium">Лицензия</th>
                    <th className="py-3.5 px-4 font-medium">DMCA Статус</th>
                    <th className="py-3.5 px-4 font-medium text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredTracks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-500">
                        {loading ? "Загрузка списка треков..." : "Треки не найдены"}
                      </td>
                    </tr>
                  ) : (
                    filteredTracks.map((track) => {
                      const hasReports = (track.dmca_reports_count || 0) > 0;
                      const isPlaying = previewTrackId === track.id;
                      return (
                        <tr
                          key={track.id}
                          className={`hover:bg-zinc-800/30 transition-colors ${
                            hasReports ? "bg-red-500/5" : ""
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {track.audio_url ? (
                                <button
                                  onClick={() => togglePreview(track)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    isPlaying
                                      ? "bg-purple-600 text-white"
                                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                  }`}
                                  title={isPlaying ? "Остановить" : "Прослушать"}
                                >
                                  {isPlaying ? (
                                    <Pause className="w-3.5 h-3.5" />
                                  ) : (
                                    <Play className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              ) : (
                                <div className="p-2 rounded-lg bg-zinc-800 text-zinc-600">
                                  <Music className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <div>
                                <div className="font-medium text-white">{track.title}</div>
                                <div className="text-xs text-zinc-400">
                                  {track.artist || "Неизвестный артист"} · {track.genre || "Другое"}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="text-zinc-200">{track.room_name}</div>
                            <div className="text-xs text-zinc-500">Загрузил: {track.created_by_name}</div>
                          </td>

                          <td className="py-3 px-4">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                              {track.license_type || "CC / User Upload"}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            {hasReports ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {track.dmca_reports_count} жалоб
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-emerald-400">
                                <CheckCircle className="w-3.5 h-3.5" /> Чисто
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              {hasReports && (
                                <button
                                  onClick={() => handleClearReports(track.id)}
                                  disabled={actionLoadingId === track.id}
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                                  title="Снять жалобы как ложные"
                                >
                                  Снять жалобы
                                </button>
                              )}
                              <button
                                onClick={() => handleDmcaBan(track)}
                                disabled={actionLoadingId === track.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium transition-colors"
                                title="Удалить трек и добавить в чёрный список"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                DMCA Ban
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Rooms Tab */}
        {activeTab === "rooms" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRooms.length === 0 ? (
              <div className="col-span-full py-12 text-center text-zinc-500">
                {loading ? "Загрузка комнат..." : "Комнаты не найдены"}
              </div>
            ) : (
              filteredRooms.map((room) => (
                <div
                  key={room.id}
                  className={`bg-zinc-900/80 border rounded-2xl p-5 flex flex-col justify-between ${
                    room.is_active ? "border-zinc-800" : "border-zinc-800/40 opacity-60"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-bold text-white text-base leading-snug">{room.name}</h3>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-purple-300 border border-zinc-700">
                        {room.invite_code}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 mb-4">{room.faculty || "Факультет не указан"}</p>

                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300 mb-4 bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/60">
                      <div>
                        <span className="text-zinc-500 block">Владелец:</span>
                        <span className="font-medium text-white">{room.owner_name}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Треков / Людей:</span>
                        <span className="font-medium text-white">
                          {room.tracks_count} / {room.members_count}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        room.is_active
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {room.is_active ? "Активна" : "Деактивирована"}
                    </span>

                    {room.is_active && (
                      <button
                        onClick={() => handleDeleteRoom(room)}
                        disabled={actionLoadingId === room.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors border border-red-500/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Деактивировать
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
