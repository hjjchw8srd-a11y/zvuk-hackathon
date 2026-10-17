import { useEffect } from "react";
import { Route, Routes, useLocation, useNavigate, Navigate } from "react-router-dom";
import { MainPage } from "./pages/MainPage.jsx";
import { PlaylistPage } from "./pages/PlaylistPage.jsx";
import { LibraryPage } from "./pages/LibraryPage.jsx";
import { FavoritesPage } from "./pages/FavoritesPage.jsx";
import { PartyPage } from "./pages/PartyPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import SuperAdminPage from "./pages/SuperAdminPage.jsx";
import Layout from "./components/Layout.jsx";
import { AuthProvider, useAuth } from "./lib/auth.jsx";

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-zinc-400">Загрузка ритм...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const fullTarget = location.pathname + location.search;
    sessionStorage.setItem("auth_redirect_target", fullTarget);
    return <Navigate to="/auth" replace />;
  }

  return <Layout>{children}</Layout>;
}

function SuperAdminRoute({ children }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (!user?.is_superuser) {
    return <Navigate to="/" replace />;
  }

  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    if (location.pathname.includes("/party")) {
      return;
    }
    const params = new URLSearchParams(location.search);
    const code = params.get("invite") || params.get("join") || params.get("code");
    if (code) {
      const token = localStorage.getItem("token");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      fetch("/api/join", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.id) {
            if (data.access_token) {
              localStorage.setItem("token", data.access_token);
            }
            window.dispatchEvent(new Event("communities_updated"));
            navigate(`/community/${data.id}`, { replace: true });
          }
        })
        .catch(() => {});
    }
  }, [location.pathname, location.search, navigate, isAuthenticated]);

  return (
    <Routes>
      {/* Публичный Auth Gate */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/login" element={<Navigate to="/auth" replace />} />
      <Route path="/register" element={<Navigate to="/auth" replace />} />

      {/* Защищенные маршруты */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/playlist"
        element={
          <ProtectedRoute>
            <PlaylistPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/party"
        element={
          <ProtectedRoute>
            <PartyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/library"
        element={
          <ProtectedRoute>
            <LibraryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/favorites"
        element={
          <ProtectedRoute>
            <FavoritesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/community/:id"
        element={
          <ProtectedRoute>
            <PlaylistPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/community/:id/party"
        element={
          <ProtectedRoute>
            <PartyPage />
          </ProtectedRoute>
        }
      />

      {/* SuperAdmin панель */}
      <Route
        path="/superadmin"
        element={
          <SuperAdminRoute>
            <SuperAdminPage />
          </SuperAdminRoute>
        }
      />

      {/* 404 */}
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
              <h2 className="text-xl font-bold text-white mb-2">Страница не найдена</h2>
              <p className="text-sm">Вернитесь на главную страницу ритма</p>
            </div>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}