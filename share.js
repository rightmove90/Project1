'use strict';
// صفحة العميل: تعرض ملفات مشروع أو قسم عبر رابط موقّع، دون تسجيل دخول. اللغة من الرابط (l=ar|ku|en)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { image: '🖼️', video: '🎬', pdf: '📄', sheet: '📊', doc: '📝', audio: '🎧', link: '📍', other: '📎' };
const fmtSize = (n) => (!n ? '' : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const safeHref = (u) => (/^https?:\/\//i.test(u) ? u : '#');
const UI = {
  ar: { dir: 'rtl', loading: 'جارٍ تحميل الملفات…', empty: 'لا توجد ملفات هنا بعد.', bad: 'الرابط غير صالح أو انتهت صلاحيته', fail: 'تعذّر فتح الرابط', err: 'حدث خطأ', back: 'رجوع', files: 'ملفات' },
  ku: { dir: 'rtl', loading: 'فایلەکان بار دەکرێن…', empty: 'هێشتا هیچ فایلێک لێرە نییە.', bad: 'بەستەرەکە دروست نییە یان بەسەرچووە', fail: 'کردنەوەی بەستەرەکە سەرکەوتوو نەبوو', err: 'هەڵەیەک ڕوویدا', back: 'گەڕانەوە', files: 'فایل' },
  en: { dir: 'ltr', loading: 'Loading files…', empty: 'No files here yet.', bad: 'This link is invalid or has expired', fail: 'Could not open the link', err: 'Something went wrong', back: 'Back', files: 'files' }
};
document.addEventListener('error', (e) => { const i = e.target; if (i && i.tagName === 'IMG' && i.classList.contains('th')) i.remove(); }, true);
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
    const label = (k) => (k.indexOf('info_') === 0 && k !== 'info_gen' ? L.info + ' — ' + L[k] : L[k]);
    const thumb = (it) => { const m = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(it.href || ''); return m && it.category !== 'link' && it.category !== 'audio' ? `<img class="th" loading="lazy" alt="" src="https://drive.google.com/thumbnail?id=${m[1]}&sz=w240">` : ''; };
    const groups = d.groups.filter((g) => g.items.length);
    const rowHtml = (it) => (it.category === 'text'
      ? `<div class="row note"><span class="ic">📝</span><span class="nm"><b>${esc(it.name)}</b><br><span class="tx">${esc(it.text)}</span></span></div>`
      : `<a class="row" href="${esc(safeHref(it.href))}" target="_blank" rel="noopener"><span class="ic">${ICON[it.category] || ICON.other}${thumb(it)}</span><span class="nm">${esc(it.name)}</span><span class="sz">${esc(fmtSize(it.size))}</span></a>`);
    const block = (title, items) => `<section>${title ? `<h2>${esc(title)}</h2>` : ''}${items.map(rowHtml).join('')}</section>`;
    // الأقسام الرئيسية: رابط "معلومات المشروع" يعرض كل قسم معلومات كبطاقة، ورابط المشروع يدمج أقسام المعلومات في بطاقة واحدة
    const infoOnly = groups.length > 1 && groups.every((g) => g.key.indexOf('info_') === 0);
    const tops = [];
    if (infoOnly) groups.forEach((g) => tops.push({ id: g.key, label: L[g.key], blocks: [{ title: '', items: g.items }] }));
    else {
      let infoDone = false;
      groups.forEach((g) => {
        if (g.key.indexOf('info_') === 0) {
          if (infoDone) return; infoDone = true;
          const ig = groups.filter((x) => x.key.indexOf('info_') === 0);
          tops.push({ id: 'info', label: L.info, blocks: ig.map((x) => ({ title: x.key === 'info_gen' ? L.info_gen : L[x.key], items: x.items })) });
        } else tops.push({ id: g.key, label: L[g.key], blocks: [{ title: '', items: g.items }] });
      });
    }
    const countOf = (tp) => tp.blocks.reduce((n, x) => n + x.items.length, 0);
    const draw = () => {
      if (!tops.length) { main.innerHTML = `<p class="msg">${esc(ui.empty)}</p>`; return; }
      const cur = tops.length > 1 ? tops.find((x) => x.id === decodeURIComponent((location.hash.match(/^#s=(.+)$/) || [])[1] || '')) : tops[0];
      if (cur) {
        main.innerHTML = (tops.length > 1 ? `<a class="back" href="#">${esc(ui.back)}</a><h3 class="sh">${esc(cur.label)}</h3>` : '') + cur.blocks.map((x) => block(x.title, x.items)).join('');
      } else {
        main.innerHTML = `<div class="tiles">${tops.map((tp) => `<a class="tile" href="#s=${encodeURIComponent(tp.id)}"><span>${esc(tp.label)}</span><b>${countOf(tp)}</b></a>`).join('')}</div>`;
      }
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', draw);
    draw();
  } catch (e) {
    document.getElementById('title').textContent = ui.fail;
    main.innerHTML = `<p class="msg">${esc(e.message || ui.err)}</p>`;
  }
})();
