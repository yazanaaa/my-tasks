// Local dev server: serves the static app and runs the api/* handlers in-process,
// so the full app (login + Neon) works without the Vercel CLI.
// Environment comes from .env.local (same file `vercel env pull` writes).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const port = Number(process.env.PORT || 3100);

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    const value = m[2].trim().replace(/^"(.*)"$/s, '$1');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
// Local HTTP cannot hold a `Secure` session cookie.
process.env.VERCEL_ENV = 'development';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const handlers = new Map();
async function apiHandler(pathname) {
  const rel = pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  if (!/^[a-z0-9/-]+$/i.test(rel)) return null;
  if (!handlers.has(rel)) {
    const file = join(root, 'api', `${rel}.js`);
    if (!existsSync(file)) return null;
    const mod = await import(pathToFileURL(file).href);
    handlers.set(rel, mod.default);
  }
  return handlers.get(rel);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const handler = await apiHandler(url.pathname);
      if (!handler) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: 'not_found' }));
      }
      req.query = Object.fromEntries(url.searchParams);
      return await handler(req, res);
    }
    const rel = url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^[\/]+/, '');
    const file = join(root, rel);
    if (!file.startsWith(root) || !existsSync(file)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME['.html']);
      return res.end(await readFile(join(root, 'index.html')));
    }
    res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}).listen(port, () => console.log(`dev server on http://localhost:${port}`));
