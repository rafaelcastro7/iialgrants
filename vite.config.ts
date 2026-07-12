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
    // Post-splitting budget: the entry chunk dropped from ~755 kB to ~523 kB
    // raw (~155 kB gzip). Keep the warning budget close to that measured
    // baseline so a real regression still fails loudly without flagging the
    // unavoidable TanStack Start/router entry runtime every build.
    chunkSizeWarningLimit: 550,
    rolldownOptions: {
      checks: {
        // TanStack Start's import-protection plugin dominates build time in
        // this app; the timing breakdown is useful while debugging Vite itself
        // but noisy as a recurring project gate.
        pluginTimings: false,
      },
      output: {
        // Split heavy vendors out of the main bundle: recharts/d3 (dashboard
        // only), Supabase, TanStack, React, and UI vendors. Vendor chunks are
        // long-term cacheable and keep the entry chunk inside the explicit
        // budget above.
        manualChunks(id: string) {
          const moduleId = id.replace(/\\/g, "/");
          if (!moduleId.includes("/node_modules/")) return;

          if (moduleId.includes("/node_modules/@tanstack/")) return "tanstack";
          if (moduleId.includes("/node_modules/@supabase/")) return "supabase";
          if (
            moduleId.includes("/node_modules/recharts/") ||
            moduleId.includes("/node_modules/d3-") ||
            moduleId.includes("/node_modules/victory-")
          )
            return "charts";
          if (
            moduleId.includes("/node_modules/react/") ||
            moduleId.includes("/node_modules/react-dom/") ||
            moduleId.includes("/node_modules/scheduler/") ||
            moduleId.includes("/node_modules/use-sync-external-store/")
          )
            return "react-vendor";
          if (
            moduleId.includes("/node_modules/@radix-ui/") ||
            moduleId.includes("/node_modules/cmdk/") ||
            moduleId.includes("/node_modules/vaul/") ||
            moduleId.includes("/node_modules/sonner/") ||
            moduleId.includes("/node_modules/lucide-react/") ||
            moduleId.includes("/node_modules/class-variance-authority/") ||
            moduleId.includes("/node_modules/tailwind-merge/") ||
            moduleId.includes("/node_modules/clsx/")
          )
            return "ui-vendor";
          if (moduleId.includes("/node_modules/framer-motion/")) return "motion";
          if (
            moduleId.includes("/node_modules/react-hook-form/") ||
            moduleId.includes("/node_modules/@hookform/")
          )
            return "forms";
          if (moduleId.includes("/node_modules/zod/")) return "validation";
          if (
            moduleId.includes("/node_modules/i18next/") ||
            moduleId.includes("/node_modules/react-i18next/")
          )
            return "i18n-vendor";
          if (
            moduleId.includes("/node_modules/chrono-node/") ||
            moduleId.includes("/node_modules/date-fns/")
          )
            return "date-vendor";
          if (
            moduleId.includes("/node_modules/docx/") ||
            moduleId.includes("/node_modules/pdf-lib/")
          )
            return "export-vendor";
        },
      },
    },
  },
});
