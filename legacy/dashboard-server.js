#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 18790;
const CANVAS_DIR = '/Volumes/External HD/.openclaw/canvas/butler';
const SCRIPTS_DIR = '/Volumes/External HD/gitcode/personal-butler';

const GENERATORS = [
  'generate-dashboard.js',
  'generate-finance.js',
  'generate-diet.js',
  'generate-fitness.js',
  'generate-assets.js',
];

function regenerate() {
  const results = [];
  for (const script of GENERATORS) {
    const p = path.join(SCRIPTS_DIR, script);
    if (!fs.existsSync(p)) { results.push(`${script}: not found`); continue; }
    try {
      execSync(`node "${p}"`, { encoding: 'utf8', timeout: 15000 });
      results.push(`${script}: ok`);
    } catch (e) {
      results.push(`${script}: error - ${e.message?.slice(0, 100)}`);
    }
  }
  return results;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Refresh endpoint
  if (url.pathname === '/refresh') {
    const results = regenerate();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, results, time: new Date().toISOString() }));
    return;
  }

  // Serve static files
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(CANVAS_DIR, filePath);

  // Security: prevent path traversal
  if (!filePath.startsWith(CANVAS_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not Found'); return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard server running on http://0.0.0.0:${PORT}`);
  console.log(`Refresh data: http://localhost:${PORT}/refresh`);
});
