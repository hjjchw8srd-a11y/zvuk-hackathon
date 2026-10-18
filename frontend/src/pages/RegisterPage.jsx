import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Headphones,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export function RegisterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "login" ? "login" : "register";
  const [mode, setMode] = useState(initialMode); // 'register' | 'login'

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title =
      mode === "register"
        ? "Регистрация — ритм. Совместные плейлисты"
        : "Вход — ритм. Совместные плейлисты";
  }, [mode]);

  // Если уже авторизован — перенаправляем на главную
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const switchMode = (newMode) => {
    setError(null);
    setMode(newMode);
    setSearchParams({ mode: newMode });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === "register") {
        if (!displayName.trim()) {
          throw new Error("Укажите ваше имя или никнейм");
        }
        if (password.length < 6) {
          throw new Error("Пароль должен содержать не менее 6 символов");
        }
        await register(email.trim(), password, displayName.trim());
      } else {
        await login(email.trim(), password);
      }
      navigate("/");
    } catch (err) {
      setError(err.message || "Произошла ошибка при обработке запроса");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-120px)] flex flex-col items-center justify-center py-6 sm:py-10 px-3 sm:px-4">
      {/* Мягкое фоновое неоновое свечение */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-[500px] h-[250px] sm:h-[350px] bg-[#a3e635]/15 blur-[100px] sm:blur-[130px] rounded-full pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Карточка формы */}
        <div className="rounded-2xl sm:rounded-3xl bg-[#171717] border border-[#262626] p-5 sm:p-8 md:p-10 shadow-2xl backdrop-blur-md">
          {/* Верхняя плашка с логотипом */}
          <div className="flex flex-col items-center text-center space-y-2.5 sm:space-y-3 mb-6 sm:mb-8">
            <Link
              to="/"
              className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-[#1c231d] border border-[#2e402d] text-[#a3e635] hover:bg-[#243025] transition-colors select-none"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#a3e635] text-black">
                <svg
                  viewBox="0 0 36 36"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                >
                  <rect x="7.5" y="13" width="3" height="10" rx="1.5" fill="#171717" />
                  <rect x="12.5" y="9" width="3" height="18" rx="1.5" fill="#171717" />
                  <rect x="17.5" y="6" width="3" height="24" rx="1.5" fill="#171717" />
                  <rect x="22.5" y="9" width="3" height="18" rx="1.5" fill="#171717" />
                  <rect x="27.5" y="13" width="3" height="10" rx="1.5" fill="#171717" />
                </svg>
              </div>
              <span className="text-lg font-bold tracking-tight text-white flex items-baseline">
                ритм<span className="text-[#a3e635] text-lg font-black">.</span>
              </span>
            </Link>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {mode === "register" ? "Создать аккаунт" : "С возвращением!"}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-xs">
              {mode === "register"
                ? "Сохраняйте свои плейлисты, музыку и голосуйте вместе с друзьями"
                : "Войдите, чтобы получить доступ к своим волнам и трекам"}
            </p>
          </div>

          {/* Переключатель вкладок Регистрация / Вход */}
          <div className="grid grid-cols-2 p-1 mb-5 sm:mb-6 rounded-xl bg-[#202020] border border-[#2d2d2d]">
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                mode === "register"
                  ? "bg-[#2a2a2a] text-white shadow-xs"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Регистрация
            </button>
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                mode === "login"
                  ? "bg-[#2a2a2a] text-white shadow-xs"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Вход
            </button>
          </div>

          {/* Баннер ошибки */}
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2.5 p-3 mb-5 sm:mb-6 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs sm:text-sm animate-in fade-in duration-200"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Форма */}
          <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">
            {/* Поле имени пользователя (только при регистрации) */}
            {mode === "register" && (
              <div className="space-y-1.5">
                <label
                  htmlFor="displayName"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-300"
                >
                  Ваше имя или никнейм
                </label>
                <div className="relative flex items-center">
                  <User className="absolute left-3.5 h-4 w-4 text-neutral-400 pointer-events-none" />
                  <input
                    id="displayName"
                    name="displayName"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Например, Алексей Смирнов"
                    autoComplete="name"
                    className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#202020] border border-[#2e2e2e] text-white text-base sm:text-sm placeholder-neutral-500 outline-none transition focus:border-[#a3e635] focus:ring-1 focus:ring-[#a3e635]"
                  />
                </div>
              </div>
            )}

            {/* Поле Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-300"
              >
                Email
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3.5 h-4 w-4 text-neutral-400 pointer-events-none" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  spellCheck="false"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#202020] border border-[#2e2e2e] text-white text-base sm:text-sm placeholder-neutral-500 outline-none transition focus:border-[#a3e635] focus:ring-1 focus:ring-[#a3e635]"
                />
              </div>
            </div>

            {/* Поле Пароль */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-300"
                >
                  Пароль
                </label>
                {mode === "register" && (
                  <span className="text-[11px] text-neutral-500">минимум 6 символов</span>
                )}
              </div>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 h-4 w-4 text-neutral-400 pointer-events-none" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  className="w-full h-11 pl-10 pr-11 rounded-xl bg-[#202020] border border-[#2e2e2e] text-white text-base sm:text-sm placeholder-neutral-500 outline-none transition focus:border-[#a3e635] focus:ring-1 focus:ring-[#a3e635]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  className="absolute right-3.5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Кнопка отправки формы */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-6 h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-[#a3e635] text-neutral-950 font-bold text-sm sm:text-base hover:bg-[#bef264] hover:scale-[1.01] active:scale-[0.99] transition-all shadow-lg shadow-[#a3e635]/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="h-5 w-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === "register" ? "Зарегистрироваться" : "Войти в аккаунт"}</span>
                  <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                </>
              )}
            </button>
          </form>

          {/* Преимущества аккаунта */}
          <div className="mt-8 pt-6 border-t border-neutral-800/80 space-y-2 text-xs text-neutral-400">
            <div className="flex items-center gap-2 text-neutral-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#a3e635]" />
              <span>Синхронизация любимых треков и очередей</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#a3e635]" />
              <span>Создание и администрирование своих комнат</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
