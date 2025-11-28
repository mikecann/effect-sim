import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import observerPlugin from "mobx-react-observer/babel-plugin";
// Removed unused path import after dropping alias resolution

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [observerPlugin({ exclude: [] })],
      },
    }),
  ],
  resolve: {},
});
