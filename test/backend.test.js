// يشغّل Code.gs داخل بيئة Apps Script محاكاة ويجرّب كل الإجراءات
const assert = require('assert');
const { createEnv } = require('./gas-mock');

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); pass++; };
const b64 = (s) => Buffer.from(s).toString('base64');

const env = createEnv();
const { call, props, nodes, rootId } = env;
props.setProperty('ROOT_FOLDER_ID', `https://drive.google.com/drive/folders/${rootId}?usp=sharing`);
props.setProperty('ADMIN_PASSWORD', 'Admin#123');

// بدون setup لا يعمل
eq(call({ action: 'me', token: 'a.b' }).status, 500, 'يطلب setup أولاً');

env.ctx.setup();
ok(!props.getProperty('ADMIN_PASSWORD'), 'حذف ADMIN_PASSWORD بعد الإنشاء');
ok([...nodes.values()].find((n) => n.name === '_portal_users.json'), 'ملف المستخدمين في Drive');
eq(nodes.get(rootId).sharing, ['ANYONE_WITH_LINK', 'VIEW'], 'مشاركة المجلد الرئيسي');
env.ctx.setup(); // إعادة التشغيل لا تُنشئ شيئاً
eq(JSON.parse([...nodes.values()].find((n) => n.name === '_portal_users.json').content.toString()).length, 1);

const A = (token) => (action, p = {}) => call({ action, token, ...p });
const anon = A();

// ---- الدخول
eq(anon('login', { username: 'admin', password: 'bad' }).status, 401);
const li = anon('login', { username: 'ADMIN', password: 'Admin#123' });
eq(li.ok, true); eq(li.data.user.role, 'admin'); ok(!JSON.stringify(li).includes('passwordHash'), 'لا يُسرَّب الهاش');
const admin = A(li.data.token);
eq(anon('projects').status, 401, 'بدون جلسة');
eq(A('abc.def')('projects').status, 401, 'توكن مزوّر');
eq(admin('me').data.user.username, 'admin');
eq(anon('public').data.texts.ar.siteName, 'مشاريع الشركة'); eq(anon('public').data.texts.en.siteName, 'Company Projects'); eq(anon('public').data.texts.ku.siteName, 'پڕۆژەکانی کۆمپانیا');
eq(anon('nope').status, 404);
const forged = li.data.token.split('.')[0] + '.' + 'A'.repeat(43);
eq(A(forged)('me').status, 401, 'توقيع خاطئ');
// تعديل محتوى التوكن (رفع الصلاحية) يُرفض
eq(call({ action: 'users', token: li.data.token.slice(0, -1) + (li.data.token.slice(-1) === 'a' ? 'b' : 'a') }).status, 401);

// ---- مشروع
const cp = admin('createProject', { name: '  مشروع/الأمل:  ' });
eq(cp.ok, true); const pid = cp.data.project.id; eq(cp.data.project.name, 'مشروع الأمل');
eq(admin('createProject', { name: 'مشروع الأمل' }).status, 409);
eq(admin('createProject', { name: '   ' }).status, 400);
const folders = [...nodes.values()].filter((n) => n.parents.includes(pid)).map((n) => n.name).sort();
eq(folders, ['info_ar', 'info_en', 'info_ku', 'location', 'maps', 'prices', 'videos'].sort(), 'مجلدات الأقسام');

