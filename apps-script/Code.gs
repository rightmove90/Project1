/**
 * بوابة المبيعات — الخلفية على Google Apps Script
 * ------------------------------------------------
 * تعمل داخل حسابك على Google (مجاناً وبشكل دائم) وتقرأ/تكتب في مجلد المشاريع في Drive.
 * الواجهة (GitHub Pages) تتصل بها عبر طلب POST واحد: { action, token, ...بيانات }
 *
 * الإعداد (مرة واحدة): Project Settings ← Script properties، أضف:
 *    ROOT_FOLDER_ID   معرّف (أو رابط) مجلد المشاريع في Drive
 *    ADMIN_PASSWORD   كلمة مرور المسؤول الأول  (تُحذف تلقائياً بعد الإنشاء)
 *    ADMIN_USERNAME   (اختياري) الافتراضي admin
 * ثم شغّل الدالة setup() مرة واحدة ووافق على الصلاحيات، ثم Deploy ← New deployment ← Web app
 * (Execute as: Me، Who has access: Anyone).
 */

var SECTION_KEYS = ['info_ar', 'info_ku', 'info_en', 'videos', 'maps', 'location', 'prices'];
var INFO_KEYS = ['info_ar', 'info_ku', 'info_en'];
var LANGS = ['ar', 'ku', 'en'];
var DEFAULT_TEXTS = {
  ar: {
    siteName: 'مشاريع الشركة', tagline: 'مكتبة فريق المبيعات', projectsTitle: 'المشاريع',
    whatsappIntro: 'مرحباً، هذه تفاصيل مشروع {project}:',
    labels: { info: 'معلومات المشروع', info_ar: 'العربية', info_ku: 'کوردی', info_en: 'English', videos: 'الفيديوهات', maps: 'الخرائط', location: 'موقع المشروع', prices: 'الأسعار' }
  },
  ku: {
    siteName: 'پڕۆژەکانی کۆمپانیا', tagline: 'کتێبخانەی تیمی فرۆشتن', projectsTitle: 'پڕۆژەکان',
    whatsappIntro: 'سڵاو، وردەکارییەکانی پڕۆژەی {project}:',
    labels: { info: 'زانیاری پڕۆژە', info_ar: 'العربية', info_ku: 'کوردی', info_en: 'English', videos: 'ڤیدیۆکان', maps: 'نەخشەکان', location: 'شوێنی پڕۆژە', prices: 'نرخەکان' }
  },
  en: {
    siteName: 'Company Projects', tagline: 'Sales team library', projectsTitle: 'Projects',
    whatsappIntro: 'Hello, here are the details of {project}:',
    labels: { info: 'Project information', info_ar: 'العربية', info_ku: 'کوردی', info_en: 'English', videos: 'Videos', maps: 'Maps', location: 'Project location', prices: 'Prices' }
  }
};
var DEFAULT_COUNTRY_CODE = '964';
var STRUCTURE = [
  { key: 'info', children: ['info_ar', 'info_ku', 'info_en'] },
  { key: 'videos' }, { key: 'maps' }, { key: 'location' }, { key: 'prices' }
];

var SESSION_DAYS = 365;
var HASH_ROUNDS = 1000;
var MAX_UPLOAD_BYTES = 15 * 1024 * 1024;   // أقصى حجم للرفع من الموقع (بعد فك الترميز)
var MAX_DIRECT_BYTES = 10 * 1024 * 1024;   // أقصى حجم لملف يُرسل كمرفق مباشر
var CACHE_SECONDS = 120;

