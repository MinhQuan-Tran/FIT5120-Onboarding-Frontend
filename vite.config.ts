// vite.config.ts
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('gmp') || tag.startsWith('gmpx'),
        },
      },
    }),
    vueDevTools(),
  ],

  // ⬇️ Add these
  server: {
    headers: {
      // Allow geolocation for this top-level origin in dev
      'Permissions-Policy': 'geolocation=(self)',
    },
  },
  preview: {
    headers: {
      // Same for `vite preview`
      'Permissions-Policy': 'geolocation=(self)',
    },
  },

  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
