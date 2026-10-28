'use strict';
/* ===== أدوات ===== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CFG = Object.assign({ API_URL: '', MAX_UPLOAD_MB: 15, MAX_DIRECT_MB: 100, DRIVE_API_KEY: '' }, window.PORTAL || {});
const LS = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v === null || v === '' ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* */ } },
};
const S = { me: null, cfg: null, pub: null, projects: null, project: null, q: '', lang: 'ar', idx: 0, settingsLang: null };

/* ===== اللغة ===== */
const I = window.I18N;
function detectLang() {
  const saved = LS.get('lang'); if (saved && I.langs[saved]) return saved;
  const n = (navigator.language || 'ar').toLowerCase();
  if (n.startsWith('ku') || n.startsWith('ckb')) return 'ku';
  if (n.startsWith('en')) return 'en';
  return 'ar';
}
function t(key, vars) {
  let s = (I[S.lang] && I[S.lang][key]) ?? I.ar[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}
function trErr(msg) {
  msg = String(msg || '');
  if (S.lang === 'ar') return msg;
  const exact = (window.I18N_ERR[S.lang] || {})[msg]; if (exact) return exact;
  for (const [pre, tr] of (window.I18N_ERR_PREFIX[S.lang] || [])) if (msg.startsWith(pre)) return tr;
  return msg;
}
function TX() {
  const src = (S.cfg && S.cfg.texts) || (S.pub && S.pub.texts) || {};
  return src[S.lang] || src.ar || { siteName: '', tagline: '', projectsTitle: '', whatsappIntro: '', labels: {} };
}
const L = () => TX().labels || {};
function applyLang() {
  const d = document.documentElement; d.lang = S.lang; d.dir = I.langs[S.lang].dir;
  document.title = TX().siteName || document.title;
}
async function setLang(l) {
  if (!I.langs[l] || l === S.lang) return;
  S.lang = l; LS.set('lang', l); applyLang(); updateInstallBtn();
  if (S.me && S.cfg) { shell('<div class="spin"></div>'); await route(); } else renderLogin();
}

/* ===== الأيقونات ===== */
const P = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const IC = {
  wa: P('<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5z"/><path d="M9.2 8.8c.2 2.4 2.6 4.8 5 5l1-1.2-1.7-.9-.7.6c-.7-.3-1.4-1-1.7-1.7l.6-.7-.9-1.7z"/>'),
  open: P('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  video: P('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m10 9.5 5 2.5-5 2.5z"/>'),
  image: P('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>'),
  pdf: P('<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 14h6M9 17h4"/>'),
  sheet: P('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>'),
  doc: P('<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M9 13h6M9 16h6M9 10h2"/>'),
  audio: P('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  link: P('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.800 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  text: P('<path d="M5 6h14M5 11h14M5 16h9"/>'),
  other: P('<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>'),
  upload: P('<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'),
  download: P('<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  trash: P('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>'),
  back: P('<path d="M9 6l6 6-6 6"/>'),
  search: P('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  refresh: P('<path d="M20 11a8 8 0 0 0-14.3-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14.3 4.5L20 15M20 20v-5h-5"/>'),
  settings: P('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>'),
  user: P('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.5 3.4-5.5 7-5.5s6.4 2 7 5.5"/>'),
  globe: P('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.600 5.900 12 3.500z"/>'),
  edit: P('<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>'),
  site: P('
<path fill="#6f3622" d="M1774 706 L1258 200 L895 440 L963 505 L1247 319 L1682 745 L1681 1426 L1294 1699 L1297 1057 L777 543 L241 902 L236 1641 L285 1689 L813 1320 L815 940 L724 850 L721 1271 L329 1543 L333 952 L766 662 L1205 1096 L1201 1805 L1245 1847 L1773 1475 Z"/>
'),
};
const CAT_IC = { video: IC.video, image: IC.image, pdf: IC.pdf, sheet: IC.sheet, doc: IC.doc, audio: IC.audio, link: IC.link, text: IC.text, other: IC.other };

function toast(msg, type = '') {
  const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), type === 'err' ? 6000 : 3200); return el;
}
function progressToast() {
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = '<div class="t"></div><div class="bar"><i></i></div>'; $('#toasts').appendChild(el);
  return { set(text, pct) { $('.t', el).textContent = text; $('i', el).style.width = Math.max(2, Math.min(100, pct)) + '%'; }, done() { el.remove(); } };
}
const fmtSize = (n) => (!n ? '' : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB');
const norm = (s) => String(s || '').toLowerCase().replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');

/* ===== الاتصال بالخلفية (Google Apps Script) ===== */
const tokenStore = {
  get() { return LS.get('sp_token') || ''; },
  set(v) { LS.set('sp_token', v || null); },
};
async function rpc(action, payload = {}) {
  if (!CFG.API_URL) throw new Error(t('err_cfg'));
  let res;
  try {
    res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: tokenStore.get(), ...payload }) });
  } catch { throw new Error(t('err_net')); }
  let j; try { j = await res.json(); } catch { throw new Error(t('err_resp')); }
  if (!j.ok) {
    const e = new Error(trErr(j.error) || t('err_generic')); e.status = j.status;
    if (j.status === 401 && action !== 'login') { tokenStore.set(''); S.me = null; S.cfg = null; renderLogin(); }
    throw e;
  }
  return j.data;
}
const siteUrl = (tok) => new URL('share.html?t=' + encodeURIComponent(tok) + '&l=' + S.lang, document.baseURI).href;
function normProject(p) {
  p.shareUrl = siteUrl(p.tokens.project); p.sectionShareUrls = {};
  for (const k of Object.keys(p.tokens.sections)) p.sectionShareUrls[k] = siteUrl(p.tokens.sections[k]);
  return p;
}
// تبقى بقية الواجهة تتعامل مع "مسارات" بسيطة؛ هنا تُترجم إلى إجراءات الخلفية
async function api(method, url, body = {}) {
  let m;
  if (url === '/api/public') return rpc('public');
  if (url === '/api/login') { const r = await rpc('login', body); tokenStore.set(r.token); return { user: r.user }; }
  if (url === '/api/logout') { tokenStore.set(''); return { ok: true }; }
  if (url === '/api/me') return rpc('me');
  if (url === '/api/me/password') { const r = await rpc('changePassword', body); if (r.token) tokenStore.set(r.token); return { ok: true }; }
  if (url === '/api/config') return rpc('config');
  if (url === '/api/refresh') return rpc('refresh');
  if (url === '/api/projects') return method === 'GET' ? rpc('projects') : rpc('createProject', body);
  if ((m = /^\/api\/projects\/([^/]+)\/links$/.exec(url))) return rpc('addLink', { projectId: decodeURIComponent(m[1]), ...body });
  if ((m = /^\/api\/projects\/([^/]+)\/notes$/.exec(url))) return rpc('addNote', { projectId: decodeURIComponent(m[1]), ...body });
  if ((m = /^\/api\/projects\/([^/]+)$/.exec(url))) {
    const id = decodeURIComponent(m[1]);
    if (method === 'GET') { const r = await rpc('project', { id }); return { project: normProject(r.project) }; }
    if (method === 'PATCH') return rpc('renameProject', { id, ...body });
    if (method === 'DELETE') return rpc('deleteProject', { id });
  }
  if ((m = /^\/api\/files\/(.+)$/.exec(url))) return rpc('deleteFile', { id: decodeURIComponent(m[1]) });
  if (url === '/api/admin/users') return method === 'GET' ? rpc('users') : rpc('createUser', body);
  if ((m = /^\/api\/admin\/users\/(.+)$/.exec(url))) {
    const id = decodeURIComponent(m[1]);
    return method === 'DELETE' ? rpc('deleteUser', { id }) : rpc('updateUser', { id, ...body });
  }
  if (url === '/api/admin/settings') return method === 'GET' ? rpc('getSettings') : rpc('updateSettings', body);
  throw new Error(t('err_path') + ': ' + url);
}

/* ===== السجل (زر الرجوع) والنوافذ ===== */
// كل نافذة تُضيف عنصراً في سجل المتصفح فيغلقها زر الرجوع بدل مغادرة الصفحة (مهم للتطبيق المثبّت)
const modals = []; let skipPop = 0; let modalSeq = 0;
function modal({ title, body, actions = [], wide = false, onClose }) {
  const id = 'm' + (++modalSeq);
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="dlg ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${title ? `<h2>${esc(title)}</h2>` : ''}<div class="mb">${body}</div>${actions.length ? '<div class="ft"></div>' : ''}</div>`;
  const entry = { id }; let closed = false;
  const close = (fromPop) => {
    if (closed) return; closed = true;
    ov.remove(); document.removeEventListener('keydown', onKey);
    const i = modals.indexOf(entry); if (i >= 0) modals.splice(i, 1);
    if (fromPop !== true && history.state && history.state.modal === id) { skipPop++; history.back(); }
    onClose && onClose();
  };
  entry.close = close;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  const ft = $('.ft', ov);
  actions.forEach((a) => {
    const b = document.createElement('button'); b.className = 'btn ' + (a.cls || ''); b.textContent = a.label; b.type = 'button';
    b.onclick = async () => { b.disabled = true; try { const r = await a.run?.(ov); if (r !== false) close(); } catch (e) { toast(e.message, 'err'); } finally { b.disabled = false; } };
    ft.appendChild(b);
  });
  document.body.appendChild(ov);
  history.pushState({ modal: id, idx: S.idx }, '');
  modals.push(entry);
  const first = $('input,select,textarea', ov); first && first.focus();
  return { el: ov, close };
}
function navigate(h) {
  if (location.hash === h) return route();
  history.pushState({ idx: ++S.idx }, '', h);
  return route();
}
window.addEventListener('popstate', (e) => {
  if (skipPop > 0) { skipPop--; return; }
  const st = e.state || {};
  if (modals.length) { modals[modals.length - 1].close(true); return; }
  if (st.modal) { history.back(); return; } // عنصر نافذة قديمة: تجاوزه
  S.idx = st.idx || 0;
  route();
});
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (!a || a.dataset.act || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault(); navigate(a.getAttribute('href'));
});