// ============================================================ نقطة الدخول
function doGet() {
  return ContentService.createTextOutput('Sales portal API — OK');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = { ok: true, data: dispatch_(req) };
  } catch (err) {
    out = { ok: false, status: err.status || 500, error: err.status ? err.message : 'حدث خطأ في الخادم' };
    if (!err.status) {
      console.error(err && err.stack ? err.stack : String(err));
      if (props_().getProperty('DEBUG') === '1') out.detail = String(err);
    }
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function httpErr_(status, message) { var e = new Error(message); e.status = status; return e; }

function dispatch_(req) {
  var h = HANDLERS[req.action];
  if (!h) throw httpErr_(404, 'إجراء غير معروف');
  var ctx = { user: null };
  if (h.access !== 'public') {
    ctx.user = userFromToken_(req.token);
    if (!ctx.user) throw httpErr_(401, 'يرجى تسجيل الدخول');
    if (h.access === 'admin' && ctx.user.role !== 'admin') throw httpErr_(403, 'هذه العملية للمسؤول فقط');
  }
  return h.run(ctx, req);
}

// ============================================================ أدوات عامة
function props_() { return PropertiesService.getScriptProperties(); }
function cache_() { return CacheService.getScriptCache(); }
function str_(v, max) { return String(v === undefined || v === null ? '' : v).trim().slice(0, max); }

function parseId_(raw) {
  raw = String(raw || '').trim().replace(/^["']|["']$/g, '');
  var m = /folders\/([A-Za-z0-9_-]+)/.exec(raw) || /[?&]id=([A-Za-z0-9_-]+)/.exec(raw);
  return m ? m[1] : raw.split(/[?#\s]/)[0];
}
function rootId_() {
  var id = parseId_(props_().getProperty('ROOT_FOLDER_ID'));
  if (!id) throw httpErr_(500, 'لم يُضبط ROOT_FOLDER_ID في خصائص السكربت');
  return id;
}
function root_() { return DriveApp.getFolderById(rootId_()); }

function secret_() {
  var s = props_().getProperty('SECRET');
  if (!s) throw httpErr_(500, 'شغّل الدالة setup() أولاً');
  return s;
}

function hex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) { var b = (bytes[i] + 256) % 256; s += (b < 16 ? '0' : '') + b.toString(16); }
  return s;
}
function fromHexUtf8_(h) {
  var bytes = [];
  for (var i = 0; i < h.length; i += 2) { var b = parseInt(h.substr(i, 2), 16); bytes.push(b > 127 ? b - 256 : b); }
  return Utilities.newBlob(bytes).getDataAsString();
}
function sig_(msg) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(msg, secret_())).replace(/=+$/, '');
}
function safeEq_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function sign_(obj) {
  var body = hex_(Utilities.newBlob(JSON.stringify(obj)).getBytes());
  return body + '.' + sig_(body);
}
function verify_(token) {
  var p = String(token || '').split('.');
  if (p.length !== 2 || !p[0] || !safeEq_(p[1], sig_(p[0]))) return null;
  try { return JSON.parse(fromHexUtf8_(p[0])); } catch (e) { return null; }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function cleanName_(n, max) {
  return String(n || '').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, max || 120).trim();
}
function extOf_(n) { var m = /\.([A-Za-z0-9]+)$/.exec(String(n)); return m ? m[1].toLowerCase() : ''; }
function categoryOf_(mime) {
  mime = mime || '';
  if (mime.indexOf('image/') === 0) return 'image';
  if (mime.indexOf('video/') === 0) return 'video';
  if (mime.indexOf('audio/') === 0) return 'audio';
  if (mime === 'application/pdf' || mime === 'application/vnd.google-apps.document') return 'pdf';
  if (/spreadsheet|excel|csv/.test(mime)) return 'sheet';
  if (/word|presentation|powerpoint/.test(mime)) return 'doc';
  return 'other';
}
function collator_(a, b) { return String(a).localeCompare(String(b), ['ar', 'en'], { numeric: true, sensitivity: 'base' }); }

// ============================================================ تخزين JSON (مستخدمون/إعدادات) في المجلد الرئيسي
function metaFile_(name, create) {
  var key = 'meta_' + name; var id = props_().getProperty(key);
  if (id) { try { var f0 = DriveApp.getFileById(id); if (!f0.isTrashed()) return f0; } catch (e) { /* أعد البحث */ } }
  var it = root_().getFilesByName('_portal_' + name + '.json'); var f = null;
  while (it.hasNext()) { var c = it.next(); if (!c.isTrashed()) { f = c; break; } }
  if (!f && create) f = root_().createFile('_portal_' + name + '.json', '{}', MimeType.PLAIN_TEXT);
  if (f) props_().setProperty(key, f.getId());
  return f;
}
function readJson_(name, def) {
  var ck = 'j_' + name; var hit = cache_().get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* تابع */ } }
  var f = metaFile_(name, false);
  if (!f) return def;
  var v;
  try { v = JSON.parse(f.getBlob().getDataAsString()); } catch (e) { return def; }
  try { cache_().put(ck, JSON.stringify(v), 21600); } catch (e) { /* أكبر من حد الذاكرة المؤقتة */ }
  return v;
}
function writeJson_(name, value) {
  var f = metaFile_(name, true); var text = JSON.stringify(value, null, 2);
  f.setContent(text);
  try { cache_().put('j_' + name, JSON.stringify(value), 21600); } catch (e) { cache_().remove('j_' + name); }
}

