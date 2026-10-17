import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Проверка сохраненного токена при загрузке страницы
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      setLoading(false);
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
        localStorage.removeItem("token");
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (loginOrEmail, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: loginOrEmail, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Ошибка при входе в аккаунт");
    }

    localStorage.setItem("token", data.access_token);
    setUser(data.user);
    return data.user;
  };

  const register = async (username, password, email = null, displayName = null) => {
    const payload = {
      username: username.trim(),
      password,
    };
    if (email && email.trim()) {
      payload.email = email.trim();
    }
    if (displayName && displayName.trim()) {
      payload.display_name = displayName.trim();
    }

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
    sessionStorage.removeItem("auth_redirect_target");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
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
