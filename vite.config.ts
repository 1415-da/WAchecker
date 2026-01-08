import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Electron expects relative asset paths when loading index.html via file://
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
  },
});
