import { Route, Routes, useLocation } from "react-router-dom";
import { MainPage } from "./pages/MainPage.jsx";
import { PlaylistPage } from "./pages/PlaylistPage.jsx";
import { LibraryPage } from "./pages/LibraryPage.jsx";
import { FavoritesPage } from "./pages/FavoritesPage.jsx";
import { CommunityPage } from "./pages/CommunityPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import Layout from "./components/Layout.jsx";
import { AuthProvider } from "./lib/auth.jsx";

export default function App() {
  const location = useLocation();

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
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/community/:id" element={<PlaylistPage />} />
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