/* ===== واتساب ===== */
function waNumber() {
  const raw = ($('#clientNum') || {}).value || '';
  let d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = (S.cfg.countryCode || '964') + d.slice(1);
  return d;
}
const waUrl = (text) => `https://wa.me/${waNumber()}?text=${encodeURIComponent(text)}`;
function numberOk() {
  const raw = ($('#clientNum') || {}).value || '';
  if (raw.trim() && waNumber().length < 9) { toast(t('client_short'), 'err'); return false; }
  return true;
}
function sendWA(text) { if (!numberOk()) return; window.open(waUrl(text), '_blank', 'noopener'); }
async function sendWAAsync(build) {
  if (!numberOk()) return;
  const w = window.open('', '_blank');
  try {
    const text = await build();
    if (!text) { w && w.close(); return; }
    if (w) w.location.href = waUrl(text); else location.href = waUrl(text);
  } catch (e) { w && w.close(); toast(e.message, 'err'); }
}
// قوالب الرسائل تُبنى بلغة الموظف المختارة حالياً (نص الافتتاح وأسماء الأقسام)
const secLabel = (k) => (k.startsWith('info_') ? `${L().info}${t('msg_info_sep')}${L()[k]}` : L()[k]);
const intro = (p) => (TX().whatsappIntro || '').replace(/\{project\}/g, p.name);
const itemLine = (i) => (i.kind === 'text' ? `• ${i.name}\n${i.text}` : `• ${i.name}\n${i.shareUrl}`);
const lines = (items) => items.map(itemLine).join('\n\n');
const tooLong = (txt) => encodeURIComponent(txt).length > 3500;
function msgFile(p, it) { return it.kind === 'text' ? it.text : `${intro(p)}\n\n${it.name}\n${it.shareUrl}`; }
function msgSection(p, keys, label, pageUrl) {
  const items = keys.flatMap((k) => p.sections[k]);
  if (!items.length) { toast(t('no_files_section'), 'err'); return null; }
  const body = keys.length > 1 ? keys.filter((k) => p.sections[k].length).map((k) => `*${secLabel(k)}*\n${lines(p.sections[k])}`).join('\n\n') : lines(items);
  let txt = `${intro(p)}\n\n*${label}*\n\n${body}`;
  if (tooLong(txt)) txt = `${intro(p)}\n\n*${label}*\n${pageUrl}`;
  return txt;
}
function msgProject(p) {
  const keys = Object.keys(p.sections).filter((k) => p.sections[k].length);
  if (!keys.length) { toast(t('no_files_project'), 'err'); return null; }
  let txt = `${intro(p)}\n\n` + keys.map((k) => `*${secLabel(k)}*\n${lines(p.sections[k])}`).join('\n\n');
  if (tooLong(txt)) txt = `${intro(p)}\n${p.shareUrl}`;
  return txt;
}

