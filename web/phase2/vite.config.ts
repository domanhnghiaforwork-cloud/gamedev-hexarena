import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@ai': fileURLToPath(new URL('./src/ai', import.meta.url)),
      '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
      '@input': fileURLToPath(new URL('./src/input', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@storage': fileURLToPath(new URL('./src/storage', import.meta.url)),
      '@feedback': fileURLToPath(new URL('./src/feedback', import.meta.url)),
      '@net': fileURLToPath(new URL('./src/net', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['hexarena.ngrok.app', '.ngrok.app', '.ngrok-free.app'],
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
