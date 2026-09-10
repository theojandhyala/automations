import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  publicDir: process.env.VITE_DEADSET_HQ === 'true' ? 'hq-public' : 'public',
  plugins: [react(), {
    name: 'deadset-hq-brand',
    transformIndexHtml: { order: 'pre', handler(html) {
      if (process.env.VITE_DEADSET_HQ !== 'true') return html;
      return html.replace('/src/main.tsx', '/src/main-hq.tsx').replace('JARVIS Command Center', 'DEADSET HQ — Growth, with intent')
        .replace('content="JARVIS"', 'content="DEADSET HQ"')
        .replace('content="#061a21"', 'content="#0b0b0b"')
        .replace('href="/arc-reactor.svg" type="image/svg+xml"', 'href="/deadset/icon.png" type="image/png"')
        .replace('href="/arc-reactor-180.png"', 'href="/deadset/icon.png"')
        .replace('<link rel="manifest" href="/manifest.webmanifest" />', '');
    } },
  }],
  server: {
    // `wrangler dev` serves the API next door during local development.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