/* ===== إرسال الملف نفسه (نافذة المشاركة في الجهاز) ===== */
const APPS_SCRIPT_MAX = 45 * 1048576; // حد المسار الاحتياطي عبر Apps Script (على دفعات)
const CHUNK = 6 * 1048576;
const shareMode = () => LS.get('sendMode') !== 'link';
const directLimit = () => (CFG.DRIVE_API_KEY ? CFG.MAX_DIRECT_MB * 1048576 : Math.min(CFG.MAX_DIRECT_MB * 1048576, APPS_SCRIPT_MAX));
function canShareNow(items) {
  try {
    if (!navigator.share || !navigator.canShare) return false;
    const dummy = items.filter((i) => i.kind === 'file').map((i) => new File([''], i.name, { type: i.mime && i.mime !== 'application/octet-stream' ? i.mime : '' }));
    return dummy.length > 0 && navigator.canShare({ files: dummy });
  } catch { return false; }
}
function b64ToBytes(b64) {
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function fetchDirect(it, onPct) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(it.id)}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(CFG.DRIVE_API_KEY)}`);
  if (!res.ok) throw new Error('drive ' + res.status);
  const total = +res.headers.get('content-length') || it.size || 0;
  const reader = res.body.getReader(); const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; if (total) onPct(Math.min(1, got / total)); }
  const type = it.mime && it.mime !== 'application/octet-stream' ? it.mime : (res.headers.get('content-type') || '').split(';')[0];
  return new File(chunks, it.name, { type });
}
async function fetchAsFileRaw(it, onPct) {
  const native = (it.mime || '').startsWith('application/vnd.google-apps.');
  if (CFG.DRIVE_API_KEY && !native) {
    try { return await fetchDirect(it, onPct); } catch (e) { if (it.size > APPS_SCRIPT_MAX) throw e; }
  }
  if (it.size > APPS_SCRIPT_MAX) throw new Error('too big');
  const parts = []; let off = 0; let total = it.size || 1; let name = it.name; let mime = it.mime;
  do {
    let r;
    for (let k = 0; ; k++) { try { r = await rpc('fileData', { id: it.id, offset: off, length: CHUNK }); break; } catch (e) { if (k >= 2) throw e; } }
    if (r.offset === undefined) { parts.push(b64ToBytes(r.data)); name = r.name; mime = r.mime; break; } // خلفية قديمة: الملف كاملاً
    const b = b64ToBytes(r.data); parts.push(b); off += b.length; total = r.total; name = r.name; mime = r.mime;
    onPct(Math.min(1, off / (total || 1)));
    if (!b.length) break;
  } while (off < total);
  return new File(parts, name, { type: mime });
}
/* ذاكرة الملفات المجهّزة على الهاتف: لا يُعاد التحميل في المرة القادمة */
const FCACHE = 'portal-files-v1'; const FCACHE_MAX = 600 * 1048576;
const fkey = (it) => `https://files.local/${encodeURIComponent(it.id)}/${it.size || 0}`;
async function cacheGet(it) {
  try {
    if (!window.caches || (it.mime || '').startsWith('application/vnd.google-apps.')) return null;
    const r = await (await caches.open(FCACHE)).match(fkey(it)); if (!r) return null;
    const blob = await r.blob();
    return new File([blob], decodeURIComponent(r.headers.get('x-name') || it.name), { type: r.headers.get('x-mime') || blob.type });
  } catch { return null; }
}
async function cachePut(it, file) {
  try {
    if (!window.caches || (it.mime || '').startsWith('application/vnd.google-apps.')) return;
    const c = await caches.open(FCACHE);
    await c.put(fkey(it), new Response(file, { headers: { 'x-name': encodeURIComponent(file.name), 'x-mime': file.type || '', 'x-t': String(Date.now()), 'x-size': String(file.size) } }));
    const reqs = await c.keys(); let tot = 0; const rows = [];
    for (const rq of reqs) { const r = await c.match(rq); const sz = +r.headers.get('x-size') || 0; tot += sz; rows.push({ rq, sz, t: +r.headers.get('x-t') || 0 }); }
    rows.sort((a, b) => a.t - b.t);
    for (const x of rows) { if (tot <= FCACHE_MAX) break; await c.delete(x.rq); tot -= x.sz; }
  } catch { /* الذاكرة ممتلئة أو غير متاحة: نتجاهل */ }
}
async function clearFileCache() { try { if (window.caches) await caches.delete(FCACHE); } catch { /* */ } }
async function fetchAsFile(it, onPct) {
  const hit = await cacheGet(it); if (hit) { onPct(1); return hit; }
  const f = await fetchAsFileRaw(it, onPct);
  cachePut(it, f);
  return f;
}
function readyModal(title, note, label, run) {
  modal({ title, body: `<p class="note">${esc(note)}</p>`, actions: [{ label: t('cancel') }, { label, cls: 'wa', async run() { await run(); } }] });
}
function fallbackLink(inGesture, fn, why) {
  if (inGesture) { if (why) toast(why); return fn(); }
  readyModal(t('fb_title'), (why ? why + ' ' : '') + t('fb_note'), t('fb_open_wa'), async () => fn());
}
// items: ملفات/روابط/نصوص. linkFn: ما يُرسل عند عدم دعم المشاركة (رسالة روابط)
async function sendItems(items, title, linkFn, inGesture = true) {
  if (!items.length) return toast(t('no_files'), 'err');
  const files = items.filter((i) => i.kind === 'file'); const extras = items.filter((i) => i.kind !== 'file');
  if (!shareMode() || !files.length) return linkFn();
  const lim = directLimit();
  if (!canShareNow(items)) return fallbackLink(inGesture, linkFn, t('fb_unsupported'));
  if (files.some((i) => i.size > lim) || files.reduce((n, i) => n + i.size, 0) > lim * 2) return fallbackLink(inGesture, linkFn, t('fb_big', { mb: Math.round(lim / 1048576) }));
  const pt = progressToast(); const list = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const base = { i: i + 1, n: files.length, name: files[i].name };
      pt.set(t('preparing', base), (i / files.length) * 100);
      list.push(await fetchAsFile(files[i], (f) => pt.set(t('preparing_pct', { ...base, pct: Math.round(f * 100) }), ((i + f) / files.length) * 100)));
    }
  } catch { pt.done(); return fallbackLink(false, linkFn, t('fb_fail')); }
  pt.done();
  const data = { files: list, title };
  if (extras.length) data.text = extras.map((x) => (x.kind === 'text' ? `${x.name}\n${x.text}` : `${x.name}\n${x.shareUrl}`)).join('\n\n');
  if (!navigator.canShare(data)) return fallbackLink(false, linkFn, t('fb_type'));
  const go = async () => {
    try { await navigator.share(data); if (extras.length) toast(t('sent_extras'), 'ok'); }
    catch (e) {
      if (e && e.name === 'AbortError') return;
      if (e && e.name === 'NotAllowedError') throw e;
      fallbackLink(false, linkFn, t('fb_fail'));
    }
  };
  try { await go(); }
  catch { readyModal(t('ready_title'), (list.length === 1 ? t('ready_one') : t('ready_n', { n: list.length })) + ' ' + t('ready_note'), t('ready_btn'), async () => { try { await navigator.share(data); } catch (e) { if (!e || e.name !== 'AbortError') fallbackLink(false, linkFn, t('fb_fail')); } }); }
}

