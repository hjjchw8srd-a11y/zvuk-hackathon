import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Проверка сохраненного токена при запуске
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      // Инициализируем сессию через /api/bootstrap, чтобы получить JWT
      fetch("/api/bootstrap")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.access_token) {
            localStorage.setItem("token", data.access_token);
            if (data.user) setUser(data.user);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }

    fetch("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Недействительный токен");
        return res.json();
      })
      .then((userData) => {
        setUser(userData);
      })
      .catch(() => {
        // Если старый токен протух, запрашиваем свежий гостевой
        fetch("/api/bootstrap")
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.access_token) {
              localStorage.setItem("token", data.access_token);
              if (data.user) setUser(data.user);
            } else {
              localStorage.removeItem("token");
              setUser(null);
            }
          })
          .catch(() => {
            localStorage.removeItem("token");
            setUser(null);
          });
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (email, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Ошибка при входе в аккаунт");
    }

    localStorage.setItem("token", data.access_token);
    setUser(data.user);
    return data.user;
  };

  const register = async (email, password, displayName) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        display_name: displayName,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Ошибка при регистрации");
    }

    localStorage.setItem("token", data.access_token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user && !!user.email,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
