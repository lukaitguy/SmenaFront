/**
 * Služi produkcioni build (dist/smena-front/browser) i prosleđuje /api i /hubs na backend. `ng serve` ne generiše
 * service worker, pa se PWA i push proveravaju ovako:
 *
 *   npm run build && npm run serve:prod
 *
 * Service worker i push rade samo preko https ili na localhost-u; preko http://192.168.x.x ih browser ne dozvoljava.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT ?? 4200);
const host = process.env.HOST ?? '0.0.0.0';
const api = new URL(process.env.API ?? 'http://localhost:5287');
const root = fileURLToPath(new URL('../dist/smena-front/browser', import.meta.url));

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};

/** Fajlovi koje browser mora da pita ponovo svaki put, inače se nova verzija aplikacije ne bi videla. */
const noCache = new Set(['index.html', 'ngsw.json', 'ngsw-worker.js', 'safety-worker.js', 'manifest.webmanifest']);

const proxied = (url) => url.startsWith('/api/') || url.startsWith('/hubs/') || url === '/api' || url === '/hubs';

const server = http.createServer((req, res) => {
  if (proxied(req.url ?? '')) {
    const upstream = http.request(
      { host: api.hostname, port: api.port, path: req.url, method: req.method, headers: { ...req.headers, host: api.host } },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Backend nije dostupan.');
    });
    req.pipe(upstream);
    return;
  }

  const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path.join(root, path.normalize(pathname));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  // Rute aplikacije (bez ekstenzije) vraćaju index.html.
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = path.extname(pathname) ? file : path.join(root, 'index.html');
  }
  if (!existsSync(file)) {
    res.writeHead(404).end('Nije pronađeno.');
    return;
  }

  const name = path.basename(file);
  res.writeHead(200, {
    'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': noCache.has(name) ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(res);
});

// SignalR (WebSocket) mora da prođe kroz proksi.
server.on('upgrade', (req, socket, head) => {
  if (!proxied(req.url ?? '')) {
    socket.destroy();
    return;
  }
  const upstream = net.connect(Number(api.port), api.hostname, () => {
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries({ ...req.headers, host: api.host }).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

if (!existsSync(path.join(root, 'index.html'))) {
  console.error('Nema builda. Prvo pokreni: npm run build');
  process.exit(1);
}
server.listen(port, host, () => console.log(`Smena (produkcioni build): http://localhost:${port}  ->  API ${api.origin}`));