/* ===== الإطار العام ===== */
const modeBtn = () => (shareMode() ? `${IC.upload}<span class="t">${esc(t('mode_file'))}</span>` : `${IC.link}<span class="t">${esc(t('mode_link'))}</span>`);
const langBtn = () => `${IC.globe}<span class="t">${esc(I.langs[S.lang].short)}</span>`;
function shell(inner) {
  const admin = S.me.role === 'admin';
  $('#app').innerHTML = `
  <header class="top"><div class="top-in">
    <a class="brand" href="#/"><span class="mark">${IC.site}</span><span style="min-width:0"><b>${esc(TX().siteName)}</b>${TX().tagline ? `<small>${esc(TX().tagline)}</small>` : ''}</span></a>
    <div class="top-act">
      <button class="ibtn" data-act="lang" title="${esc(t('language'))}" aria-label="${esc(t('language'))}">${langBtn()}</button>
      <button class="ibtn" data-act="mode" title="${esc(t('mode_title'))}" aria-label="${esc(t('mode_title'))}">${modeBtn()}</button>
      <button class="ibtn" data-act="refresh" title="${esc(t('refresh'))}" aria-label="${esc(t('refresh'))}">${IC.refresh}</button>
      ${admin ? `<a class="ibtn" href="#/admin" title="${esc(t('admin_panel'))}">${IC.settings}<span class="t">${esc(t('admin'))}</span></a>` : ''}
      <button class="ibtn" data-act="me" title="${esc(t('account'))}" aria-label="${esc(t('account'))}">${IC.user}<span class="t">${esc(S.me.name)}</span></button>
    </div>
    <label class="client">${IC.wa}<span>${esc(t('client_label'))}</span><input id="clientNum" type="tel" inputmode="tel" autocomplete="off" placeholder="${esc(t('client_ph'))}" value="${esc(LS.get('clientNum') || '')}"></label>
  </div></header>
  <main id="view">${inner}</main>`;
  applyLang();
  $('#clientNum').addEventListener('input', (e) => LS.set('clientNum', e.target.value));
}
function setView(html) { const v = $('#view'); if (v) v.innerHTML = html; else shell(html); }

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.tagName === 'A') e.preventDefault();
  try { await actions[b.dataset.act]?.(b, e); } catch (err) { toast(err.message, 'err'); }
});

/* ===== تسجيل الدخول ===== */
function renderLogin() {
  applyLang();
  $('#app').innerHTML = `<div class="login"><button class="ibtn login-lang" data-act="lang" aria-label="${esc(t('language'))}">${langBtn()}</button><form id="lf" autocomplete="on">
    <div class="mark">${IC.site}</div><h1>${esc(TX().siteName || '')}</h1><p class="sub">${esc(TX().tagline || t('login_hint'))}</p>
    <div id="le"></div>
    <label class="fld"><span>${esc(t('login_user'))}</span><input name="username" autocomplete="username" autocapitalize="none" required dir="ltr" class="ltr-in"></label>
    <label class="fld"><span>${esc(t('login_pass'))}</span><input name="password" type="password" autocomplete="current-password" required dir="ltr" class="ltr-in"></label>
    <button class="btn pri" type="submit">${esc(t('login_btn'))}</button>
    <p class="note" style="text-align:center;margin:14px 0 0">${esc(t('login_stay'))}</p></form></div>`;
  $('#lf').onsubmit = async (ev) => {
    ev.preventDefault(); const f = new FormData(ev.target); const btn = $('button[type=submit]', ev.target); btn.disabled = true;
    try { const r = await api('POST', '/api/login', { username: f.get('username'), password: f.get('password') }); S.me = r.user; await start(); }
    catch (err) { S.me = null; $('#le').innerHTML = `<div class="err">${esc(err.message)}</div>`; btn.disabled = false; }
  };
}

/* ===== قائمة المشاريع ===== */
async function viewProjects() {
  setView('<div class="spin"></div>');
  if (!S.projects) S.projects = (await api('GET', '/api/projects')).projects;
  drawProjects();
}
function cover(p, cls = '') {
  return p.coverUrl ? `<span class="cover ${cls}" style="background-image:url('${esc(p.coverUrl)}')" role="img" aria-label="${esc(p.name)}"></span>`
    : `<span class="cover fb ${cls}"><span>${esc([...p.name][0] || '')}</span></span>`;
}
function drawProjects() {
  const q = norm(S.q); const list = S.projects.filter((p) => !q || norm(p.name).includes(q)); const admin = S.me.role === 'admin';
  const cards = list.map((p) => `<article class="pcard"><a class="cover-link" href="#/p/${encodeURIComponent(p.id)}" tabindex="-1" aria-hidden="true">${cover(p)}</a>
    <h2><a href="#/p/${encodeURIComponent(p.id)}">${esc(p.name)}</a></h2>
    <div class="row"><a class="btn sm" href="#/p/${encodeURIComponent(p.id)}">${esc(t('open_project'))}</a>
    <button class="btn sm wa" data-act="send-project-id" data-id="${esc(p.id)}">${IC.wa}<span>${esc(t('send_project'))}</span></button></div></article>`).join('');
  const empty = S.projects.length ? `<div class="empty-state"><b>${esc(t('noresult_title'))}</b>${esc(t('noresult_text'))}</div>`
    : `<div class="empty-state"><b>${esc(t('empty_title'))}</b>${esc(admin ? t('empty_admin') : t('empty_sales'))}</div>`;
  setView(`<div class="page-h"><h1>${esc(TX().projectsTitle)}<small>${S.projects.length}</small></h1>
    <label class="search">${IC.search}<input id="q" type="search" placeholder="${esc(t('search'))}" value="${esc(S.q)}" aria-label="${esc(t('search'))}"></label>
    ${admin ? `<button class="btn pri" data-act="new-project">${IC.plus}<span>${esc(t('new_project'))}</span></button>` : ''}</div>
    ${list.length ? `<div class="grid">${cards}</div>` : empty}`);
  const qi = $('#q'); qi.addEventListener('input', () => { S.q = qi.value; const pos = qi.selectionStart; drawProjects(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); });
}