// ============================================================ المستخدمون والجلسات
function hashPw_(pw, saltHex) {
  var h = saltHex + ':' + pw; var digest;
  for (var i = 0; i < HASH_ROUNDS; i++) {
    digest = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h));
    h = digest + ':' + saltHex;
  }
  return digest;
}
function makePw_(pw) {
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  return salt + ':' + hashPw_(pw, salt);
}
function checkPw_(pw, stored) {
  var p = String(stored || '').split(':');
  if (p.length !== 2) p = ['00', '00'];
  return safeEq_(hashPw_(pw, p[0]), p[1]);
}
function userView_(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt, lastLogin: u.lastLogin || null };
}
function users_() { return readJson_('users', []); }
function findUser_(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
function findByName_(list, n) { n = String(n || '').trim().toLowerCase(); for (var i = 0; i < list.length; i++) if (list[i].username === n) return list[i]; return null; }
function activeAdmins_(list) { return list.filter(function (u) { return u.role === 'admin' && u.active; }); }
function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }

function makeSession_(u) {
  return sign_({ u: u.id, v: u.tokenVersion, e: Date.now() + SESSION_DAYS * 864e5 });
}
function userFromToken_(token) {
  var p = verify_(token);
  if (!p || !p.e || p.e < Date.now()) return null;
  var u = findUser_(users_(), p.u);
  return u && u.active && u.tokenVersion === p.v ? u : null;
}

function attempts_(key) {
  var raw = cache_().get('att_' + key); var now = Date.now(); var a = [];
  try { a = JSON.parse(raw || '[]'); } catch (e) { a = []; }
  return a.filter(function (t) { return now - t < 900000; });
}

