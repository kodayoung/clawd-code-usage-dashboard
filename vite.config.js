import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), {
    name: 'dashboard-production-entry',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        if (bundle['dev.html']) {
          bundle['dev.html'].fileName = 'index.html';
          bundle['index.html'] = bundle['dev.html'];
          delete bundle['dev.html'];
        }
      },
    },
  }],
  build: {
    rollupOptions: { input: fileURLToPath(new URL('./dev.html', import.meta.url)) },
  },
});
