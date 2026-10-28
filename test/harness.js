// خادمان محليان بمنفذين مختلفين (أصلان مختلفان كما في الواقع):
//  - SITE: الملفات الثابتة (يحاكي GitHub Pages)
//  - API : يحاكي Apps Script: POST ثم تحويل 302 ثم JSON مع Access-Control-Allow-Origin: *  (ويرفض OPTIONS)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createEnv } = require('./gas-mock');

const root = path.join(__dirname, '..');
const SITE_PORT = +process.argv[2] || 4101; const API_PORT = +process.argv[3] || 4102;
const env = createEnv();
env.props.setProperty('ROOT_FOLDER_ID', env.rootId);
env.props.setProperty('ADMIN_PASSWORD', 'Admin#123');
env.ctx.setup();

const stash = new Map(); let n = 0; const stats = { options: 0, posts: 0 };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { stats.options++; res.writeHead(405); return res.end(); }
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST' && u.pathname === '/macros/s/FAKE/exec') {
    let body = ''; req.on('data', (c) => { body += c; }).on('end', () => {
      stats.posts++;
      const out = env.ctx.doPost({ postData: { contents: body } }).getContent();
      const id = String(++n); stash.set(id, out);
      res.writeHead(302, { Location: `/macros/echo?id=${id}`, 'Access-Control-Allow-Origin': '*' }); res.end();
    }); return;
  }
  if (u.pathname === '/macros/echo') {
    const out = stash.get(u.searchParams.get('id')); stash.delete(u.searchParams.get('id'));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); return res.end(out || '{}');
  }
  if (u.pathname === '/__seed') {
    const q = u.searchParams; const pid = q.get('project'); const sec = [...env.nodes.values()].find((x) => x.parents.includes(pid) && x.name === q.get('section'));
    env.add({ name: q.get('name'), mimeType: q.get('mime') || 'application/octet-stream', parents: [sec.id], content: Buffer.alloc(+q.get('mb') * 1048576, 1) });
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); return res.end('ok');
  }
  if (u.pathname === '/__stats') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify(stats)); }
  res.writeHead(404); res.end();
}).listen(API_PORT);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let p = u.pathname.replace(/^\/site/, '') || '/';
  if (p === '/') p = '/index.html';
  if (p === '/config.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end(`window.PORTAL={API_URL:'http://127.0.0.1:${API_PORT}/macros/s/FAKE/exec',MAX_UPLOAD_MB:15,DRIVE_API_KEY:'TESTKEY',MAX_DIRECT_MB:100}`); }
  const f = path.join(root, p);
  if (!f.startsWith(root) || f.includes('apps-script') || f.includes('test')) { res.writeHead(404); return res.end(); }
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(b); });
}).listen(SITE_PORT, () => console.log('ready'));