/* ===== صفحة المشروع ===== */
const SECS = ['info', 'videos', 'maps', 'location', 'prices'];
async function viewProject(id, sec = S.sec) {
  setView('<div class="spin"></div>');
  const { project } = await api('GET', '/api/projects/' + encodeURIComponent(id));
  S.project = project; S.sec = SECS.includes(sec) ? sec : null; drawProject();
}
const count = (arr) => (arr.length ? `<span class="cnt">${arr.length}</span>` : '');
function fileRow(it) {
  const admin = S.me.role === 'admin';
  const del = admin ? `<button class="iconb" data-act="del-file" data-id="${esc(it.id)}" title="${esc(t('delete'))}" aria-label="${esc(t('delete'))} ${esc(it.name)}">${IC.trash}</button>` : '';
  if (it.kind === 'text') {
    return `<li class="f note" data-id="${esc(it.id)}"><span class="fi text">${IC.text}</span><div class="nt"><b>${esc(it.name)}</b><p>${esc(it.text)}</p></div>
      <div class="fa"><button class="btn sm wa" data-act="send-note" data-id="${esc(it.id)}">${IC.wa}<span>${esc(t('send_text'))}</span></button>${del}</div></li>`;
  }
  const size = fmtSize(it.size);
  return `<li class="f" data-id="${esc(it.id)}">
    <span class="fi ${it.category}">${CAT_IC[it.category] || IC.other}</span>
    <button class="fn" data-act="open-file" data-id="${esc(it.id)}">${esc(it.name)}${size ? `<small><bdi dir="ltr">${size}</bdi></small>` : ''}</button>
    <div class="fa"><button class="btn sm" data-act="open-file" data-id="${esc(it.id)}" title="${esc(t('open'))}">${IC.open}<span>${esc(t('open'))}</span></button>
    <button class="btn sm wa" data-act="send-file" data-id="${esc(it.id)}" title="${esc(t('send'))}">${IC.wa}<span>${esc(t('send'))}</span></button>${del}</div></li>`;
}
function adminTools(k) {
  if (S.me.role !== 'admin') return '';
  const lt = k === 'videos' ? t('add_link_video') : k === 'location' ? t('add_link_loc') : t('add_link');
  const note = k.startsWith('info_') ? `<button class="btn sm" data-act="add-note" data-sec="${k}">${IC.text}<span>${esc(t('add_text'))}</span></button>` : '';
  return `<button class="btn sm" data-act="upload" data-sec="${k}">${IC.upload}<span>${esc(t('upload'))}</span></button>
    <button class="btn sm" data-act="add-link" data-sec="${k}">${IC.plus}<span>${esc(lt)}</span></button>${note}`;
}
function block(k) {
  const items = S.project.sections[k];
  const name = k.startsWith('info_') ? L()[k] : L()[k];
  return `<div class="blk" data-sec="${k}"><div class="bh"><h3>${esc(name)}${count(items)}</h3>
    <div class="bact">${adminTools(k)}<button class="btn sm wa" data-act="send-section" data-sec="${k}">${IC.wa}<span>${esc(t('send_section'))}</span></button></div></div>
    ${items.length ? `<ul class="files">${items.map(fileRow).join('')}</ul>` : `<p class="none">${esc(S.me.role === 'admin' ? t('none_admin') : t('none_sales'))}</p>`}</div>`;
}
const INFO_KEYS = ['info_ar', 'info_ku', 'info_en'];
const secCount = (p, k) => (k === 'info' ? INFO_KEYS : [k]).reduce((n, x) => n + p.sections[x].length, 0);
function drawProject() {
  const p = S.project; const admin = S.me.role === 'admin'; const sec = S.sec; const pid = encodeURIComponent(p.id);
  if (sec) {
    const body = sec === 'info'
      ? `<section class="grp"><div class="sub">${INFO_KEYS.map(block).join('')}</div></section>` : block(sec);
    setView(`<a class="crumb" href="#/p/${pid}" data-act="back">${IC.back}<span>${esc(p.name)}</span></a>
    <div class="page-h"><h1>${esc(L()[sec])}<small>${secCount(p, sec)}</small></h1>
      <button class="btn wa" data-act="send-section" data-sec="${sec}">${IC.wa}<span>${esc(t('send_section'))}</span></button></div>
    <div class="stack">${body}</div>`);
    if (admin) wireDrop();
    return;
  }
  setView(`<a class="crumb" href="#/" data-act="back">${IC.back}<span>${esc(TX().projectsTitle)}</span></a>
  <div class="phead">${cover(p, 'pc')}<h1>${esc(p.name)}</h1>
    <div class="acts"><button class="btn wa" data-act="send-project">${IC.wa}<span>${esc(t('send_project_all'))}</span></button></div></div>
  ${admin ? `<div class="adminbar"><button class="btn sm" data-act="rename-project">${IC.edit}<span>${esc(t('rename'))}</span></button>
    <button class="btn sm" data-act="upload" data-sec="cover">${IC.image}<span>${esc(t('cover'))}</span></button>
    <button class="btn sm danger" data-act="del-project">${IC.trash}<span>${esc(t('delete_project'))}</span></button></div>` : ''}
  <div class="sgrid">${SECS.map((k) => `<a class="stile" href="#/p/${pid}/${k}" data-sec="${k}"><span class="sn">${esc(L()[k])}</span><span class="cnt">${secCount(p, k)}</span></a>`).join('')}</div>`);
}