function createUser_(list, b) {
  var username = String(b.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw httpErr_(400, 'اسم المستخدم: 3-32 حرفاً إنجليزياً أو أرقاماً (يسمح بـ . _ -)');
  if (String(b.password || '').length < 6) throw httpErr_(400, 'كلمة المرور 6 أحرف على الأقل');
  if (findByName_(list, username)) throw httpErr_(409, 'اسم المستخدم مستخدم مسبقاً');
  var u = {
    id: newId_(), username: username, name: str_(b.name, 60) || username, role: b.role === 'admin' ? 'admin' : 'sales',
    active: true, passwordHash: makePw_(String(b.password)), tokenVersion: 1, createdAt: new Date().toISOString()
  };
  list.push(u);
  return u;
}

// ============================================================ الإعدادات
function settings_() {
  var raw = readJson_('settings', {});
  var texts = {};
  LANGS.forEach(function (l) {
    var d = DEFAULT_TEXTS[l];
    var o = (raw.texts && raw.texts[l]) || {};
    // ترحيل الإعدادات القديمة (حقول مسطّحة بالعربية فقط)
    if (l === 'ar' && !raw.texts) o = { siteName: raw.siteName, tagline: raw.tagline, projectsTitle: raw.projectsTitle, whatsappIntro: raw.whatsappIntro, labels: raw.labels };
    var labels = {};
    for (var k in d.labels) labels[k] = (o.labels && o.labels[k]) || d.labels[k];
    texts[l] = {
      siteName: o.siteName || d.siteName,
      tagline: o.tagline !== undefined && o.tagline !== null ? o.tagline : d.tagline,
      projectsTitle: o.projectsTitle || d.projectsTitle,
      whatsappIntro: o.whatsappIntro !== undefined && o.whatsappIntro !== null && o.whatsappIntro !== '' ? o.whatsappIntro : d.whatsappIntro,
      labels: labels
    };
  });
  return { countryCode: raw.countryCode || DEFAULT_COUNTRY_CODE, texts: texts };
}

// ============================================================ المشاريع (Drive)
function cacheVer_() { return props_().getProperty('CACHE_VER') || '0'; }
function bumpCache_() { props_().setProperty('CACHE_VER', Utilities.getUuid().replace(/-/g, '').slice(0, 12)); } // قيمة فريدة في كل مرة
function cget_(k) { var v = cache_().get('v' + cacheVer_() + ':' + k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
function cput_(k, v, secs) { try { cache_().put('v' + cacheVer_() + ':' + k, JSON.stringify(v), secs || CACHE_SECONDS); } catch (e) { /* كبير جداً */ } }

function underRoot_(node) {
  var ck = 'ok_' + node.getId();
  if (cache_().get(ck)) return true;
  var root = rootId_(); var cur = node;
  for (var i = 0; i < 6; i++) {
    var it = cur.getParents();
    if (!it.hasNext()) return false;
    var p = it.next();
    if (p.getId() === root) { cache_().put(ck, '1', 600); return true; }
    cur = p;
  }
  return false;
}
function folderNode_(id) {
  var f;
  try { f = DriveApp.getFolderById(String(id || '')); } catch (e) { throw httpErr_(404, 'المشروع غير موجود'); }
  if (f.isTrashed() || f.getId() === rootId_()) throw httpErr_(404, 'المشروع غير موجود');
  var ok = false; var it = f.getParents();
  while (it.hasNext()) if (it.next().getId() === rootId_()) { ok = true; break; }
  if (!ok) throw httpErr_(404, 'المشروع غير موجود');
  return f;
}
function fileNode_(id) {
  var f;
  try { f = DriveApp.getFileById(String(id || '')); } catch (e) { throw httpErr_(404, 'الملف غير موجود'); }
  if (f.isTrashed() || !underRoot_(f)) throw httpErr_(404, 'الملف غير موجود');
  return f;
}

function coverUrl_(id) { return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w800'; }

function listProjects_() {
  var hit = cget_('projects'); if (hit) return hit;
  var out = []; var it = root_().getFolders();
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) out.push({ id: f.getId(), name: f.getName(), coverId: null }); }
  for (var i = 0; i < out.length; i += 15) {
    var chunk = out.slice(i, i + 15);
    var q = "mimeType contains 'image/' and title contains 'cover' and trashed=false and (" +
      chunk.map(function (p) { return "'" + p.id + "' in parents"; }).join(' or ') + ')';
    var fi = DriveApp.searchFiles(q);
    while (fi.hasNext()) {
      var file = fi.next();
      if (!/^cover\./i.test(file.getName())) continue;
      var pi = file.getParents();
      if (!pi.hasNext()) continue;
      var pid = pi.next().getId();
      for (var j = 0; j < chunk.length; j++) if (chunk[j].id === pid) chunk[j].coverId = file.getId();
    }
  }
  out.sort(function (a, b) { return collator_(a.name, b.name); });
  cput_('projects', out);
  return out;
}

function readProject_(id) {
  var hit = cget_('p:' + id); if (hit) return hit;
  var folder = folderNode_(id);
  var sections = {}; SECTION_KEYS.forEach(function (k) { sections[k] = []; });
  var si = folder.getFolders();
  while (si.hasNext()) {
    var sf = si.next(); var key = sf.getName();
    if (SECTION_KEYS.indexOf(key) < 0 || sf.isTrashed()) continue;
    var fi = sf.getFiles();
    while (fi.hasNext()) {
      var f = fi.next(); if (f.isTrashed()) continue;
      var name = f.getName();
      if (/\.note$/i.test(name)) {
        sections[key].push({ id: f.getId(), name: name.replace(/\.note$/i, ''), kind: 'text', text: String(f.getBlob().getDataAsString() || '').trim() });
      } else if (/\.link$/i.test(name)) {
        var url = String(f.getDescription() || '').trim();
        if (url) sections[key].push({ id: f.getId(), name: name.replace(/\.link$/i, ''), kind: 'link', url: url });
      } else {
        sections[key].push({ id: f.getId(), name: name, kind: 'file', mime: f.getMimeType(), size: f.getSize() });
      }
    }
    sections[key].sort(function (a, b) { return collator_(a.name, b.name); });
  }
  var coverId = null; var ci = DriveApp.searchFiles("mimeType contains 'image/' and title contains 'cover' and trashed=false and '" + id + "' in parents");
  while (ci.hasNext()) { var c = ci.next(); if (/^cover\./i.test(c.getName())) { coverId = c.getId(); break; } }
  var data = { id: id, name: folder.getName(), coverId: coverId, sections: sections };
  cput_('p:' + id, data);
  return data;
}

function itemView_(it) {
  if (it.kind === 'text') return { id: it.id, name: it.name, kind: 'text', category: 'text', size: 0, text: it.text };
  if (it.kind === 'link') return { id: it.id, name: it.name, kind: 'link', category: 'link', size: 0, openUrl: it.url, shareUrl: it.url };
  var base = 'https://drive.google.com/file/d/' + it.id;
  return {
    id: it.id, name: it.name, kind: 'file', mime: it.mime, size: it.size, category: categoryOf_(it.mime),
    openUrl: base + '/view', shareUrl: base + '/view', previewUrl: base + '/preview',
    thumbUrl: 'https://drive.google.com/thumbnail?id=' + it.id + '&sz=w1600'
  };
}

function shareToken_(kind, projectId, section) {
  var o = { k: kind, p: projectId }; if (section) o.s = section;
  return sign_(o);
}
function projectView_(p) {
  var sections = {}; var tokens = { project: shareToken_('p', p.id), sections: {} };
  SECTION_KEYS.forEach(function (k) { sections[k] = p.sections[k].map(itemView_); tokens.sections[k] = shareToken_('c', p.id, k); });
  tokens.sections.info = shareToken_('c', p.id, 'info');
  return { id: p.id, name: p.name, coverUrl: p.coverId ? coverUrl_(p.coverId) : null, sections: sections, tokens: tokens };
}

function sectionFolder_(project, section) {
  var it = project.getFoldersByName(section);
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) return f; }
  return project.createFolder(section);
}
function shareLink_(file) {
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* يرث من المجلد الرئيسي */ }
}
function uniqueName_(folder, name) {
  var dot = name.lastIndexOf('.'); var base = dot > 0 ? name.slice(0, dot) : name; var ext = dot > 0 ? name.slice(dot) : '';
  var n = name; var i = 2;
  while (folder.getFilesByName(n).hasNext()) n = base + ' (' + (i++) + ')' + ext;
  return n;
}

