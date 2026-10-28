// محاكاة بيئة Google Apps Script (DriveApp, Utilities, CacheService...) في Node
// لتشغيل Code.gs نفسه واختبار منطقه دون الاتصال بـ Google.
// تنبيه: هذا لا يختبر سلوك منصة Google الحقيقية (الحصص، CORS، البطء...).
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const signed = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const unsigned = (arr) => Buffer.from(Array.from(arr, (b) => (b + 256) % 256));

function createEnv() {
  const nodes = new Map();
  let seq = 1;
  const newId = () => 'id' + String(seq++).padStart(4, '0') + crypto.randomBytes(3).toString('hex');
  const stats = { calls: 0 };

  function add(n) {
    const id = newId();
    nodes.set(id, { id, trashed: false, description: '', content: null, parents: [], modified: new Date(), ...n });
    return id;
  }
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const blobOf = (data, mime, name) => {
    const buf = Buffer.isBuffer(data) ? data : typeof data === 'string' ? Buffer.from(data, 'utf8') : unsigned(data);
    return { getBytes: () => signed(buf), getDataAsString: () => buf.toString('utf8'), getContentType: () => mime, getName: () => name, _buf: buf };
  };
  const live = (id) => nodes.get(id);

  function wrap(id) {
    const n = () => live(id);
    const common = {
      getId: () => id, getName: () => n().name, setName: (x) => { n().name = x; }, isTrashed: () => n().trashed,
      setTrashed: (t) => { n().trashed = !!t; }, getParents: () => iter(n().parents.filter((p) => live(p)).map(wrap)),
      setSharing: (a, p) => { n().sharing = [a, p]; }, getDescription: () => n().description, setDescription: (d) => { n().description = d; },
    };
    if (n().mimeType === 'application/vnd.google-apps.folder') {
      const kids = (isFolder) => [...nodes.values()].filter((k) => k.parents.includes(id) && !k.trashed && (k.mimeType === 'application/vnd.google-apps.folder') === isFolder);
      return {
        ...common,
        getFolders: () => iter(kids(true).map((k) => wrap(k.id))),
        getFiles: () => iter(kids(false).map((k) => wrap(k.id))),
        getFoldersByName: (nm) => iter(kids(true).filter((k) => k.name === nm).map((k) => wrap(k.id))),
        getFilesByName: (nm) => iter(kids(false).filter((k) => k.name === nm).map((k) => wrap(k.id))),
        createFolder: (nm) => wrap(add({ name: nm, mimeType: 'application/vnd.google-apps.folder', parents: [id] })),
        createFile(a, content, mime) {
          if (typeof a === 'object') return wrap(add({ name: a.getName(), mimeType: a.getContentType(), parents: [id], content: a._buf }));
          return wrap(add({ name: a, mimeType: mime || 'text/plain', parents: [id], content: Buffer.from(String(content)) }));
        },
      };
    }
    return {
      ...common,
      getMimeType: () => n().mimeType, getSize: () => (n().content ? n().content.length : 0), getLastUpdated: () => n().modified,
      setContent: (t) => { n().content = Buffer.from(String(t)); },
      getBlob: () => blobOf(n().content || Buffer.alloc(0), n().mimeType, n().name),
      getAs: (m) => blobOf(Buffer.from('%PDF-export ' + n().name), m, n().name + '.pdf'),
    };
  }

  const rootId = add({ name: 'ROOT', mimeType: 'application/vnd.google-apps.folder' });

  function compile(q) {
    const lits = [];
    let s = q.replace(/'((?:[^'\\]|\\.)*)'/g, (_, x) => { lits.push(x); return 'S' + (lits.length - 1); });
    s = s.replace(/S(\d+) in parents/g, 'P($1)').replace(/(title|mimeType) contains S(\d+)/g, 'C("$1",$2)')
      .replace(/trashed=false/g, '!n.trashed').replace(/\band\b/g, '&&').replace(/\bor\b/g, '||');
    const f = new Function('n', 'L', `const P=i=>n.parents.includes(L[i]);const C=(k,i)=>String(k==='title'?n.name:n.mimeType).toLowerCase().includes(L[i].toLowerCase());return (${s});`);
    return (n) => f(n, lits);
  }

  const DriveApp = {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
    getFolderById(id) { stats.calls++; const n = live(id); if (!n || n.mimeType !== 'application/vnd.google-apps.folder') throw new Error('Exception: Unexpected error while getting the method or property getFolderById on object DriveApp.'); return wrap(id); },
    getFileById(id) { stats.calls++; const n = live(id); if (!n || n.mimeType === 'application/vnd.google-apps.folder') throw new Error('Exception: File not found'); return wrap(id); },
    searchFiles(q) { stats.calls++; const t = compile(q); return iter([...nodes.values()].filter((n) => n.mimeType !== 'application/vnd.google-apps.folder' && t(n)).map((n) => wrap(n.id))); },
  };

  const store = new Map();
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (store.has(k) ? store.get(k) : null), setProperty: (k, v) => { store.set(k, String(v)); }, deleteProperty: (k) => { store.delete(k); },
    }),
  };
  const cmap = new Map();
  const CacheService = {
    getScriptCache: () => ({
      get(k) { const e = cmap.get(k); if (!e) return null; if (e.exp < Date.now()) { cmap.delete(k); return null; } return e.v; },
      put(k, v, secs) { if (String(v).length > 100 * 1024) throw new Error('Argument too large: value'); cmap.set(k, { v: String(v), exp: Date.now() + (secs || 600) * 1000 }); },
      remove(k) { cmap.delete(k); },
    }),
  };
  const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  const b64 = (buf, urlsafe) => { const s = buf.toString('base64'); return urlsafe ? s.replace(/\+/g, '-').replace(/\//g, '_') : s; };
  const toBuf = (d) => (typeof d === 'string' ? Buffer.from(d, 'utf8') : unsigned(d));
  const Utilities = {
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest: (alg, s) => signed(crypto.createHash('sha256').update(toBuf(s)).digest()),
    computeHmacSha256Signature: (msg, key) => signed(crypto.createHmac('sha256', key).update(toBuf(msg)).digest()),
    base64EncodeWebSafe: (d) => b64(toBuf(d), true),
    base64Encode: (d) => b64(toBuf(d), false),
    base64Decode: (s) => signed(Buffer.from(String(s), 'base64')),
    newBlob: (data, mime, name) => blobOf(data, mime, name),
  };
  const ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput(s) { return { _s: s, setMimeType() { return this; }, getContent() { return this._s; } }; },
  };
  const logs = [];
  const sandbox = {
    DriveApp, PropertiesService, CacheService, LockService, Utilities, ContentService, MimeType: { PLAIN_TEXT: 'text/plain' },
    Logger: { log: (m) => logs.push(String(m)) }, console: { error: () => {}, log: () => {} }, Date, JSON, Math, Intl, String, Array, Object, parseInt, RegExp, Error, Number, Boolean,
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });

  const call = (payload) => {
    const out = ctx.doPost({ postData: { contents: JSON.stringify(payload) } });
    return JSON.parse(out.getContent());
  };
  return { ctx, call, props: PropertiesService.getScriptProperties(), nodes, rootId, wrap, add, logs, stats, cmap, DriveApp };
}

module.exports = { createEnv };
