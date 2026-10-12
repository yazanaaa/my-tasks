import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Runs the Vercel functions in api/*.js inside the Vite dev server, so `npm run dev`
// gives the full app (login + Neon) without the Vercel CLI.
function vercelApi(): Plugin {
  return {
    name: 'vercel-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        const name = url.pathname.slice(5).replace(/\/$/, '');
        const file = resolve('api', `${name}.js`);
        if (!/^[a-z0-9-]+$/.test(name) || !existsSync(file)) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'not_found' }));
        }
        try {
          const mod = await server.ssrLoadModule(file);
          (req as typeof req & { query: Record<string, string> }).query = Object.fromEntries(url.searchParams);
          await mod.default(req, res);
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'server_error' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === 'development') {
    Object.assign(process.env, loadEnv(mode, process.cwd(), ''), { VERCEL_ENV: 'development' });
  }
  return {
    plugins: [
      react(),
      vercelApi(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'مهامي',
          short_name: 'مهامي',
          description: 'مهامك وأفكارك ومشاريعك وعاداتك في مكان واحد',
          lang: 'ar',
          dir: 'rtl',
          start_url: '/',
          display: 'standalone',
          background_color: '#FFFFFF',
          theme_color: '#FFFFFF',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'فكرة جديدة', short_name: 'فكرة', url: '/ideas?new=1',
              icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
            { name: 'مهمة جديدة', short_name: 'مهمة', url: '/?add=1',
              icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          ],
          // GET replaces the action's query string, hence a path of its own (the app strips it to /ideas).
          share_target: {
            action: '/ideas/share',
            method: 'GET',
            params: { title: 'title', text: 'text', url: 'url' },
          },
        },
        workbox: {
          navigateFallbackDenylist: [/^\/api\//],
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        },
      }),
    ],
    server: { port: 5173 },
  };
});