/* ===== رفع الملفات (للمسؤول) ===== */
function pickFiles(sec) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = sec !== 'cover';
  if (sec === 'cover') inp.accept = 'image/*'; else if (sec === 'videos') inp.accept = 'video/*,application/pdf,image/*';
  inp.onchange = () => inp.files.length && uploadFiles(sec, [...inp.files]);
  inp.click();
}
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error(t('read_fail')));
    r.readAsDataURL(file);
  });
}
async function putFile(projectId, sec, file) {
  if (file.size > CFG.MAX_UPLOAD_MB * 1048576) throw new Error(t('too_big', { mb: CFG.MAX_UPLOAD_MB }));
  return rpc('upload', { projectId, section: sec, name: file.name, mime: file.type || 'application/octet-stream', data: await toBase64(file) });
}
async function uploadFiles(sec, files) {
  const pt = progressToast(); let okN = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try { pt.set(t('uploading', { i: i + 1, n: files.length, name: f.name }), ((i + 0.5) / files.length) * 100); await putFile(S.project.id, sec, f); okN++; }
    catch (e) { toast(`${f.name}: ${e.message}`, 'err'); }
  }
  pt.done();
  if (okN) { toast(okN === 1 ? t('uploaded_1') : t('uploaded_n', { n: okN }), 'ok'); S.projects = null; await viewProject(S.project.id); }
}
function wireDrop() {
  $$('.blk[data-sec]').forEach((el) => {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drag'); if (e.dataTransfer.files.length) uploadFiles(el.dataset.sec, [...e.dataTransfer.files]); });
  });
}

/* ===== الإجراءات ===== */
const findItem = (id) => Object.values(S.project.sections).flat().find((i) => i.id === id);
const actions = {
  back(b) { if (S.idx > 0) history.back(); else navigate((b && b.getAttribute('href')) || '#/'); },
  lang() {
    const m = modal({ title: t('language'), body: `<div class="langlist">${Object.keys(I.langs).map((c) => `<button class="langopt${c === S.lang ? ' on' : ''}" data-lang="${c}" lang="${c}" dir="${I.langs[c].dir}">${esc(I.langs[c].name)}</button>`).join('')}</div>` });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (!b) return; m.close(); setLang(b.dataset.lang); });
  },
  mode(b) { LS.set('sendMode', shareMode() ? 'link' : 'file'); b.innerHTML = modeBtn(); toast(shareMode() ? t('mode_to_file') : t('mode_to_link'), 'ok'); },
  async refresh() { await api('POST', '/api/refresh'); S.projects = null; await route(); toast(t('refreshed'), 'ok'); },
  me() {
    modal({ title: S.me.name, body: `<p class="note">${esc(t('me_account', { u: S.me.username }))}</p>
      <label class="fld"><span>${esc(t('pw_current'))}</span><input id="pw0" type="password" autocomplete="current-password"></label>
      <label class="fld"><span>${esc(t('pw_new'))}</span><input id="pw1" type="password" autocomplete="new-password"></label>`,
      actions: [{ label: t('logout'), cls: 'danger', async run() { await api('POST', '/api/logout'); clearFileCache(); S.me = null; S.cfg = null; S.projects = null; renderLogin(); } },
        { label: t('change_pw'), cls: 'pri', async run() { await api('POST', '/api/me/password', { current: $('#pw0').value, password: $('#pw1').value }); toast(t('pw_changed'), 'ok'); } }] });
  },
  'open-file'(b) {
    const it = findItem(b.dataset.id); if (!it) return;
    if (it.kind === 'link') return window.open(it.openUrl, '_blank', 'noopener');
    const cap = `<div class="cap">${esc(it.name)} — <a href="${esc(it.openUrl)}" target="_blank" rel="noopener" style="color:#9cc6ea">${esc(t('open_in_drive'))}</a></div>`;
    const x = `<button class="x" aria-label="${esc(t('close'))}" data-close>✕</button>`;
    if (it.category === 'image') return modal({ wide: true, body: `<div class="viewer">${x}<img src="${esc(it.thumbUrl)}" alt="${esc(it.name)}">${cap}</div>` });
    if (it.category === 'video' || it.category === 'pdf') return modal({ wide: true, body: `<div class="viewer">${x}<iframe class="${it.category === 'video' ? 'v' : ''}" src="${esc(it.previewUrl)}" allow="autoplay; fullscreen" allowfullscreen title="${esc(it.name)}"></iframe>${cap}</div>` });
    window.open(it.openUrl, '_blank', 'noopener');
  },
  'send-file'(b) { const it = findItem(b.dataset.id); if (it) return sendItems([it], S.project.name, () => sendWA(msgFile(S.project, it))); },
  'send-note'(b) { const it = findItem(b.dataset.id); if (it) sendWA(it.text); },
  'send-section'(b) {
    const k = b.dataset.sec; const p = S.project;
    const keys = k === 'info' ? ['info_ar', 'info_ku', 'info_en'] : [k];
    return sendItems(keys.flatMap((x) => p.sections[x]), p.name, () => { const txt = msgSection(p, keys, k === 'info' ? L().info : secLabel(k), p.sectionShareUrls[k]); if (txt) sendWA(txt); });
  },
  'send-project'() { const p = S.project; return sendItems(Object.values(p.sections).flat(), p.name, () => { const txt = msgProject(p); if (txt) sendWA(txt); }); },
  async 'send-project-id'(b) {
    const { project } = await api('GET', '/api/projects/' + encodeURIComponent(b.dataset.id));
    return sendItems(Object.values(project.sections).flat(), project.name, () => { const txt = msgProject(project); if (txt) sendWA(txt); }, false);
  },
  upload(b) { pickFiles(b.dataset.sec); },
  'add-link'(b) {
    const sec = b.dataset.sec;
    modal({ title: t('link_title'), body: `<label class="fld"><span>${esc(t('link_label'))}</span><input id="lt" placeholder="${esc(sec === 'videos' ? t('link_ph_video') : sec === 'location' ? t('link_ph_loc') : t('link_ph'))}"></label>
      <label class="fld"><span>${esc(t('link_url'))}</span><input id="lu" type="url" inputmode="url" dir="ltr" class="ltr-in" placeholder="https://..."><span class="hint">${esc(t('link_hint'))}</span></label>`,
      actions: [{ label: t('cancel') }, { label: t('add'), cls: 'pri', async run() {
        await api('POST', `/api/projects/${encodeURIComponent(S.project.id)}/links`, { section: sec, title: $('#lt').value, url: $('#lu').value });
        toast(t('link_added'), 'ok'); await viewProject(S.project.id);
      } }] });
  },
  'add-note'(b) {
    const sec = b.dataset.sec;
    modal({ title: t('note_title'), body: `<label class="fld"><span>${esc(t('note_label'))}</span><input id="nt" maxlength="60"></label>
      <label class="fld"><span>${esc(t('note_text'))}</span><textarea id="nx" rows="6" maxlength="4000"></textarea><span class="hint">${esc(t('note_hint'))}</span></label>`,
      actions: [{ label: t('cancel') }, { label: t('add'), cls: 'pri', async run() {
        await api('POST', `/api/projects/${encodeURIComponent(S.project.id)}/notes`, { section: sec, title: $('#nt').value, text: $('#nx').value });
        toast(t('note_added'), 'ok'); await viewProject(S.project.id);
      } }] });
  },
  async 'del-file'(b) {
    const it = findItem(b.dataset.id); if (!it || !confirm(t('del_file_q', { name: it.name }))) return;
    await api('DELETE', '/api/files/' + encodeURIComponent(it.id)); toast(t('deleted'), 'ok'); S.projects = null; await viewProject(S.project.id);
  },
  'new-project'() {
    modal({ title: t('np_title'), body: `<label class="fld"><span>${esc(t('np_name'))}</span><input id="pn" maxlength="80"></label><p class="note">${esc(t('np_note'))}</p>`,
      actions: [{ label: t('cancel') }, { label: t('create'), cls: 'pri', async run() {
        const r = await api('POST', '/api/projects', { name: $('#pn').value }); S.projects = null; await navigate('#/p/' + encodeURIComponent(r.project.id));
      } }] });
  },
  'rename-project'() {
    modal({ title: t('rn_title'), body: `<label class="fld"><span>${esc(t('rn_name'))}</span><input id="pn" maxlength="80" value="${esc(S.project.name)}"></label>`,
      actions: [{ label: t('cancel') }, { label: t('save'), cls: 'pri', async run() {
        const r = await api('PATCH', '/api/projects/' + encodeURIComponent(S.project.id), { name: $('#pn').value }); S.projects = null;
        history.replaceState({ idx: S.idx }, '', '#/p/' + encodeURIComponent(r.project.id)); await route();
      } }] });
  },
  async 'del-project'() {
    if (!confirm(t('del_project_q', { name: S.project.name }))) return;
    await api('DELETE', '/api/projects/' + encodeURIComponent(S.project.id)); S.projects = null; toast(t('project_deleted'), 'ok');
    if (S.idx > 0) history.back(); else navigate('#/');
  },
};

