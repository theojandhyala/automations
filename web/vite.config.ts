import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // `wrangler dev` serves the API next door during local development.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
