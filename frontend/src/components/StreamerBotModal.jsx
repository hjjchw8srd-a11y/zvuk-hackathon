import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Radio, Bot, Send, CheckCircle2, AlertCircle, RefreshCw, Sparkles, Music2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export function StreamerBotModal({ open, onOpenChange, currentRoomCode }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testCommand, setTestCommand] = useState("!sr dawn");
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch("/api/integrations/streamerbot/status", { headers });
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // Ignore network errors in status poll
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchStatus();
    }
  }, [open, fetchStatus]);

  const handleSyncRoom = async () => {
    if (!currentRoomCode) return;
    setSyncing(true);
    try {
      const token = localStorage.getItem("token");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch("/api/integrations/streamerbot/config", {
        method: "POST",
        headers,
        body: JSON.stringify({ room_code: currentRoomCode, enabled: true }),
      });
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // Ignore
    } finally {
      setSyncing(false);
    }
  };

  const handleSimulate = async (e) => {
    e?.preventDefault();
    if (!testCommand.trim() || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const token = localStorage.getItem("token");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch("/api/integrations/streamerbot/simulate", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: testCommand.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, data });
      } else {
        setTestResult({ ok: false, error: data.detail || "Ошибка симуляции" });
      }
    } catch {
      setTestResult({ ok: false, error: "Не удалось связаться с сервером" });
    } finally {
      setTesting(false);
    }
  };

  const isConnected = status?.connected;
  const isEnabled = status?.enabled;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-[#121215] border-[#262630] text-white p-6 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#262630]/70 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
              <Bot size={24} />
            </div>
            <div>
              <DialogTitle className="text-lg font-black text-white flex items-center gap-2">
                Twitch / Streamer.bot
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  LIVE CHAT
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-neutral-400">
                Заказ треков из медиатеки прямо из чата стрима
              </DialogDescription>
            </div>
          </div>

          <button
            onClick={fetchStatus}
            disabled={loading}
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Обновить статус"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1 text-xs">
          {/* Status Banner */}
          <div className="rounded-2xl bg-[#16161d] border border-[#262630] p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "w-3 h-3 rounded-full shrink-0",
                  isConnected
                    ? "bg-emerald-400 shadow-md shadow-emerald-400/50 animate-pulse"
                    : isEnabled
                    ? "bg-amber-400 shadow-md shadow-amber-400/40"
                    : "bg-neutral-600"
                )}
              />
              <div>
                <p className="font-bold text-white text-xs">
                  {isConnected
                    ? "Подключено к Streamer.bot (Twitch активен)"
                    : isEnabled
                    ? "Мост включен, ожидает Streamer.bot"
                    : "Интеграция выключена"}
                </p>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  {status?.url || "ws://127.0.0.1:8080/"}
                  {status?.commands_processed ? ` · Обработано команд: ${status.commands_processed}` : ""}
                </p>
              </div>
            </div>

            {currentRoomCode && (
              <button
                onClick={handleSyncRoom}
                disabled={syncing}
                className="px-3 py-1.5 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-300 hover:bg-purple-600/30 font-semibold text-[11px] transition-all cursor-pointer shrink-0"
              >
                {syncing ? "Привязка..." : `Привязать ${currentRoomCode}`}
              </button>
            )}
          </div>

          {/* How it works info */}
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-3.5 text-amber-200/90 leading-relaxed">
            <p className="font-bold flex items-center gap-1.5 text-amber-300 mb-1">
              <Sparkles size={13} />
              Двухуровневый интерактив для зрителей:
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-100/80">
              <li>
                <span className="font-semibold text-white">В чате Twitch:</span> быстрый выбор треков из встроенной медиатеки (100% защита от скримеров и запрещенных звуков).
              </li>
              <li>
                <span className="font-semibold text-white">На сайте:</span> зритель сканирует QR-код стримера, чтобы загрузить свой уникальный MP3-файл.
              </li>
            </ul>
          </div>

          {/* Commands table */}
          <div>
            <p className="font-bold uppercase tracking-wider text-[11px] text-neutral-400 mb-2 flex items-center gap-1.5">
              <Terminal size={12} className="text-purple-400" />
              Команды в чате Twitch
            </p>
            <div className="rounded-2xl bg-[#16161d] border border-[#262630] divide-y divide-[#262630] overflow-hidden font-mono text-[11px]">
              <div className="p-2.5 flex items-center justify-between">
                <span className="text-purple-300 font-bold">!sr &lt;название&gt;</span>
                <span className="text-neutral-400 font-sans">Предложить трек в очередь (алиас: !track, !трек)</span>
              </div>
              <div className="p-2.5 flex items-center justify-between">
                <span className="text-purple-300 font-bold">!tracks</span>
                <span className="text-neutral-400 font-sans">Показать список треков медиатеки</span>
              </div>
              <div className="p-2.5 flex items-center justify-between">
                <span className="text-purple-300 font-bold">!queue</span>
                <span className="text-neutral-400 font-sans">Показать топ очереди воспроизведения</span>
              </div>
              <div className="p-2.5 flex items-center justify-between">
                <span className="text-purple-300 font-bold">!now</span>
                <span className="text-neutral-400 font-sans">Показать играющий сейчас трек</span>
              </div>
              <div className="p-2.5 flex items-center justify-between">
                <span className="text-purple-300 font-bold">!help</span>
                <span className="text-neutral-400 font-sans">Справка по командам и ссылка на сайт</span>
              </div>
            </div>
          </div>

          {/* Test simulator */}
          <div className="rounded-2xl bg-[#16161d] border border-[#262630] p-3.5">
            <p className="font-bold text-[11px] text-neutral-300 mb-2 flex items-center gap-1.5">
              <Music2 size={12} className="text-purple-400" />
              Симулятор команды (проверка без открытого стрима)
            </p>
            <form onSubmit={handleSimulate} className="flex gap-2">
              <input
                type="text"
                value={testCommand}
                onChange={(e) => setTestCommand(e.target.value)}
                placeholder="!sr dawn или !tracks"
                className="flex-1 bg-[#101014] border border-[#2c2c38] rounded-xl px-3 py-2 text-xs font-mono text-purple-200 placeholder-neutral-600 outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                disabled={testing || !testCommand.trim()}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold text-xs text-white transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send size={12} />
                <span>{testing ? "Тест..." : "Отправить"}</span>
              </button>
            </form>

            {testResult && (
              <div
                className={cn(
                  "mt-3 p-3 rounded-xl border text-[11px] font-mono leading-relaxed",
                  testResult.ok
                    ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
                    : "bg-red-950/30 border-red-800/40 text-red-300"
                )}
              >
                {testResult.ok ? (
                  <>
                    <p className="font-bold text-emerald-400 flex items-center gap-1 mb-1 font-sans">
                      <CheckCircle2 size={13} />
                      Ответ бота в Twitch-чат:
                    </p>
                    <p className="text-white bg-[#0e0e11] p-2 rounded-lg border border-emerald-900/40">
                      {testResult.data.reply || `(действие: ${testResult.data.action})`}
                    </p>
                  </>
                ) : (
                  <p className="flex items-center gap-1.5">
                    <AlertCircle size={13} />
                    {testResult.error}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