/* ===== لوحة المسؤول ===== */
const LABEL_KEYS = ['info', 'info_ar', 'info_ku', 'info_en', 'videos', 'maps', 'location', 'prices'];
async function viewAdmin(tab = 'users') {
  setView('<div class="spin"></div>');
  const tabs = `<div class="tabs" role="tablist"><a class="tab" role="tab" aria-selected="${tab === 'users'}" href="#/admin/users">${esc(t('tab_users'))}</a><a class="tab" role="tab" aria-selected="${tab === 'settings'}" href="#/admin/settings">${esc(t('tab_settings'))}</a></div>`;
  const head = `<a class="crumb" href="#/" data-act="back">${IC.back}<span>${esc(TX().projectsTitle)}</span></a><div class="page-h"><h1>${esc(t('admin_panel'))}</h1></div>${tabs}`;
  if (tab === 'settings') {
    const { settings: s } = await api('GET', '/api/admin/settings');
    const sl = S.settingsLang || S.lang; const x = s.texts[sl];
    const lab = (k) => `<label class="fld"><span>${esc(t('s_' + k))}</span><input data-lab="${k}" maxlength="40" value="${esc(x.labels[k])}"></label>`;
    setView(`${head}
      <div class="langtabs">${Object.keys(I.langs).map((c) => `<button class="tab" aria-selected="${c === sl}" data-sl="${c}" lang="${c}">${esc(I.langs[c].name)}</button>`).join('')}</div>
      <p class="note">${esc(t('s_lang_note', { lang: I.langs[sl].name }))}</p>
      <div class="panel"><h2>${esc(t('s_site'))}</h2><div class="cols">
        <label class="fld"><span>${esc(t('s_site_name'))}</span><input id="s-name" maxlength="60" value="${esc(x.siteName)}"></label>
        <label class="fld"><span>${esc(t('s_tagline'))}</span><input id="s-tag" maxlength="80" value="${esc(x.tagline)}"></label>
        <label class="fld"><span>${esc(t('s_projects_title'))}</span><input id="s-pt" maxlength="40" value="${esc(x.projectsTitle)}"></label></div></div>
      <div class="panel"><h2>${esc(t('s_labels'))}</h2><div class="cols">${LABEL_KEYS.map(lab).join('')}</div></div>
      <div class="panel"><h2>${esc(t('s_wa'))}</h2>
        <label class="fld"><span>${esc(t('s_cc'))}</span><input id="s-cc" inputmode="numeric" dir="ltr" class="ltr-in" maxlength="4" value="${esc(s.countryCode)}"><span class="hint">${esc(t('s_cc_hint'))}</span></label>
        <label class="fld"><span>${esc(t('s_intro'))}</span><textarea id="s-in" maxlength="300">${esc(x.whatsappIntro)}</textarea><span class="hint">${esc(t('s_intro_hint'))}</span></label></div>
      <button class="btn pri" id="save-set">${esc(t('s_save'))}</button>`);
    $$('[data-sl]').forEach((b) => b.onclick = () => { S.settingsLang = b.dataset.sl; viewAdmin('settings'); });
    $('#save-set').onclick = async () => {
      const labels = {}; $$('[data-lab]').forEach((i) => { labels[i.dataset.lab] = i.value; });
      try {
        await api('PUT', '/api/admin/settings', { lang: sl, countryCode: $('#s-cc').value, texts: { siteName: $('#s-name').value, tagline: $('#s-tag').value, projectsTitle: $('#s-pt').value, whatsappIntro: $('#s-in').value, labels } });
        S.cfg = await api('GET', '/api/config'); toast(t('saved'), 'ok'); shell('<div class="spin"></div>'); await viewAdmin('settings');
      } catch (e) { toast(e.message, 'err'); }
    };
    return;
  }
  const { users } = await api('GET', '/api/admin/users');
  const rows = users.map((u) => `<div class="urow" data-uid="${esc(u.id)}"><div class="who"><b>${esc(u.name)}<span class="badge ${u.role === 'admin' ? 'adm' : ''}">${esc(u.role === 'admin' ? t('badge_admin') : t('badge_sales'))}</span>${u.active ? '' : `<span class="badge off">${esc(t('badge_off'))}</span>`}</b>
    <small dir="ltr">${esc(u.username)}</small>${u.lastLogin ? `<small> · ${esc(t('last_login'))} ${new Date(u.lastLogin).toLocaleDateString('en-GB')}</small>` : ''}</div>
    <div class="ua"><button class="btn sm" data-uact="toggle">${esc(u.active ? t('suspend') : t('activate'))}</button><button class="btn sm" data-uact="pw">${esc(t('new_pw'))}</button>
    <button class="btn sm" data-uact="role">${esc(u.role === 'admin' ? t('make_sales') : t('make_admin'))}</button><button class="iconb" data-uact="del" aria-label="${esc(t('delete'))} ${esc(u.name)}">${IC.trash}</button></div></div>`).join('');
  setView(`${head}
    <div class="panel"><h2>${esc(t('add_user'))}</h2><form id="nu"><div class="cols">
      <label class="fld"><span>${esc(t('u_name'))}</span><input name="name" required maxlength="60"></label>
      <label class="fld"><span>${esc(t('u_username'))}</span><input name="username" required dir="ltr" class="ltr-in" autocapitalize="none" pattern="[A-Za-z0-9._\\-]{3,32}"></label>
      <label class="fld"><span>${esc(t('u_pass'))}</span><input name="password" required minlength="6" dir="ltr" class="ltr-in"></label>
      <label class="fld"><span>${esc(t('u_role'))}</span><select name="role"><option value="sales">${esc(t('role_sales'))}</option><option value="admin">${esc(t('role_admin'))}</option></select></label></div>
      <button class="btn pri" type="submit">${IC.plus}<span>${esc(t('add'))}</span></button></form></div>
    <div class="panel"><h2>${esc(t('users_n', { n: users.length }))}</h2>${rows}</div>`);
  $('#nu').onsubmit = async (ev) => {
    ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target));
    try { await api('POST', '/api/admin/users', f); toast(t('user_added'), 'ok'); await viewAdmin('users'); } catch (e) { toast(e.message, 'err'); }
  };
  $$('[data-uact]').forEach((b) => b.onclick = async () => {
    const id = b.closest('[data-uid]').dataset.uid; const u = users.find((x) => x.id === id);
    try {
      if (b.dataset.uact === 'toggle') await api('PATCH', '/api/admin/users/' + id, { active: !u.active });
      else if (b.dataset.uact === 'role') await api('PATCH', '/api/admin/users/' + id, { role: u.role === 'admin' ? 'sales' : 'admin' });
      else if (b.dataset.uact === 'del') { if (!confirm(t('del_user_q', { name: u.name }))) return; await api('DELETE', '/api/admin/users/' + id); }
      else if (b.dataset.uact === 'pw') {
        return modal({ title: t('pw_for', { name: u.name }), body: `<label class="fld"><span>${esc(t('new_pw'))}</span><input id="np" dir="ltr" class="ltr-in" minlength="6"></label>`,
          actions: [{ label: t('cancel') }, { label: t('save'), cls: 'pri', async run() { await api('PATCH', '/api/admin/users/' + id, { password: $('#np').value }); toast(t('pw_changed'), 'ok'); } }] });
      }
      await viewAdmin('users');
    } catch (e) { toast(e.message, 'err'); }
  });
}

