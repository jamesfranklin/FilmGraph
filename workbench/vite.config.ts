import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_PORT = process.env.FILMOS_API_PORT || "4317";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
    proxy: { "/api": { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true } },
  },
  build: { outDir: "dist", target: "es2020", sourcemap: false },
});
