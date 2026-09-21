import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: { target: "es2022" },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    // Tauri watches Rust itself. Cargo's target tree must not flood Vite's
    // watcher or compete with the WebView while native builds are running.
    watch: { ignored: ["**/src-tauri/**", "**/.local/**"] },
  },
});
