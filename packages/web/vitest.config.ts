import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Stub out focus-trap-react in the test environment — jsdom has no
      // tabbable nodes so the real implementation throws on activation.
      'focus-trap-react': path.resolve(__dirname, 'src/__tests__/__mocks__/focus-trap-react.tsx'),
      // Resolve game-core from TypeScript source in tests — dist/ is not built
      // during `yarn test`, so the package.json exports map (import→dist) fails.
      '@load/game-core': path.resolve(__dirname, '../game-core/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: false,
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