/* ===== التثبيت كتطبيق (PWA) ===== */
let deferredPrompt = null;
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installHidden() { const until = +LS.get('installHideUntil') || 0; return Date.now() < until; }
function updateInstallBtn() {
  const el = $('#install'); if (!el) return;
  const show = !isStandalone() && !installHidden() && (deferredPrompt || isIOS());
  el.hidden = !show;
  if (show) { $('.t', el).textContent = t('install_btn'); $('.x', el).setAttribute('aria-label', t('install_hide')); }
}
function setupInstall() {
  const el = document.createElement('div'); el.id = 'install'; el.hidden = true;
  el.innerHTML = `<button class="go" type="button">${IC.download}<span class="t"></span></button><button class="x" type="button">✕</button>`;
  document.body.appendChild(el);
  $('.go', el).onclick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt(); try { await deferredPrompt.userChoice; } catch { /* */ }
      deferredPrompt = null; updateInstallBtn();
    } else modal({ title: t('install_title'), body: `<p class="note">${esc(isIOS() ? t('install_ios') : t('install_other'))}</p>`, actions: [{ label: t('close'), cls: 'pri' }] });
  };
  $('.x', el).onclick = () => { LS.set('installHideUntil', String(Date.now() + 7 * 864e5)); updateInstallBtn(); };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; updateInstallBtn(); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; updateInstallBtn(); });
  updateInstallBtn();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ===== التوجيه والتشغيل ===== */
async function route() {
  if (!S.me) return;
  const h = location.hash || '#/'; let m;
  try {
    if ((m = /^#\/p\/([^/]+)(?:\/([a-z]+))?$/.exec(h))) await viewProject(decodeURIComponent(m[1]), m[2] || null);
    else if ((m = /^#\/admin(?:\/(users|settings))?$/.exec(h)) && S.me.role === 'admin') await viewAdmin(m[1] || 'users');
    else await viewProjects();
  } catch (e) {
    if (!S.me) return;
    setView(`<div class="empty-state"><b>${esc(t('open_failed'))}</b>${esc(e.message)}<br><br><a class="btn" href="#/">${esc(t('back_home'))}</a></div>`);
  }
  window.scrollTo(0, 0);
}
async function start() {
  S.cfg = await api('GET', '/api/config'); S.projects = null;
  if (!S.cfg.texts) { S.cfg = null; throw new Error(t('err_old_backend')); }
  shell('<div class="spin"></div>'); await route();
}
(async function boot() {
  S.lang = detectLang(); applyLang();
  history.replaceState({ idx: 0 }, '');
  setupInstall();
  try { S.pub = await api('GET', '/api/public'); } catch (e) { S.bootError = e.message; }
  applyLang();
  if (tokenStore.get()) {
    try { S.me = (await api('GET', '/api/me')).user; await start(); return; }
    catch (e) { if (S.me) { S.bootError = e.message; S.me = null; } }
  }
  if (!S.me) { renderLogin(); if (S.bootError) $('#le').innerHTML = `<div class="err">${esc(S.bootError)}</div>`; }
})();
