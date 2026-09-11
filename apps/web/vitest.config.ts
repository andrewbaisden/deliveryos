import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
        },
      },
      {
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
        },
        esbuild: {
          jsx: "automatic",
        },
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
        },
      },
    ],
  },
});
