import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Share2, Copy, Check, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { QRCode } from "./QRCode.jsx";

export function Popup({
  type = "create", // "create" | "create-community" | "join" | "join-by-code" | "invite" | "invite-friends" | "custom"
  open,
  onOpenChange,
  onCreateCommunity,
  onJoinByCode,
  onSubmit,
  children,
  // Пользовательские переопределения (при необходимости):
  title,
  description,
  badge,
  icon,
  communityCode = "RITM2026",
  serverAddress,
  inviteLink,
  className,
}) {
  const [inputValue, setInputValue] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const defaultHost = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:5173";
  const isPublicDomain =
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";
  const effectiveServerAddress = isPublicDomain ? window.location.origin : (serverAddress || defaultHost);
  const resolvedInviteLink = isPublicDomain
    ? `${window.location.origin}/?invite=${communityCode}`
    : (inviteLink || `${effectiveServerAddress}/?invite=${communityCode}`);

  const copyToClipboard = (text, copyType) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
    if (copyType === "code") {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (type === "create" || type === "create-community") {
      onCreateCommunity?.(trimmed);
      onSubmit?.(trimmed);
    } else if (type === "join" || type === "join-by-code") {
      onJoinByCode?.(trimmed);
      onSubmit?.(trimmed);
    } else {
      onSubmit?.(trimmed);
    }

    setInputValue("");
    onOpenChange?.(false);
  };

  const isInvite = type === "invite" || type === "invite-friends";
  const isJoin = type === "join" || type === "join-by-code";
  const isCreate = type === "create" || type === "create-community";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && (
        <DialogTrigger asChild>{children}</DialogTrigger>
      )}

      {/* Вариант 1: Создание сообщества */}
      {isCreate && (
        <DialogContent className={cn("sm:max-w-[440px] text-left", className)}>
          {/* Иконка двух людей */}
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200">
            <img
              src="/icons/users.svg"
              alt="Иконка двух людей"
              className="h-5 w-5 brightness-125"
            />
          </div>

          {/* Параграф: НОВОЕ СООБЩЕСТВО */}
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 m-0">
            {badge || "НОВОЕ СООБЩЕСТВО"}
          </p>

          {/* Заголовок: Создадим свою волну? */}
          <DialogTitle className="text-xl font-bold text-white m-0">
            {title || "Создадим свою волну?"}
          </DialogTitle>

          {/* Описание */}
          <DialogDescription asChild>
            <p className="text-sm text-neutral-400 m-0">
              {description || "Придумай название — и зови друзей собирать общий плейлист"}
            </p>
          </DialogDescription>

          {/* Форма */}
          <form onSubmit={handleFormSubmit} className="flex flex-col items-start gap-4 w-full mt-2">
            <div className="flex flex-col items-start gap-2 w-full">
              <label
                htmlFor="community-name-input"
                className="text-sm font-medium text-neutral-200"
              >
                Название сообщества
              </label>
              <input
                id="community-name-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Например ПрогИнж-4 или ПИ"
                className="w-full rounded-lg border border-neutral-700 bg-[#262626] px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 outline-none transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200 active:scale-[0.99]"
            >
              <img src="/icons/plus.svg" alt="+" className="h-4 w-4" />
              <span>Создать сообщество</span>
            </button>
          </form>
        </DialogContent>
      )}

      {/* Вариант 2: Вступление по коду */}
      {isJoin && (
        <DialogContent className={cn("sm:max-w-[440px] text-left", className)}>
          {/* Иконка двух людей */}
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200">
            <img
              src="/icons/users.svg"
              alt="Иконка двух людей"
              className="h-5 w-5 brightness-125"
            />
          </div>

          {/* Параграф: ПРИСОЕДИНИТЬСЯ */}
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 m-0">
            {badge || "ПРИСОЕДИНИТЬСЯ"}
          </p>

          {/* Заголовок: Своих узнаём по коду */}
          <DialogTitle className="text-xl font-bold text-white m-0">
            {title || "Своих узнаём по коду"}
          </DialogTitle>

          {/* Описание */}
          <DialogDescription asChild>
            <p className="text-sm text-neutral-400 m-0">
              {description || "Введи код, которым поделился друг. Вся ваша музыка уже ждёт внутри"}
            </p>
          </DialogDescription>

          {/* Форма */}
          <form onSubmit={handleFormSubmit} className="flex flex-col items-start gap-4 w-full mt-2">
            <div className="flex flex-col items-start gap-2 w-full">
              <label
                htmlFor="invite-code-input"
                className="text-sm font-medium text-neutral-200"
              >
                Код приглашения
              </label>
              <input
                id="invite-code-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Например, RITM2026"
                className="w-full rounded-lg border border-neutral-700 bg-[#262626] px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 outline-none transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200 active:scale-[0.99]"
            >
              <img src="/icons/arrow-right.svg" alt="->" className="h-4 w-4" />
              <span>Вступить в сообщество</span>
            </button>
          </form>
        </DialogContent>
      )}

      {/* Вариант 3: Приглашение друзей на волну */}
      {isInvite && (
        <DialogContent className={cn("sm:max-w-[480px] text-left bg-[#171717] border-neutral-800 max-h-[90vh] overflow-y-auto", className)}>
          {/* Иконка Share в зеленом блоке */}
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#233525] border border-[#2e4730] text-[#a3e635]">
            <Share2 className="h-5 w-5" />
          </div>

          {/* Тег ВМЕСТЕ ГРОМЧЕ */}
          <p className="text-xs font-bold uppercase tracking-wider text-[#a3e635] -mt-1 m-0">
            {badge || "ВМЕСТЕ ГРОМЧЕ"}
          </p>

          {/* Заголовок */}
          <DialogTitle className="text-2xl font-bold text-white leading-tight -mt-1 m-0">
            {title || "Зови всех на свою волну."}
          </DialogTitle>

          {/* Описание */}
          <DialogDescription asChild>
            <p className="text-sm text-neutral-400 leading-normal -mt-1 m-0">
              {description || "Поделись кодом или ссылкой. Друзья смогут слушать, добавлять треки и голосовать."}
            </p>
          </DialogDescription>

          <div className="flex flex-col gap-3.5 mt-2 w-full">
            {/* Код сообщества */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Код сообщества
              </label>
              <div className="flex items-center justify-between rounded-xl bg-[#202521] border border-[#2a342c] px-4 py-2.5">
                <span className="font-bold text-lg tracking-widest text-white">
                  {communityCode}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(communityCode, "code")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#28322a] text-neutral-300 hover:bg-[#324035] hover:text-white transition-colors"
                  title="Скопировать код"
                >
                  {copiedCode ? (
                    <Check className="h-4 w-4 text-[#a3e635]" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Адрес сервера */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Адрес сервера (для телефона — IP ноутбука)
              </label>
              <div className="rounded-xl bg-[#202521] border border-[#2a342c] px-3.5 py-2.5 text-sm text-neutral-300 font-mono">
                {effectiveServerAddress}
              </div>
            </div>

            {/* Ссылка для приглашения */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Ссылка для приглашения
              </label>
              <div className="flex items-center justify-between gap-2 rounded-xl bg-[#202521] border border-[#2a342c] px-3.5 py-2 text-sm text-neutral-300">
                <span className="truncate font-mono text-xs text-neutral-300">
                  {resolvedInviteLink}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(resolvedInviteLink, "link")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#28322a] text-neutral-300 hover:bg-[#324035] hover:text-white transition-colors"
                  title="Скопировать ссылку"
                >
                  {copiedLink ? (
                    <Check className="h-4 w-4 text-[#a3e635]" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Баннер "Сканируй и голосуй" */}
            <div className="rounded-2xl bg-[#e3f7b8] p-3.5 flex items-center gap-3.5 text-neutral-900 mt-1">
              <div className="shrink-0 rounded-xl bg-white p-1.5 shadow-xs flex items-center justify-center">
                <QRCode
                  value={resolvedInviteLink}
                  size={72}
                  fgColor="#000000"
                  bgColor="#ffffff"
                  margin={1}
                  className="rounded-md"
                />
              </div>
              <div>
                <h4 className="font-bold text-sm text-neutral-900">
                  Сканируй и голосуй
                </h4>
                <p className="text-xs text-neutral-700 leading-snug mt-1">
                  Покажи QR на проекторе — участники сразу попадут в плейлист.
                </p>
              </div>
            </div>

            {/* Подсказка внизу */}
            <div className="flex items-start gap-2 text-xs text-neutral-400 mt-0.5">
              <Info className="h-4 w-4 shrink-0 text-neutral-500 mt-0.5" />
              <span>
                Для телефонов ссылка должна содержать адрес компьютера в локальной сети или настроенный домен.
              </span>
            </div>
          </div>
        </DialogContent>
      )}

      {/* Вариант 4: Произвольное модальное окно */}
      {!isCreate && !isJoin && !isInvite && (
        <DialogContent className={cn("sm:max-w-[480px] text-left", className)}>
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200">
              {icon}
            </div>
          )}
          {badge && (
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 m-0">
              {badge}
            </p>
          )}
          {title && (
            <DialogTitle className="text-xl font-bold text-white m-0">
              {title}
            </DialogTitle>
          )}
          {description && (
            <DialogDescription asChild>
              <p className="text-sm text-neutral-400 m-0">{description}</p>
            </DialogDescription>
          )}
          {children}
        </DialogContent>
      )}
    </Dialog>
  );
}

// Экспорт под разными именами для удобства и обратной совместимости
export function CreateCommunityDialog(props) {
  return <Popup type="create" {...props} />;
}

export function JoinByCodeDialog(props) {
  return <Popup type="join" {...props} />;
}

export function InviteFriendsDialog(props) {
  return <Popup type="invite" {...props} />;
}

export { Popup as PopupDialog, Popup as AppPopup };
export default Popup;
