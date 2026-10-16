import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Users,
  QrCode,
  Share2,
  Headphones,
  ArrowRight,
  Flame,
  Radio,
  Sliders,
  CheckCircle2,
  Play,
  Heart,
  Plus,
  KeyRound,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Popup } from "@/components/Popup";

export function MainPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [upvoted, setUpvoted] = useState(false);
  const [votesCount, setVotesCount] = useState(14);

  useEffect(() => {
    document.title = "ритм. — Совместные плейлисты в реальном времени";
  }, []);

  const handleVote = () => {
    if (!upvoted) {
      setVotesCount((prev) => prev + 1);
      setUpvoted(true);
    } else {
      setVotesCount((prev) => prev - 1);
      setUpvoted(false);
    }
  };

  return (
    <div className="w-full text-white space-y-24 pb-16">
      {/* 1. ГЛАВНЫЙ ЭКРАН (HERO SECTION) */}
      <section className="relative pt-6 pb-12 overflow-hidden">
        {/* Фоновое мягкое неоновое свечение */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[320px] bg-[#a3e635]/10 blur-[130px] rounded-full pointer-events-none" />

        <div className="relative max-w-5xl mx-auto flex flex-col items-center text-center space-y-8">
          {/* Бейдж новинки / статуса */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1e261d] border border-[#2e402d] text-[#a3e635] text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            <span>Вместе громче • Музыка в реальном времени</span>
          </div>

          {/* Главный заголовок H1 */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1] max-w-4xl">
            Один плейлист на всю компанию.{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#a3e635] to-[#bef264]">
              Управляйте музыкой вместе.
            </span>
          </h1>

          {/* Подзаголовок */}
          <p className="text-base sm:text-xl text-neutral-400 max-w-2xl leading-relaxed">
            Создавай волну для вечеринки, поездки или офиса за пару секунд.
            Друзья подключаются по коду или QR, добавляют любимые треки и
            голосуют за то, что заиграет следующим.
          </p>

          {/* Блок основных действий (CTA) */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto pt-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-xl bg-[#a3e635] text-black font-bold text-base hover:bg-[#b5f442] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-[#a3e635]/20 cursor-pointer"
            >
              <Plus className="h-5 w-5 stroke-[2.5]" />
              <span>Создать плейлист</span>
            </button>

            <button
              type="button"
              onClick={() => setIsJoinOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-xl bg-[#1c1c1c] border border-neutral-800 text-neutral-200 font-semibold text-base hover:bg-[#252525] hover:text-white transition-all cursor-pointer"
            >
              <KeyRound className="h-5 w-5 text-[#a3e635]" />
              <span>Вступить по коду</span>
            </button>
          </div>

          {/* Быстрые преимущества / микрокопия */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-3 text-xs sm:text-sm text-neutral-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-[#a3e635]" />
              Без обязательной регистрации
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-[#a3e635]" />
              С любого смартфона и ПК
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-[#a3e635]" />
              Мгновенный вход по QR
            </span>
          </div>

          {/* Интерактивное визуальное демо карточки живого плейлиста */}
          <div className="w-full max-w-2xl pt-6">
            <div className="relative rounded-2xl bg-[#171717] border border-[#262626] p-5 sm:p-6 shadow-2xl text-left overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#a3e635] opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#a3e635]" />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#a3e635]">
                    Сейчас в эфире • Комната «Пятничный Вайб»
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-neutral-400 bg-neutral-900/80 px-2.5 py-1 rounded-full border border-neutral-800">
                  <Users className="h-3.5 w-3.5 text-[#a3e635]" />
                  <span>8 участников</span>
                </div>
              </div>

              {/* Текущий трек */}
              <div className="flex items-center gap-4 bg-neutral-900/60 p-3.5 rounded-xl border border-neutral-800/80 mb-4">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#293d2c] text-[#a3e635] overflow-hidden">
                  <Headphones className="h-7 w-7" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Play className="h-6 w-6 text-white fill-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    Midnight City
                  </div>
                  <div className="text-xs text-neutral-400 truncate">
                    M83 • Добавил Alexey
                  </div>
                  <div className="w-full bg-neutral-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
                    <div className="bg-[#a3e635] h-full w-2/3 rounded-full" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleVote}
                  className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                    upvoted
                      ? "bg-[#233525] border-[#2e4730] text-[#a3e635]"
                      : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white"
                  }`}
                  title="Поднять в очереди"
                >
                  <Flame className={`h-4 w-4 ${upvoted ? "fill-[#a3e635]" : ""}`} />
                  <span className="text-xs font-bold mt-0.5">{votesCount}</span>
                </button>
              </div>

              {/* Следующие треки */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  Следующие в очереди
                </div>
                <div className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-neutral-900/40 text-neutral-300">
                  <span className="truncate">1. Daft Punk — Get Lucky</span>
                  <span className="text-[#a3e635] font-semibold flex items-center gap-1">
                    <Flame className="h-3 w-3" /> 11 голосов
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-neutral-900/20 text-neutral-400">
                  <span className="truncate">2. The Weeknd — Blinding Lights</span>
                  <span className="text-neutral-500 font-semibold flex items-center gap-1">
                    <Flame className="h-3 w-3" /> 7 голосов
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. БЛОК ВОЗМОЖНОСТЕЙ (FEATURES & BENEFITS) */}
      <section id="features" className="max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-xs font-bold tracking-widest uppercase text-[#a3e635]">
            Возможности сервиса
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Всё, чтобы музыка объединяла, а не создавала споров
          </p>
          <p className="text-neutral-400 text-sm sm:text-base">
            Забудьте про передачу одного провода из рук в руки. Теперь диджеем
            становится каждый гость.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Фича 1: Совместное редактирование */}
          <div className="rounded-2xl bg-[#171717] border border-[#262626] p-7 space-y-4 hover:border-neutral-700 transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#233525] border border-[#2e4730] text-[#a3e635]">
                <Radio className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Совместная очередь в реальном времени
              </h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Каждый участник добавляет свои треки прямо со смартфона. Список
                воспроизведения синхронизируется у всех без задержек и перезагрузок
                страницы.
              </p>
            </div>
            <div className="pt-4 border-t border-neutral-800/80 flex items-center gap-2 text-xs font-semibold text-[#a3e635]">
              <Zap className="h-3.5 w-3.5" />
              <span>Мгновенный отклик WebSocket</span>
            </div>
          </div>

          {/* Фича 2: Приглашение друзей */}
          <div className="rounded-2xl bg-[#171717] border border-[#262626] p-7 space-y-4 hover:border-neutral-700 transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#233525] border border-[#2e4730] text-[#a3e635]">
                <Share2 className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Приглашение за пару кликов
              </h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Поделитесь ссылкой в Telegram, передайте короткий 6-значный код
                или выведите QR-код на экран телевизора/проектора. Подключение
                занимает 3 секунды.
              </p>
            </div>
            <div className="pt-4 border-t border-neutral-800/80 flex items-center gap-2 text-xs font-semibold text-[#a3e635]">
              <QrCode className="h-3.5 w-3.5" />
              <span>QR-код готов к печати или экрану</span>
            </div>
          </div>

          {/* Фича 3: Голосование за треки */}
          <div className="rounded-2xl bg-[#171717] border border-[#262626] p-7 space-y-4 hover:border-neutral-700 transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#233525] border border-[#2e4730] text-[#a3e635]">
                <Flame className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Музыкальная демократия
              </h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Голосуйте огоньками за лучшие предложения. Песни с максимальным
                количеством голосов автоматически перемещаются наверх очереди,
                формируя идеальный сетлист.
              </p>
            </div>
            <div className="pt-4 border-t border-neutral-800/80 flex items-center gap-2 text-xs font-semibold text-[#a3e635]">
              <Sliders className="h-3.5 w-3.5" />
              <span>Умная сортировка по апвоутам</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. РАЗДЕЛ «КАК ЭТО РАБОТАЕТ» (HOW IT WORKS) */}
      <section id="how-it-works" className="max-w-5xl mx-auto space-y-12">
        <div className="text-center space-y-3 max-w-xl mx-auto">
          <h2 className="text-xs font-bold tracking-widest uppercase text-[#a3e635]">
            Пошаговый сценарий
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Как запустить совместную волну
          </p>
          <p className="text-neutral-400 text-sm sm:text-base">
            От создания до первой совместной композиции — всего 4 простых шага.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Шаг 1 */}
          <div className="relative rounded-2xl bg-[#171717] border border-[#262626] p-6 space-y-3">
            <div className="text-3xl font-black text-[#a3e635]/30">01</div>
            <h4 className="text-lg font-bold text-white">Создай комнату</h4>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
              Нажми «Создать сообщество» в пару кликов и задай название для встречи или тусовки.
            </p>
          </div>

          {/* Шаг 2 */}
          <div className="relative rounded-2xl bg-[#171717] border border-[#262626] p-6 space-y-3">
            <div className="text-3xl font-black text-[#a3e635]/30">02</div>
            <h4 className="text-lg font-bold text-white">Позови друзей</h4>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
              Отправь ссылку в групповой чат или покажи QR-код для моментального сканирования.
            </p>
          </div>

          {/* Шаг 3 */}
          <div className="relative rounded-2xl bg-[#171717] border border-[#262626] p-6 space-y-3">
            <div className="text-3xl font-black text-[#a3e635]/30">03</div>
            <h4 className="text-lg font-bold text-white">Добавляйте музыку</h4>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
              Ищите треки через строку поиска сверху и закидывайте их в общий плейлист.
            </p>
          </div>

          {/* Шаг 4 */}
          <div className="relative rounded-2xl bg-[#171717] border border-[#262626] p-6 space-y-3">
            <div className="text-3xl font-black text-[#a3e635]/30">04</div>
            <h4 className="text-lg font-bold text-white">Слушайте и голосуйте</h4>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
              Слушайте трек за треком и поднимайте в топ песни, которые нравятся компании.
            </p>
          </div>
        </div>
      </section>

      {/* 4. БЛОК ПРИЗЫВА К ДЕЙСТВИЮ (PRE-FOOTER CTA BANNER) */}
      <section className="max-w-5xl mx-auto">
        <div className="relative rounded-3xl bg-gradient-to-br from-[#1c2a1e] via-[#171717] to-[#121212] border border-[#2e4730] p-8 sm:p-12 overflow-hidden text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-8">
          <div className="space-y-3 max-w-xl">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
              Готовы включить свою волну прямо сейчас?
            </h3>
            <p className="text-sm sm:text-base text-neutral-300 leading-relaxed">
              Создайте первую музыкальную комнату за 10 секунд. Без рекламы,
              сложных настроек и кредитных карт.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="shrink-0 inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-[#a3e635] text-black font-bold text-base hover:bg-[#b5f442] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-xl shadow-[#a3e635]/20"
          >
            <Sparkles className="h-5 w-5" />
            <span>Начать бесплатно</span>
          </button>
        </div>
      </section>

      {/* 5. ФУТЕР (FOOTER) */}
      <footer className="border-t border-neutral-800/80 pt-12 pb-6 max-w-6xl mx-auto text-xs text-neutral-400">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="space-y-3 col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 text-xl font-black text-white tracking-tight">
              ритм<span className="text-[#a3e635]">.</span>
            </div>
            <p className="text-neutral-400 text-xs leading-relaxed max-w-xs">
              Веб-сервис для синхронного создания совместных музыкальных плейлистов и вечеринок.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="font-bold text-white uppercase tracking-wider text-[11px]">
              Продукт
            </div>
            <ul className="space-y-2">
              <li>
                <Link to="/playlist" className="hover:text-white transition-colors">
                  Плейлисты
                </Link>
              </li>
              <li>
                <a href="#features" className="hover:text-white transition-colors">
                  Возможности
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-white transition-colors">
                  Как это работает
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <div className="font-bold text-white uppercase tracking-wider text-[11px]">
              Сообщество
            </div>
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  className="hover:text-white transition-colors text-left cursor-pointer"
                >
                  Создать волну
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setIsJoinOpen(true)}
                  className="hover:text-white transition-colors text-left cursor-pointer"
                >
                  Вступить по коду
                </button>
              </li>
              <li>
                <Link to="/library" className="hover:text-white transition-colors">
                  Медиатека
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <div className="font-bold text-white uppercase tracking-wider text-[11px]">
              Связь и помощь
            </div>
            <ul className="space-y-2">
              <li>
                <a
                  href="mailto:support@ritm.audio"
                  className="hover:text-white transition-colors"
                >
                  support@ritm.audio
                </a>
              </li>
              <li>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition-colors"
                >
                  GitHub Project
                </a>
              </li>
              <li>
                <span className="text-neutral-500">Версия v1.0 • RITM 2026</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-neutral-500">
          <div>© 2026 ритм. Все права защищены. Музыка звучит вместе.</div>
          <div className="flex items-center gap-4">
            <span className="hover:text-neutral-400 cursor-pointer">
              Политика конфиденциальности
            </span>
            <span>•</span>
            <span className="hover:text-neutral-400 cursor-pointer">
              Условия использования
            </span>
          </div>
        </div>
      </footer>

      {/* Модальные окна сервиса */}
      <Popup
        type="create"
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
      <Popup
        type="join"
        open={isJoinOpen}
        onOpenChange={setIsJoinOpen}
      />
    </div>
  );
}
