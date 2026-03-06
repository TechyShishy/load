import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    alias: {
      '@load/game-core': path.resolve(__dirname, '../game-core/src/index.ts'),
    },
  },
  server: {
    port: 4201,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
});
