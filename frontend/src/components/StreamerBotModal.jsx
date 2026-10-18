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
  const [justSynced, setJustSynced] = useState(false);
  const [copiedTunnel, setCopiedTunnel] = useState(false);
  const resultRef = useRef(null);

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
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 4000);
      }
    } catch {
      // Ignore
    } finally {
      setSyncing(false);
    }
  };

  const handleSimulateWithText = async (cmdText) => {
    const textToRun = (cmdText || testCommand).trim();
    if (!textToRun || testing) return;
    setTestCommand(textToRun);
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
        body: JSON.stringify({ text: textToRun }),
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
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  };

  const handleSimulate = async (e) => {
    e?.preventDefault();
    await handleSimulateWithText(testCommand);
  };

  const handleCopyTunnel = () => {
    const tunnelCmd = "ssh -N -R 8080:127.0.0.1:8080 root@31.77.174.168";
    navigator.clipboard?.writeText(tunnelCmd);
    setCopiedTunnel(true);
    setTimeout(() => setCopiedTunnel(false), 3000);
  };

  const isConnected = status?.connected;
  const isEnabled = status?.enabled;
  const isBoundToCurrent = justSynced || (status?.room_code && currentRoomCode && status.room_code.toUpperCase() === currentRoomCode.toUpperCase());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] bg-[#121215] border-[#262630] text-white p-6 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
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
            <div className="flex items-center gap-3 min-w-0">
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
              <div className="min-w-0">
                <p className="font-bold text-white text-xs truncate">
                  {isConnected
                    ? "Подключено к Streamer.bot (Twitch активен)"
                    : isEnabled
                    ? "Мост включен, ожидает Streamer.bot"
                    : "Интеграция выключена"}
                </p>
                <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                  {status?.url || "ws://127.0.0.1:8080/"}
                  {status?.room_code ? ` · Комната: ${status.room_code}` : ""}
                  {status?.commands_processed ? ` · Обработано: ${status.commands_processed}` : ""}
                </p>
              </div>
            </div>

            {currentRoomCode && (
              <button
                onClick={handleSyncRoom}
                disabled={syncing}
                className={cn(
                  "px-3 py-1.5 rounded-xl font-bold text-[11px] transition-all cursor-pointer shrink-0 flex items-center gap-1.5",
                  isBoundToCurrent
                    ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-300"
                    : "bg-purple-600/30 border border-purple-500/50 text-purple-200 hover:bg-purple-600/50"
                )}
              >
                {syncing ? (
                  "Привязка..."
                ) : isBoundToCurrent ? (
                  <>
                    <CheckCircle2 size={13} className="text-emerald-400" />
                    <span>Привязано к {currentRoomCode}</span>
                  </>
                ) : (
                  <span>Привязать {currentRoomCode}</span>
                )}
              </button>
            )}
          </div>

          {/* SSH Tunnel Hint for remote connection if not yet connected */}
          {!isConnected && (
            <div className="rounded-2xl bg-neutral-900/70 border border-neutral-800 p-3 text-[11px]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Terminal size={12} className="text-purple-400" />
                  Подключение Streamer.bot с вашего ПК:
                </span>
                <button
                  type="button"
                  onClick={handleCopyTunnel}
                  className="px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-purple-300 text-[10px] font-mono transition-colors cursor-pointer"
                >
                  {copiedTunnel ? "✓ Скопировано!" : "Скопировать SSH"}
                </button>
              </div>
              <p className="font-mono text-[10px] text-neutral-400 bg-neutral-950 p-2 rounded-xl border border-neutral-800 select-all truncate">
                ssh -N -R 8080:127.0.0.1:8080 root@31.77.174.168
              </p>
            </div>
          )}

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
              Команды в чате Twitch (нажмите для быстрой проверки)
            </p>
            <div className="rounded-2xl bg-[#16161d] border border-[#262630] divide-y divide-[#262630] overflow-hidden font-mono text-[11px]">
              {[
                { cmd: "!sr dawn", desc: "Предложить трек в очередь (алиас: !track, !трек)" },
                { cmd: "!tracks", desc: "Показать список треков медиатеки" },
                { cmd: "!queue", desc: "Показать топ очереди воспроизведения" },
                { cmd: "!now", desc: "Показать играющий сейчас трек" },
                { cmd: "!help", desc: "Справка по командам и ссылка на сайт" },
              ].map((item) => (
                <div
                  key={item.cmd}
                  onClick={() => handleSimulateWithText(item.cmd)}
                  className="p-2.5 flex items-center justify-between hover:bg-neutral-800/40 cursor-pointer transition-colors group"
                  title="Нажмите для проверки этой команды в симуляторе"
                >
                  <span className="text-purple-300 group-hover:text-purple-200 font-bold underline decoration-dotted underline-offset-4">
                    {item.cmd}
                  </span>
                  <span className="text-neutral-400 font-sans text-[11px]">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Test simulator */}
          <div className="rounded-2xl bg-[#16161d] border border-[#262630] p-3.5">
            <p className="font-bold text-[11px] text-neutral-300 mb-2 flex items-center gap-1.5">
              <Music2 size={12} className="text-purple-400" />
              Симулятор команды (проверка бота прямо сейчас)
            </p>

            {/* Quick Chips */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {["!tracks", "!sr dawn", "!queue", "!now", "!help"].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleSimulateWithText(chip)}
                  disabled={testing}
                  className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700/60 text-purple-300 hover:text-white hover:border-purple-500/60 font-mono text-[10px] transition-colors cursor-pointer"
                >
                  {chip}
                </button>
              ))}
            </div>

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
                ref={resultRef}
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
