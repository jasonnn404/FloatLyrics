import { createReadStream, cpSync, existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function kuromojiDictionary(): Plugin {
  const dictionaryDirectory = path.resolve("node_modules/kuromoji/dict");

  return {
    name: "kuromoji-dictionary",
    configureServer(server) {
      server.middlewares.use("/dict", (request, response, next) => {
        const fileName = request.url?.replace(/^\//, "");
        if (!fileName || !/^[\w.-]+$/.test(fileName)) return next();

        const filePath = path.join(dictionaryDirectory, fileName);
        if (!existsSync(filePath)) return next();

        response.setHeader("Content-Type", "application/octet-stream");
        createReadStream(filePath).pipe(response);
      });
    },
    closeBundle() {
      cpSync(dictionaryDirectory, path.resolve("dist/dict"), { recursive: true });
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), kuromojiDictionary()],
  resolve: {
    alias: {
      path: "path-browserify"
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
