import { useEffect } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { MainPage } from "./pages/MainPage.jsx";
import { PlaylistPage } from "./pages/PlaylistPage.jsx";
import { LibraryPage } from "./pages/LibraryPage.jsx";
import { FavoritesPage } from "./pages/FavoritesPage.jsx";
import { CommunityPage } from "./pages/CommunityPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import { PartyPage } from "./pages/PartyPage.jsx";
import Layout from "./components/Layout.jsx";
import { AuthProvider } from "./lib/auth.jsx";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname.includes("/party")) {
      return;
    }
    const params = new URLSearchParams(location.search);
    const code = params.get("invite") || params.get("code");
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
  }, [location.search, navigate]);

  return (
    <AuthProvider>
      <Layout>
        <div key={location.pathname} className="w-full">
          <Routes location={location}>
            <Route path="/" element={<MainPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<RegisterPage />} />
            <Route path="/auth" element={<RegisterPage />} />
            <Route path="/playlist" element={<PlaylistPage />} />
            <Route path="/party" element={<PartyPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/community/:id" element={<PlaylistPage />} />
            <Route path="/community/:id/party" element={<PartyPage />} />
            <Route
              path="*"
              element={
                <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                  <h2 className="text-xl font-bold text-white mb-2">Страница не найдена</h2>
                  <p className="text-sm">Вернитесь на главную страницу ритма</p>
                </div>
              }
            />
          </Routes>
        </div>
      </Layout>
    </AuthProvider>
  );
}