// ============================================================ الإجراءات
var HANDLERS = {
  // ----- عامة
  'public': {
    access: 'public', run: function () {
      var t = settings_().texts; var out = {};
      LANGS.forEach(function (l) { out[l] = { siteName: t[l].siteName, tagline: t[l].tagline }; });
      return { texts: out };
    }
  },

  'login': {
    access: 'public', run: function (ctx, req) {
      var name = String(req.username || '').trim().toLowerCase();
      var a = attempts_(name);
      if (a.length >= 8) throw httpErr_(429, 'محاولات كثيرة. حاول بعد 15 دقيقة.');
      var list = users_(); var u = findByName_(list, name);
      var ok = checkPw_(String(req.password || ''), u ? u.passwordHash : '00:00');
      if (!u || !ok) {
        a.push(Date.now()); cache_().put('att_' + name, JSON.stringify(a), 900);
        throw httpErr_(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
      }
      if (!u.active) throw httpErr_(403, 'هذا الحساب موقوف. تواصل مع المسؤول.');
      cache_().remove('att_' + name);
      if (!u.lastLogin || Date.now() - Date.parse(u.lastLogin) > 3600000) {
        withLock_(function () {
          var l2 = users_(); var u2 = findUser_(l2, u.id);
          if (u2) { u2.lastLogin = new Date().toISOString(); writeJson_('users', l2); }
        });
      }
      return { token: makeSession_(u), user: userView_(u) };
    }
  },

  'shareView': {
    access: 'public', run: function (ctx, req) {
      var t = verify_(req.t);
      if (!t || !t.p || (t.k !== 'p' && t.k !== 'c')) throw httpErr_(404, 'الرابط غير صالح');
      var keys;
      if (t.k === 'p') keys = SECTION_KEYS;
      else if (t.s === 'info') keys = INFO_KEYS;
      else if (SECTION_KEYS.indexOf(t.s) >= 0) keys = [t.s];
      else throw httpErr_(404, 'الرابط غير صالح');
      var p = projectView_(readProject_(t.p)); var st = settings_(); var texts = {};
      LANGS.forEach(function (l) { texts[l] = { siteName: st.texts[l].siteName, labels: st.texts[l].labels }; });
      return {
        title: p.name, texts: texts,
        groups: keys.map(function (k) {
          return {
            key: k,
            items: p.sections[k].map(function (it) { return { name: it.name, href: it.shareUrl, category: it.category, size: it.size, text: it.text || '' }; })
          };
        })
      };
    }
  },

  // ----- مستخدم مسجّل
  'me': { access: 'auth', run: function (ctx) { return { user: userView_(ctx.user) }; } },

  'changePassword': {
    access: 'auth', run: function (ctx, req) {
      if (!checkPw_(String(req.current || ''), ctx.user.passwordHash)) throw httpErr_(400, 'كلمة المرور الحالية غير صحيحة');
      if (String(req.password || '').length < 6) throw httpErr_(400, 'كلمة المرور 6 أحرف على الأقل');
      return withLock_(function () {
        var list = users_(); var u = findUser_(list, ctx.user.id);
        u.passwordHash = makePw_(String(req.password)); u.tokenVersion = (u.tokenVersion || 1) + 1;
        writeJson_('users', list);
        return { ok: true, token: makeSession_(u) };
      });
    }
  },

  'config': {
    access: 'auth', run: function () {
      var s = settings_(); s.structure = STRUCTURE; s.maxDirectBytes = MAX_DIRECT_BYTES; s.maxUploadBytes = MAX_UPLOAD_BYTES;
      return s;
    }
  },

  'projects': {
    access: 'auth', run: function () {
      return { projects: listProjects_().map(function (p) { return { id: p.id, name: p.name, coverUrl: p.coverId ? coverUrl_(p.coverId) : null }; }) };
    }
  },

  'project': { access: 'auth', run: function (ctx, req) { return { project: projectView_(readProject_(String(req.id || ''))) }; } },

  'refresh': { access: 'auth', run: function () { bumpCache_(); return { ok: true }; } },

  'fileData': {
    access: 'auth', run: function (ctx, req) {
      var f = fileNode_(req.id); var mime = f.getMimeType(); var name = f.getName(); var blob;
      if (/\.(note|link)$/i.test(name)) throw httpErr_(400, 'ليس ملفاً');
      if (mime.indexOf('application/vnd.google-apps.') === 0) {
        blob = f.getAs('application/pdf'); mime = 'application/pdf'; if (!/\.pdf$/i.test(name)) name += '.pdf';
      } else {
        if (f.getSize() > MAX_DIRECT_BYTES) throw httpErr_(413, 'الملف أكبر من حد الإرسال المباشر');
        blob = f.getBlob();
      }
      var bytes = blob.getBytes();
      if (bytes.length > MAX_DIRECT_BYTES) throw httpErr_(413, 'الملف أكبر من حد الإرسال المباشر');
      return { name: name, mime: mime, data: Utilities.base64Encode(bytes) };
    }
  },

  // ----- المسؤول
  'createProject': {
    access: 'admin', run: function (ctx, req) {
      var name = cleanName_(req.name, 80);
      if (!name) throw httpErr_(400, 'اسم المشروع مطلوب');
      return withLock_(function () {
        if (root_().getFoldersByName(name).hasNext()) throw httpErr_(409, 'يوجد مشروع بهذا الاسم');
        var f = root_().createFolder(name);
        SECTION_KEYS.forEach(function (k) { f.createFolder(k); });
        bumpCache_();
        return { project: { id: f.getId(), name: name } };
      });
    }
  },

  'renameProject': {
    access: 'admin', run: function (ctx, req) {
      var f = folderNode_(req.id); var name = cleanName_(req.name, 80);
      if (!name) throw httpErr_(400, 'اسم المشروع مطلوب');
      if (name !== f.getName() && root_().getFoldersByName(name).hasNext()) throw httpErr_(409, 'يوجد مشروع بهذا الاسم');
      f.setName(name); bumpCache_();
      return { project: { id: f.getId(), name: name } };
    }
  },

  'deleteProject': { access: 'admin', run: function (ctx, req) { folderNode_(req.id).setTrashed(true); bumpCache_(); return { ok: true }; } },

  'addLink': {
    access: 'admin', run: function (ctx, req) {
      var project = folderNode_(req.projectId);
      if (SECTION_KEYS.indexOf(req.section) < 0) throw httpErr_(400, 'قسم غير صالح');
      var url = String(req.url || '').trim();
      if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
      if (!/^https?:\/\/\S+$/i.test(url)) throw httpErr_(400, 'الرابط غير صالح');
      if (!str_(req.title, 100)) throw httpErr_(400, 'عنوان الرابط مطلوب');
      var folder = sectionFolder_(project, req.section);
      var name = uniqueName_(folder, (cleanName_(req.title, 100) || 'رابط') + '.link');
      var f = folder.createFile(name, url, MimeType.PLAIN_TEXT); f.setDescription(url);
      bumpCache_();
      return { id: f.getId(), name: name };
    }
  },

  'upload': {
    access: 'admin', run: function (ctx, req) {
      var project = folderNode_(req.projectId); var section = req.section;
      var b64 = String(req.data || '');
      if (!b64) throw httpErr_(400, 'الملف فارغ');
      if (b64.length * 0.75 > MAX_UPLOAD_BYTES) throw httpErr_(413, 'الملف أكبر من ' + Math.round(MAX_UPLOAD_BYTES / 1048576) + ' MB. ارفعه مباشرة في Google Drive داخل مجلد القسم.');
      var name = cleanName_(req.name, 150) || 'file'; var mime = str_(req.mime, 100) || 'application/octet-stream';
      var parent;
      if (section === 'cover') {
        name = 'cover' + (extOf_(name) ? '.' + extOf_(name) : '.jpg'); parent = project;
        var old = project.getFiles();
        while (old.hasNext()) { var o = old.next(); if (/^cover\./i.test(o.getName())) o.setTrashed(true); }
      } else {
        if (SECTION_KEYS.indexOf(section) < 0) throw httpErr_(400, 'قسم غير صالح');
        parent = sectionFolder_(project, section); name = uniqueName_(parent, name);
      }
      var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, name);
      var f = parent.createFile(blob); shareLink_(f); bumpCache_();
      return { id: f.getId(), name: name };
    }
  },

  'addNote': {
    access: 'admin', run: function (ctx, req) {
      var project = folderNode_(req.projectId);
      if (INFO_KEYS.indexOf(req.section) < 0) throw httpErr_(400, 'قسم غير صالح');
      var text = String(req.text === undefined || req.text === null ? '' : req.text).replace(/\r\n/g, '\n').trim();
      if (!text) throw httpErr_(400, 'النص مطلوب');
      if (text.length > 4000) throw httpErr_(400, 'النص طويل جداً (الحد 4000 حرف)');
      var title = cleanName_(req.title, 60) || cleanName_(text.replace(/\s+/g, ' ').slice(0, 40), 60) || 'ملاحظة';
      var folder = sectionFolder_(project, req.section);
      var name = uniqueName_(folder, title + '.note');
      var f = folder.createFile(name, text, MimeType.PLAIN_TEXT);
      bumpCache_();
      return { id: f.getId(), name: name };
    }
  },

  'deleteFile': { access: 'admin', run: function (ctx, req) { fileNode_(req.id).setTrashed(true); bumpCache_(); return { ok: true }; } },

  'users': { access: 'admin', run: function () { return { users: users_().map(userView_) }; } },

  'createUser': {
    access: 'admin', run: function (ctx, req) {
      return withLock_(function () { var list = users_(); var u = createUser_(list, req); writeJson_('users', list); return { user: userView_(u) }; });
    }
  },

  'updateUser': {
    access: 'admin', run: function (ctx, req) {
      if (req.id === ctx.user.id && (req.active === false || (req.role && req.role !== 'admin'))) throw httpErr_(400, 'لا يمكنك إيقاف حسابك أو تغيير صلاحيتك');
      return withLock_(function () {
        var list = users_(); var u = findUser_(list, req.id);
        if (!u) throw httpErr_(404, 'المستخدم غير موجود');
        var wasAdmin = u.role === 'admin' && u.active;
        var next = JSON.parse(JSON.stringify(u));
        if (req.name !== undefined) next.name = str_(req.name, 60) || u.username;
        if (req.role !== undefined) next.role = req.role === 'admin' ? 'admin' : 'sales';
        if (req.active !== undefined) next.active = !!req.active;
        if (req.password) {
          if (String(req.password).length < 6) throw httpErr_(400, 'كلمة المرور 6 أحرف على الأقل');
          next.passwordHash = makePw_(String(req.password)); next.tokenVersion = (u.tokenVersion || 1) + 1;
        }
        if (!next.active) next.tokenVersion = (u.tokenVersion || 1) + 1;
        if (wasAdmin && !(next.role === 'admin' && next.active) && activeAdmins_(list).length <= 1) throw httpErr_(400, 'لا يمكن إزالة آخر مسؤول فعّال');
        for (var k in next) u[k] = next[k];
        writeJson_('users', list);
        return { user: userView_(u) };
      });
    }
  },

  'deleteUser': {
    access: 'admin', run: function (ctx, req) {
      if (req.id === ctx.user.id) throw httpErr_(400, 'لا يمكنك حذف حسابك');
      return withLock_(function () {
        var list = users_(); var u = findUser_(list, req.id);
        if (!u) throw httpErr_(404, 'المستخدم غير موجود');
        if (u.role === 'admin' && u.active && activeAdmins_(list).length <= 1) throw httpErr_(400, 'لا يمكن حذف آخر مسؤول فعّال');
        writeJson_('users', list.filter(function (x) { return x.id !== req.id; }));
        return { ok: true };
      });
    }
  },

  'getSettings': { access: 'admin', run: function () { return { settings: settings_() }; } },

  'updateSettings': {
    access: 'admin', run: function (ctx, req) {
      return withLock_(function () {
        var d = settings_(); var p = req || {};
        if (p.countryCode !== undefined) d.countryCode = String(p.countryCode).replace(/\D/g, '').slice(0, 4) || DEFAULT_COUNTRY_CODE;
        if (p.texts && typeof p.texts === 'object') {
          var lang = LANGS.indexOf(p.lang) >= 0 ? p.lang : 'ar'; var t = d.texts[lang]; var x = p.texts;
          if (x.siteName !== undefined && str_(x.siteName, 60)) t.siteName = str_(x.siteName, 60);
          if (x.tagline !== undefined) t.tagline = str_(x.tagline, 80);
          if (x.projectsTitle !== undefined && str_(x.projectsTitle, 40)) t.projectsTitle = str_(x.projectsTitle, 40);
          if (x.whatsappIntro !== undefined && str_(x.whatsappIntro, 300)) t.whatsappIntro = str_(x.whatsappIntro, 300);
          if (x.labels && typeof x.labels === 'object') {
            for (var k in DEFAULT_TEXTS.ar.labels) if (x.labels[k] !== undefined && str_(x.labels[k], 40)) t.labels[k] = str_(x.labels[k], 40);
          }
        }
        writeJson_('settings', d);
        return { settings: d };
      });
    }
  }
};

