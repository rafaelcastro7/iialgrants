import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  plugins: [
    ...tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 8080,
    strictPort: true,
  },
  build: {
    rolldownOptions: {
      output: {
        // Split heavy vendors out of the main bundle: recharts/d3 (dashboard
        // only), Supabase, and the TanStack stack. Vendor chunks are long-term
        // cacheable and keep the entry chunk under the size-warning threshold.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-"))
            return "charts";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@tanstack")) return "tanstack";
        },
      },
    },
  },
});
