import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    proxy: {
      "^/api/": {
        target: "http://localhost:8000",
        changeOrigin: true,
        ws: true,
      },
      "^/ws/": {
        target: "http://localhost:8000",
        changeOrigin: true,
        ws: true,
      },
      "^/uploads/": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});