// ============================================================ دوال تُشغَّل يدوياً من محرر Apps Script
/** شغّلها مرة واحدة بعد ضبط خصائص السكربت. */
function setup() {
  var id = parseId_(props_().getProperty('ROOT_FOLDER_ID'));
  if (!id) throw new Error('أضف ROOT_FOLDER_ID في Project Settings ← Script properties');
  var root = DriveApp.getFolderById(id);
  props_().setProperty('ROOT_FOLDER_ID', id);
  if (!props_().getProperty('SECRET')) props_().setProperty('SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  try { root.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { Logger.log('تعذّر ضبط المشاركة تلقائياً. اضبط المجلد الرئيسي يدوياً: Anyone with the link — Viewer. ' + e); }
  var list = users_();
  if (!list.length) {
    var pw = props_().getProperty('ADMIN_PASSWORD');
    if (!pw) throw new Error('أضف ADMIN_PASSWORD في Script properties ثم أعد التشغيل');
    var uname = (props_().getProperty('ADMIN_USERNAME') || 'admin').toLowerCase();
    createUser_(list, { username: uname, name: 'المسؤول', password: pw, role: 'admin' });
    writeJson_('users', list);
    props_().deleteProperty('ADMIN_PASSWORD');
    Logger.log('تم إنشاء حساب المسؤول: ' + uname + ' (وحُذفت ADMIN_PASSWORD من الخصائص)');
  } else {
    Logger.log('المستخدمون موجودون مسبقاً (' + list.length + '). لا تغيير.');
  }
  Logger.log('جاهز. المجلد الرئيسي: ' + root.getName());
}

/** نسيت كلمة مرور المسؤول؟ ضع ADMIN_USERNAME و ADMIN_PASSWORD في الخصائص ثم شغّل هذه الدالة. */
function resetAdminPassword() {
  var pw = props_().getProperty('ADMIN_PASSWORD'); var uname = (props_().getProperty('ADMIN_USERNAME') || 'admin').toLowerCase();
  if (!pw || pw.length < 6) throw new Error('أضف ADMIN_PASSWORD (6 أحرف على الأقل)');
  withLock_(function () {
    var list = users_(); var u = findByName_(list, uname);
    if (!u) throw new Error('لا يوجد مستخدم باسم ' + uname);
    u.passwordHash = makePw_(pw); u.tokenVersion = (u.tokenVersion || 1) + 1; u.active = true; u.role = 'admin';
    writeJson_('users', list);
  });
  props_().deleteProperty('ADMIN_PASSWORD');
  Logger.log('تمت إعادة تعيين كلمة المرور للمستخدم ' + uname);
}

/** لإبطال كل روابط المشاركة وجلسات الدخول: يغيّر المفتاح السري. */
function rotateSecret() {
  props_().setProperty('SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  Logger.log('تم تغيير المفتاح السري: كل الجلسات وروابط الصفحات المرسلة سابقاً أُبطلت.');
}
