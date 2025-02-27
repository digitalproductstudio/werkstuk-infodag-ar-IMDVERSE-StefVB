import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-genai"],
  },
});
