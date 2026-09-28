import fs from "node:fs";

const VITE_CONFIG = "e:/dev/grantdesk/vite.config.ts";

const newContent =
  `import { defineConfig } from "@lovable.dev/lovite";\n` +
  `import react from "@vitejs/plugin-react";\n` +
  `import tailwindcss from "@tailwindcss/vite";\n` +
  `import { tanstackStart } from "@tanstack/react-start/plugin/vite";\n` +
  `import { fileURLToPath, URL } from "node:url";\n` +
  `\n` +
  `// Port 5180 is used locally. In Lovable sandbox, lovite automatically\n` +
  `// switches to host "::" and port 8080 when LOVABLE_SANDBOX=1.\n` +
  `// See: https://www.npmjs.com/package/@lovable.dev/lovite\n` +
  `export default defineConfig({\n` +
  `  plugins: [...tanstackStart({ server: { entry: "server" } }), react(), tailwindcss()],\n` +
  `  resolve: {\n` +
  `    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },\n` +
  `  },\n` +
  `  server: { port: 5180, strictPort: true },\n` +
  `  preview: { port: 5180, strictPort: true },\n` +
  `});\n`;

fs.writeFileSync(VITE_CONFIG, newContent, "utf8");
console.log("vite.config.ts patched with lovite defineConfig!");
