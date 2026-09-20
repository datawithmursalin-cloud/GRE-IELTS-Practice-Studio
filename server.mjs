import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
const publicPaths = new Set(['/index.html','/styles.css','/enhancements.css','/app.mjs','/engine.mjs','/questions.mjs','/history.mjs']);

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const route = pathname === '/' ? '/index.html' : pathname;
  if (!publicPaths.has(route)) {
    response.writeHead(404).end('Not found');
    return;
  }
  const path = resolve(root, `.${route}`);
  try {
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': `${types[extname(path)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' }).end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`GRE practice app: http://localhost:${port}`));
