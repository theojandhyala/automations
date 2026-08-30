import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

/**
 * Tests run inside workerd, not Node, so the crypto, fetch and Request/Response
 * behaviour under test is the same runtime that serves production.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/index.ts',
      miniflare: {
        compatibilityDate: '2026-08-22',
        compatibilityFlags: ['nodejs_compat'],
        bindings: {
          // Pipeline status only needs to know the binding is configured; AI
          // inference itself remains remote and is not called by unit tests.
          AI: {},
          SUPABASE_URL: 'https://test.supabase.co',
          SUPABASE_ANON_KEY: 'anon-test-key',
          OWNER_EMAIL: 'owner@example.com',
          SUPABASE_SERVICE_ROLE_KEY: 'service-test-key',
          // 32 bytes, base64
          TOKEN_ENCRYPTION_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
          TIKTOK_CLIENT_KEY: 'test-client-key',
          TIKTOK_CLIENT_SECRET: 'test-client-secret',
          TIKTOK_REDIRECT_URI: 'https://example.test/api/tiktok/callback',
        },
      },
    }),
  ],
  test: {
    include: ['test/**/*.spec.ts'],
  },
});
