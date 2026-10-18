import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./app.css";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", backgroundColor: "#121212", color: "#fff", padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
          <div style={{ maxWidth: 640, width: "100%", background: "#171717", border: "1px solid #2e2e2e", borderRadius: 16, padding: 32, boxShadow: "0 20px 50px rgba(0,0,0,0.6)" }}>
            <h1 style={{ color: "#ef4444", fontSize: 22, margin: "0 0 12px 0", fontWeight: "bold" }}>⚠️ Ошибка при отображении интерфейса</h1>
            <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px 0" }}>В процессе рендера возникла ошибка:</p>
            <pre style={{ background: "#0e0e0e", color: "#FDE047", padding: 16, borderRadius: 10, fontSize: 12, overflowX: "auto", border: "1px solid #222", lineHeight: 1.5 }}>
              {this.state.error?.stack || this.state.error?.toString()}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{ marginTop: 24, padding: "12px 24px", background: "#FDE047", color: "#000", fontWeight: "bold", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14 }}
            >
              Перезагрузить страницу
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
