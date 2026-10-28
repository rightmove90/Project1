'use strict';
// صفحة العميل: تعرض ملفات مشروع أو قسم عبر رابط موقّع، دون تسجيل دخول. اللغة من الرابط (l=ar|ku|en)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { image: '🖼️', video: '🎬', pdf: '📄', sheet: '📊', doc: '📝', audio: '🎧', link: '📍', other: '📎' };
const fmtSize = (n) => (!n ? '' : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const safeHref = (u) => (/^https?:\/\//i.test(u) ? u : '#');
const UI = {
  ar: { dir: 'rtl', loading: 'جارٍ تحميل الملفات…', empty: 'لا توجد ملفات هنا بعد.', bad: 'الرابط غير صالح أو انتهت صلاحيته', fail: 'تعذّر فتح الرابط', err: 'حدث خطأ' },
  ku: { dir: 'rtl', loading: 'فایلەکان بار دەکرێن…', empty: 'هێشتا هیچ فایلێک لێرە نییە.', bad: 'بەستەرەکە دروست نییە یان بەسەرچووە', fail: 'کردنەوەی بەستەرەکە سەرکەوتوو نەبوو', err: 'هەڵەیەک ڕوویدا' },
  en: { dir: 'ltr', loading: 'Loading files…', empty: 'No files here yet.', bad: 'This link is invalid or has expired', fail: 'Could not open the link', err: 'Something went wrong' }
};
(async function () {
  const q = new URLSearchParams(location.search);
  const lang = UI[q.get('l')] ? q.get('l') : 'ar'; const ui = UI[lang];
  document.documentElement.lang = lang; document.documentElement.dir = ui.dir;
  const main = document.getElementById('main'); main.innerHTML = `<p class="msg">${esc(ui.loading)}</p>`;
  const t = q.get('t');
  try {
    if (!t) throw new Error(ui.bad);
    const cfg = window.PORTAL || {};
    const res = await fetch(cfg.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'shareView', t }) });
    const j = await res.json();
    if (!j.ok) throw new Error(j.status === 404 ? ui.bad : ui.err);
    const d = j.data; const tx = (d.texts && d.texts[lang]) || d.texts.ar; const L = tx.labels;
    document.title = d.title + ' — ' + tx.siteName;
    document.getElementById('site').textContent = tx.siteName;
    document.getElementById('title').textContent = d.title;
    const label = (k) => (k.indexOf('info_') === 0 ? L.info + ' — ' + L[k] : L[k]);
    const groups = d.groups.filter((g) => g.items.length);
    main.innerHTML = groups.length ? groups.map((g) => `<section><h2>${esc(label(g.key))}</h2>${g.items.map((it) => it.category === 'text'
      ? `<div class="row note"><span class="ic">📝</span><span class="nm"><b>${esc(it.name)}</b><br><span class="tx">${esc(it.text)}</span></span></div>`
      : `<a class="row" href="${esc(safeHref(it.href))}" target="_blank" rel="noopener"><span class="ic">${ICON[it.category] || ICON.other}</span><span class="nm">${esc(it.name)}</span><span class="sz">${esc(fmtSize(it.size))}</span></a>`).join('')}</section>`).join('')
      : `<p class="msg">${esc(ui.empty)}</p>`;
  } catch (e) {
    document.getElementById('title').textContent = ui.fail;
    main.innerHTML = `<p class="msg">${esc(e.message || ui.err)}</p>`;
  }
})();
