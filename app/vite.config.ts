import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { appConfig, serverConfig } from './config.js';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
      },
    },
  },
  server: {
    port: appConfig.port,
    proxy: {
      '/api': {
        target: `http://localhost:${serverConfig.port}`,
        changeOrigin: true,
      },
    },
  },
});
