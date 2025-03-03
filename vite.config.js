import { defineConfig } from "vite";

export default defineConfig({
  base: "/werkstuk-infodag-ar-IMDVERSE-StefVB",
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-genai"],
  },
});
