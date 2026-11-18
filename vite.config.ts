import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import observerPlugin from "mobx-react-observer/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), observerPlugin({ exclude: [] })],
});