const up = (section, name, buf, mime) => admin('upload', { projectId: pid, section, name, mime, data: buf.toString('base64') });
const pdf = Buffer.from('%PDF-1.4 hello');
eq(up('info_ar', 'نبذة عن المشروع.pdf', pdf, 'application/pdf').ok, true);
eq(up('info_ar', 'نبذة عن المشروع.pdf', pdf, 'application/pdf').data.name, 'نبذة عن المشروع (2).pdf', 'اسم مكرر');
eq(up('videos', 'tour.mp4', Buffer.alloc(1000, 1), 'video/mp4').ok, true);
eq(up('prices', 'prices.xlsx', Buffer.from('x'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').ok, true);
eq(up('nope', 'a.txt', Buffer.from('a'), 'text/plain').status, 400, 'قسم غير صالح');
eq(up('cover', 'photo.PNG', Buffer.from('png'), 'image/png').ok, true, 'غلاف');
eq(up('cover', 'photo2.jpg', Buffer.from('jpg'), 'image/jpeg').ok, true, 'غلاف جديد يستبدل القديم');
eq([...nodes.values()].filter((n) => n.parents.includes(pid) && /^cover\./.test(n.name) && !n.trashed).length, 1, 'غلاف واحد فقط');
eq(admin('upload', { projectId: pid, section: 'maps', name: 'big.bin', data: 'A'.repeat(21 * 1024 * 1024) }).status, 413, 'حد الرفع');
eq(admin('upload', { projectId: pid, section: 'maps', name: 'e', data: '' }).status, 400);
eq(admin('addLink', { projectId: pid, section: 'location', title: 'الموقع', url: 'maps.google.com/?q=35.5,45.4' }).ok, true);
eq(admin('addLink', { projectId: pid, section: 'videos', title: 'x', url: 'javascript:alert(1)' }).status, 400, 'رابط خطير');
eq(admin('addLink', { projectId: pid, section: 'videos', title: '', url: 'https://youtu.be/a' }).status, 400);

const list = admin('projects').data.projects;
eq(list.length, 1); ok(/thumbnail\?id=/.test(list[0].coverUrl), 'رابط الغلاف');
const pr = admin('project', { id: pid }).data.project;
eq(pr.name, 'مشروع الأمل');
eq(pr.sections.info_ar.map((x) => x.name), ['نبذة عن المشروع (2).pdf', 'نبذة عن المشروع.pdf'].sort((a, b) => a.localeCompare(b, ['ar', 'en'], { numeric: true })), 'ترتيب');
const v = pr.sections.videos[0];
eq(v.category, 'video'); ok(v.shareUrl === `https://drive.google.com/file/d/${v.id}/view`, 'رابط Drive'); ok(/\/preview$/.test(v.previewUrl));
const loc = pr.sections.location[0];
eq(loc.kind, 'link'); eq(loc.shareUrl, 'https://maps.google.com/?q=35.5,45.4'); eq(loc.name, 'الموقع');
ok(pr.tokens.project && pr.tokens.sections.videos && pr.tokens.sections.info, 'رموز المشاركة');

// ---- أمان الوصول للملفات والمجلدات
const outsideFolder = env.add({ name: 'خارج', mimeType: 'application/vnd.google-apps.folder', parents: [] });
const outsideFile = env.add({ name: 'secret.txt', mimeType: 'text/plain', parents: [outsideFolder], content: Buffer.from('TOP SECRET') });
eq(admin('project', { id: outsideFolder }).status, 404, 'مشروع خارج الجذر');
eq(admin('project', { id: rootId }).status, 404, 'الجذر نفسه ليس مشروعاً');
eq(admin('fileData', { id: outsideFile }).status, 404, 'ملف خارج الجذر');
eq(admin('deleteFile', { id: outsideFile }).status, 404);
eq(admin('deleteProject', { id: outsideFolder }).status, 404);
eq(admin('fileData', { id: 'zzzz' }).status, 404);
eq(admin('project', { id: 'zzzz' }).status, 404);

// ---- fileData
const fd = admin('fileData', { id: pr.sections.info_ar[1].id });
eq(fd.ok, true); eq(Buffer.from(fd.data.data, 'base64').toString(), '%PDF-1.4 hello'); eq(fd.data.mime, 'application/pdf');
up('maps', 'huge.bin', Buffer.alloc(11 * 1024 * 1024, 7), 'application/octet-stream');
const huge = admin('project', { id: pid }).data.project.sections.maps.find((x) => x.name === 'huge.bin') || (bumpAndGet());
function bumpAndGet() { admin('refresh'); return admin('project', { id: pid }).data.project.sections.maps.find((x) => x.name === 'huge.bin'); }
eq(admin('fileData', { id: huge.id }).status, 413, 'حد الإرسال المباشر');
const gdoc = env.add({ name: 'عرض سعر', mimeType: 'application/vnd.google-apps.document', parents: [[...nodes.values()].find((n) => n.name === 'prices' && n.parents.includes(pid)).id] });
eq(admin('fileData', { id: gdoc }).data.mime, 'application/pdf', 'تصدير Google Docs');

// ---- صفحات المشاركة
const sv = (t) => anon('shareView', { t });
const sp = sv(pr.tokens.project);
eq(sp.ok, true); eq(sp.data.title, 'مشروع الأمل'); ok(sp.data.groups.length === 7);
ok(sp.data.groups.find((g) => g.key === 'videos').items[0].href.includes('drive.google.com/file/d/'), 'روابط الملفات'); eq(sp.data.texts.en.labels.videos, 'Videos'); eq(sp.data.texts.ku.labels.prices, 'نرخەکان');
const sc = sv(pr.tokens.sections.videos).data; eq(sc.groups.length, 1); eq(sc.groups[0].key, 'videos'); eq(sc.groups[0].items.length, 1);
const si = sv(pr.tokens.sections.info).data; eq(si.groups.length, 3); eq(si.groups.map((g) => g.key), ['info_ar', 'info_ku', 'info_en']);
eq(sv(pr.tokens.project.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))).status, 404, 'رمز مشاركة مزوّر');
eq(sv(li.data.token).status, 404, 'توكن الجلسة ليس رمز مشاركة');
eq(sv('').status, 404);
// رمز مشاركة صالح لكنه لقسم غير موجود
eq(sv(env.ctx.sign_({ k: 'c', p: pid, s: 'bogus' })).status, 404);
eq(sv(env.ctx.sign_({ k: 'p', p: outsideFolder })).status, 404, 'مشاركة مجلد خارجي');

// ---- مستخدمون وصلاحيات
const nu = admin('createUser', { username: 'Sara', name: 'سارة', password: 'secret1', role: 'sales' });
eq(nu.ok, true); eq(nu.data.user.username, 'sara');
eq(admin('createUser', { username: 'sara', password: 'secret1' }).status, 409);
eq(admin('createUser', { username: 'ab', password: 'secret1' }).status, 400);
eq(admin('createUser', { username: 'okname', password: '123' }).status, 400);
const sl = anon('login', { username: 'sara', password: 'secret1' }); eq(sl.ok, true);
const sara = A(sl.data.token);
eq(sara('projects').data.projects.length, 1, 'موظف يرى المشاريع');
eq(sara('createProject', { name: 'x' }).status, 403); eq(sara('users').status, 403); eq(sara('upload', {}).status, 403);
eq(sara('deleteFile', { id: v.id }).status, 403); eq(sara('updateSettings', { lang: 'ar', texts: { siteName: 'x' } }).status, 403);
eq(sara('fileData', { id: pr.sections.info_ar[1].id }).ok, true, 'الموظف يرسل الملفات');
eq(admin('updateUser', { id: nu.data.user.id, active: false }).ok, true);
eq(sara('projects').status, 401, 'الموقوف يُطرد فوراً');
eq(anon('login', { username: 'sara', password: 'secret1' }).status, 403, 'لا دخول للموقوف');
eq(admin('updateUser', { id: nu.data.user.id, active: true, password: 'newpass1' }).ok, true);
eq(anon('login', { username: 'sara', password: 'secret1' }).status, 401, 'القديمة لا تعمل');
eq(anon('login', { username: 'sara', password: 'newpass1' }).ok, true);
eq(sara('projects').status, 401, 'الجلسة القديمة أُبطلت بتغيير كلمة المرور');
const me = admin('me').data.user;
eq(admin('updateUser', { id: me.id, active: false }).status, 400, 'لا يوقف نفسه');
eq(admin('updateUser', { id: me.id, role: 'sales' }).status, 400);
eq(admin('deleteUser', { id: me.id }).status, 400);
eq(admin('deleteUser', { id: 'nope' }).status, 404);
const second = admin('createUser', { username: 'boss2', name: 'مدير', password: 'secret2', role: 'admin' });
eq(admin('updateUser', { id: me.id, role: 'sales' }).status, 400, 'ما زال لا يغيّر صلاحيته');
const boss = A(anon('login', { username: 'boss2', password: 'secret2' }).data.token);
eq(boss('updateUser', { id: me.id, role: 'sales' }).ok, true, 'مسؤول آخر يخفض الأول');
eq(boss('deleteUser', { id: second.data.user.id }).status, 400, 'لا يحذف نفسه');
eq(admin('users').status, 403, 'الأول أصبح مبيعات: لا صلاحيات إدارة');
eq(boss('updateUser', { id: me.id, role: 'admin' }).ok, true);

// ---- تغيير كلمة المرور
const bossNow = A(anon('login', { username: 'boss2', password: 'secret2' }).data.token);
eq(bossNow('changePassword', { current: 'wrong', password: 'abcdef' }).status, 400);
eq(bossNow('changePassword', { current: 'secret2', password: 'abc' }).status, 400);
const cpw = bossNow('changePassword', { current: 'secret2', password: 'abcdef' });
eq(cpw.ok, true); eq(A(cpw.data.token)('me').ok, true, 'توكن جديد يعمل'); eq(bossNow('me').status, 401, 'القديم لا يعمل');

// ---- إعدادات
const adm2 = A(anon('login', { username: 'admin', password: 'Admin#123' }).data.token);
const st = adm2('updateSettings', { lang: 'ar', texts: { siteName: 'شركة النور', labels: { videos: 'جولات الفيديو' }, whatsappIntro: 'أهلاً، مشروع {project}:' }, countryCode: '+964' });
eq(st.data.settings.texts.ar.siteName, 'شركة النور'); eq(st.data.settings.countryCode, '964');
eq(adm2('updateSettings', { lang: 'en', texts: { siteName: 'Al Noor Co.', labels: { videos: 'Video tours' }, tagline: '' } }).ok, true);
eq(adm2('updateSettings', { lang: 'xx', texts: { siteName: 'ignored->ar?' } }).ok, true, 'لغة غير معروفة تُعامل كعربية');
adm2('updateSettings', { lang: 'ar', texts: { siteName: 'شركة النور' } });
const cfgNow = adm2('config').data;
eq(cfgNow.texts.ar.labels.videos, 'جولات الفيديو'); eq(cfgNow.texts.en.labels.videos, 'Video tours'); eq(cfgNow.texts.en.tagline, '', 'سطر فارغ مسموح'); eq(cfgNow.texts.ku.labels.videos, 'ڤیدیۆکان', 'الكردية لم تتأثر');
eq(cfgNow.texts.ar.whatsappIntro, 'أهلاً، مشروع {project}:'); eq(cfgNow.texts.en.whatsappIntro, 'Hello, here are the details of {project}:');
eq(anon('public').data.texts.ar.siteName, 'شركة النور'); eq(anon('public').data.texts.en.siteName, 'Al Noor Co.');
eq(sv(pr.tokens.sections.videos).data.texts.en.labels.videos, 'Video tours', 'الاسم الجديد في صفحة العميل');
eq(adm2('updateSettings', { lang: 'ku', texts: { labels: { prices: '   ' }, siteName: '  ' } }).data.settings.texts.ku.labels.prices, 'نرخەکان', 'القيم الفارغة تُتجاهل');

// ---- نصوص قسم المعلومات
const nt = adm2('addNote', { projectId: pid, section: 'info_ku', title: 'ملاحظة', text: '  السعر يبدأ من 50 ألف\nالتسليم خلال سنة  ' });
eq(nt.ok, true);
eq(adm2('addNote', { projectId: pid, section: 'info_en', text: 'Only text with auto title that is quite long indeed' }).ok, true);
eq(adm2('addNote', { projectId: pid, section: 'videos', text: 'x' }).status, 400, 'النص للمعلومات فقط');
eq(adm2('addNote', { projectId: pid, section: 'info_ar', text: '   ' }).status, 400);
eq(adm2('addNote', { projectId: pid, section: 'info_ar', text: 'a'.repeat(4001) }).status, 400);
eq(A(anon('login', { username: 'sara', password: 'newpass1' }).data.token)('addNote', { projectId: pid, section: 'info_ar', text: 'x' }).status, 403);
const withNotes = adm2('project', { id: pid }).data.project;
const note = withNotes.sections.info_ku[0];
eq(note.kind, 'text'); eq(note.category, 'text'); eq(note.text, 'السعر يبدأ من 50 ألف\nالتسليم خلال سنة'); eq(note.name, 'ملاحظة');
ok(withNotes.sections.info_en[0].name.length <= 40 && withNotes.sections.info_en[0].text.startsWith('Only text'), 'عنوان تلقائي');
eq(adm2('fileData', { id: note.id }).status, 400, 'الملاحظة ليست ملفاً للإرسال');
const shNote = sv(withNotes.tokens.sections.info).data.groups.find((g) => g.key === 'info_ku').items[0];
eq(shNote.text, note.text); eq(shNote.category, 'text');
eq(adm2('deleteFile', { id: note.id }).ok, true); eq(adm2('project', { id: pid }).data.project.sections.info_ku.length, 0, 'حذف ملاحظة');

// ---- ترحيل إعدادات قديمة (قبل دعم اللغات)
env.cmap.clear();
const sf = [...nodes.values()].find((n) => n.name === '_portal_settings.json');
sf.content = Buffer.from(JSON.stringify({ siteName: 'اسم قديم', labels: { prices: 'الأسعار القديمة' }, countryCode: '964', whatsappIntro: 'مرحباً القديم {project}' }));
const mig = adm2('config').data;
eq(mig.texts.ar.siteName, 'اسم قديم'); eq(mig.texts.ar.labels.prices, 'الأسعار القديمة'); eq(mig.texts.ar.whatsappIntro, 'مرحباً القديم {project}'); eq(mig.texts.en.siteName, 'Company Projects');
adm2('updateSettings', { lang: 'ar', texts: { siteName: 'شركة النور' } }); adm2('refresh');

// ---- تحديد المحاولات
let last; for (let i = 0; i < 9; i++) last = anon('login', { username: 'ghost', password: 'x' });
eq(last.status, 429, 'حد المحاولات');

// ---- إعادة تسمية/حذف + الذاكرة المؤقتة
eq(adm2('renameProject', { id: pid, name: 'مشروع النور' }).data.project.name, 'مشروع النور');
eq(adm2('projects').data.projects[0].name, 'مشروع النور', 'الكاش يُبطل بعد التعديل');
const fileId = adm2('project', { id: pid }).data.project.sections.info_ar[0].id;
eq(adm2('deleteFile', { id: fileId }).ok, true);
eq(adm2('project', { id: pid }).data.project.sections.info_ar.length, 1, 'حذف ملف');
eq(adm2('fileData', { id: fileId }).status, 404, 'المحذوف لا يُفتح');
// كاش المشروع يوفّر نداءات Drive
const before = env.stats.calls; adm2('project', { id: pid }); eq(env.stats.calls, before, 'قراءة مكررة من الكاش');
adm2('refresh'); adm2('project', { id: pid }); ok(env.stats.calls > before, 'التحديث اليدوي يعيد القراءة');
eq(adm2('deleteProject', { id: pid }).ok, true);
eq(adm2('projects').data.projects.length, 0); eq(adm2('project', { id: pid }).status, 404);

// ---- استمرارية + دوال الصيانة
env.cmap.clear(); // كأن الكاش انتهى: كل شيء يُقرأ من ملفات Drive
ok(anon('login', { username: 'sara', password: 'newpass1' }).ok, 'المستخدمون محفوظون في Drive');
props.setProperty('ADMIN_USERNAME', 'admin'); props.setProperty('ADMIN_PASSWORD', 'Reset#999');
env.ctx.resetAdminPassword();
eq(anon('login', { username: 'admin', password: 'Admin#123' }).status, 401); ok(anon('login', { username: 'admin', password: 'Reset#999' }).ok, 'إعادة تعيين المسؤول');
const tok = anon('login', { username: 'sara', password: 'newpass1' }).data.token;
env.ctx.rotateSecret();
eq(A(tok)('me').status, 401, 'تغيير المفتاح يُبطل الجلسات');
eq(sv(pr.tokens.project).status, 404, 'ويُبطل روابط المشاركة');

console.log(`نجحت ${pass} فحصاً ✔ (Code.gs على بيئة Apps Script محاكاة)`);
