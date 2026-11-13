import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, strictPort: true },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
