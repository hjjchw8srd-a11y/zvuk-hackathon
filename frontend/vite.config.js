import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import os from "node:os";

function lanAddress() {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
  return addresses.find((address) => address.startsWith("192.168."))
    || addresses.find((address) => address.startsWith("10."))
    || addresses.find((address) => /^172\.(1[6-9]|2\d|3[01])\./.test(address))
    || null;
}

function localSharingPlugin() {
  return {
    name: "volna-local-sharing",
    configureServer(server) {
      server.middlewares.use("/__lan-info", (_request, response) => {
        const address = lanAddress();
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify({
          base_url: address ? `http://${address}:5173` : null,
        }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localSharingPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "^/api/": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
