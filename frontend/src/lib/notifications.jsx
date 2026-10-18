import toast from "react-hot-toast";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Кастомный компонент тоста с 5-секундным таймером убывания времени
 */
export function ToastCard({ t, type = "success", message }) {
  const isSuccess = type === "success";

  return (
    <div
      className={cn(
        "relative flex flex-col w-[340px] sm:w-[380px] max-w-[calc(100vw-32px)] rounded-2xl bg-[#171717] border shadow-2xl overflow-hidden transition-all duration-300 pointer-events-auto select-none",
        isSuccess
          ? "border-emerald-700/50 shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
          : "border-red-900/60 shadow-[0_12px_32px_rgba(0,0,0,0.6)]",
        t?.visible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-2 scale-95"
      )}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Иконка статуса */}
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
            isSuccess
              ? "bg-emerald-950/80 text-emerald-400 border border-emerald-700/60"
              : "bg-red-950/60 text-red-400 border border-red-800/60"
          )}
        >
          {isSuccess ? <Check className="h-4 w-4 stroke-[2.5]" /> : <X className="h-4 w-4 stroke-[2.5]" />}
        </div>

        {/* Текст уведомления */}
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-white leading-snug break-words">
            {message}
          </p>
        </div>

        {/* Кнопка закрытия */}
        <button
          type="button"
          onClick={() => toast.dismiss(t?.id)}
          className="text-neutral-400 hover:text-white transition-colors p-1 -mr-1 -mt-1 rounded-lg hover:bg-neutral-800 cursor-pointer shrink-0"
          aria-label="Закрыть уведомление"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Полоска прогресс-бара таймера на 5 секунд */}
      <div className="h-1 w-full bg-neutral-800/80 overflow-hidden">
        <div
          className={cn(
            "h-full animate-toast-progress origin-left",
            isSuccess ? "bg-emerald-500" : "bg-red-500"
          )}
        />
      </div>
    </div>
  );
}

/**
 * Уведомление об успешном добавлении трека в плейлист через поиск
 * Текст: "Трек добавлен в плейлист <название плейлиста>"
 */
export function showTrackAddedToast(playlistName) {
  const name = playlistName || "плейлист";
  return toast.custom(
    (t) => (
      <ToastCard
        t={t}
        type="success"
        message={`Трек добавлен в плейлист ${name}`}
      />
    ),
    {
      id: `track-add-${Date.now()}`,
      duration: 5000,
      position: "bottom-right",
    }
  );
}

/**
 * Уведомление об ошибке добавления трека в плейлист через поиск
 * Текст: "Ошибка. Трек не был добавлен в плейлист <название плейлиста>"
 */
export function showTrackAddErrorToast(playlistName) {
  const name = playlistName || "плейлист";
  return toast.custom(
    (t) => (
      <ToastCard
        t={t}
        type="error"
        message={`Ошибка. Трек не был добавлен в плейлист ${name}`}
      />
    ),
    {
      id: `track-add-error-${Date.now()}`,
      duration: 5000,
      position: "bottom-right",
    }
  );
}

export const notifyTrackAdded = showTrackAddedToast;
export const notifyTrackAddError = showTrackAddErrorToast;

export default {
  showTrackAddedToast,
  showTrackAddErrorToast,
  notifyTrackAdded,
  notifyTrackAddError,
};
