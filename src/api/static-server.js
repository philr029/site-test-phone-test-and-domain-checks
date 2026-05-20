/**
 * Serves docs/ and proxies nothing — use alongside API for local dashboard dev.
 * Run: npm run dev:dashboard
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.join(__dirname, '../../docs');
const PORT = Number(process.env.DASHBOARD_PORT || 8080);

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    let filePath = path.join(docsRoot, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) filePath = path.join(filePath, 'index.html');
    if (!filePath.startsWith(docsRoot)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${PORT} is already in use. Stop it with: lsof -i :${PORT} then kill <PID>\n` +
        `Or: DASHBOARD_PORT=8081 npm run dev:dashboard\n`
    );
    process.exit(1);
  }
  throw err;
});

const HOST = process.env.DASHBOARD_HOST || '127.0.0.1';

server.listen(PORT, HOST, () => {
  console.log(`Dashboard UI at http://${HOST}:${PORT}`);
  console.log(`Start API separately: npm run dev:api (port ${process.env.DASHBOARD_API_PORT || 3847})`);
});
