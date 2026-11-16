'use strict';
// صفحة العميل: تعرض ملفات مشروع أو قسم عبر رابط موقّع، دون تسجيل دخول. اللغة من الرابط (l=ar|ku|en)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { image: '🖼️', video: '🎬', pdf: '📄', sheet: '📊', doc: '📝', audio: '🎧', link: '📍', other: '📎' };
const fmtSize = (n) => (!n ? '' : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const safeHref = (u) => (/^https?:\/\//i.test(u) ? u : '#');
const UI = {
  ar: { dir: 'rtl', loading: 'جارٍ تحميل الملفات…', empty: 'لا توجد ملفات هنا بعد.', bad: 'الرابط غير صالح أو انتهت صلاحيته', expired: 'انتهت صلاحية هذا الرابط (مدته 48 ساعة). اطلب من المرسل رابطاً جديداً.', fail: 'تعذّر فتح الرابط', err: 'حدث خطأ', back: 'رجوع', files: 'ملفات', exit: 'خروج', flang: 'اللغة', all: 'الكل', prev: 'السابق', next: 'التالي' },
  ku: { dir: 'rtl', loading: 'فایلەکان بار دەکرێن…', empty: 'هێشتا هیچ فایلێک لێرە نییە.', bad: 'بەستەرەکە دروست نییە یان بەسەرچووە', expired: 'ماوەی ئەم بەستەرە (٤٨ کاتژمێر) بەسەرچووە. داوا لە نێرەر بکە بەستەرێکی نوێ بنێرێت.', fail: 'کردنەوەی بەستەرەکە سەرکەوتوو نەبوو', err: 'هەڵەیەک ڕوویدا', back: 'گەڕانەوە', files: 'فایل', exit: 'دەرچوون', flang: 'زمان', all: 'هەموو', prev: 'پێشوو', next: 'دواتر' },
  en: { dir: 'ltr', loading: 'Loading files…', empty: 'No files here yet.', bad: 'This link is invalid or has expired', expired: 'This link has expired (links last 48 hours). Please ask the sender for a new one.', fail: 'Could not open the link', err: 'Something went wrong', back: 'Back', files: 'files', exit: 'Exit', flang: 'Language', all: 'All', prev: 'Previous', next: 'Next' }
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
    if (!j.ok) throw new Error(j.status === 410 ? ui.expired : j.status === 404 ? ui.bad : ui.err);
    const d = j.data; const tx = (d.texts && d.texts[lang]) || d.texts.ar; const L = tx.labels;
    document.title = d.title + ' — ' + tx.siteName;
    document.getElementById('site').textContent = tx.siteName;
    document.getElementById('title').textContent = d.title;
    const label = (k) => (k.indexOf('info_') === 0 && k !== 'info_gen' ? L.info + ' — ' + L[k] : L[k]);
    const driveId = (it) => { const m = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(it.href || ''); return m && it.category !== 'link' ? m[1] : ''; };
    // عارض داخل الصفحة بملء الشاشة مع زر خروج (بدل فتح Drive). السابق/التالي ضمن الملفات الظاهرة في القسم الحالي فقط
    const VIEW = { list: [], idx: 0 };
    const vbtn = (d, cls, glyph) => `<button class="${cls}" type="button" data-vnav="${d}" aria-label="${esc(d < 0 ? ui.prev : ui.next)}">${glyph}</button>`;
    const prevBtn = (cls, g) => (VIEW.idx > 0 ? vbtn(-1, cls, g) : '');
    const nextBtn = (cls, g) => (VIEW.idx < VIEW.list.length - 1 ? vbtn(1, cls, g) : '');
    const goView = (d) => {
      const j = VIEW.idx + d; if (j < 0 || j >= VIEW.list.length) return;
      VIEW.idx = j; const it = VIEW.list[j]; openViewer(it.id, it.cat, it.name, true);
    };
    const wireNav = (v) => { v.querySelectorAll('[data-vnav]').forEach((b) => { b.addEventListener('click', (e) => { e.stopPropagation(); goView(+b.dataset.vnav); }); }); };
    const closeViewer = (fromPop) => {
      const v = document.getElementById('viewer'); if (!v) return;
      v.remove(); document.body.style.overflow = '';
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* */ }
      if (fromPop !== true && history.state && history.state.viewer) history.back();
    };
    // مشغّل فيديو: بقياسه الحقيقي (دون قص)، بلا أي شيء فوقه سوى زر الخروج؛ لمسة على الشاشة تُظهر شريط التقدم، ولمستان على اليمين/اليسار تقدّمان/ترجعان 10 ثوانٍ
    const fmtT = (x) => { x = Math.max(0, Math.floor(x || 0)); const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), sc = x % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sc).padStart(2, '0'); };
    const openVideo = (id, name, nav) => {
      closeViewer(true);
      const v = document.createElement('div'); v.id = 'viewer'; v.className = 'vv'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true');
      v.innerHTML = `<video playsinline autoplay preload="auto" aria-label="${esc(name)}"></video><div class="vtap"></div>
        <button class="vx vxf" type="button">✕ ${esc(ui.exit)}</button>
        <div class="vctl" hidden>${prevBtn('vq', '⏮')}<button class="vp" type="button" aria-label="play/pause">⏸</button>${nextBtn('vq', '⏭')}<span class="vt" dir="ltr">0:00</span><input class="vs" type="range" min="0" max="1000" value="0" step="1" dir="ltr" aria-label="${esc(name)}"><span class="vd" dir="ltr">0:00</span></div>`;
      document.body.appendChild(v); document.body.style.overflow = 'hidden';
      const vid = v.querySelector('video'); const ctl = v.querySelector('.vctl'); const slider = v.querySelector('.vs'); const pp = v.querySelector('.vp');
      const key = (window.PORTAL || {}).DRIVE_API_KEY;
      const srcs = []; if (key) srcs.push(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(key)}`);
      srcs.push(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
      srcs.push(`https://drive.google.com/uc?export=download&id=${id}`);
      let si = 0; let dragging = false; let hideT = null; let dead = false;
      const fallbackIframe = () => { dead = true; v.className = ''; v.innerHTML = `<div class="vbar"><span class="vn">${esc(name)}</span><button class="vx" type="button">✕ ${esc(ui.exit)}</button></div><div class="vbody"><iframe src="https://drive.google.com/file/d/${id}/preview" allow="autoplay; fullscreen" allowfullscreen title="${esc(name)}"></iframe></div>`; v.querySelector('.vx').onclick = () => closeViewer(); };
      let srcT = null;
      const next = () => { clearTimeout(srcT); if (dead) return; if (si < srcs.length) { vid.src = srcs[si++]; vid.load(); srcT = setTimeout(() => { if (!vid.readyState) next(); }, 12000); const pr = vid.play(); if (pr && pr.catch) pr.catch(() => showCtl(true)); } else fallbackIframe(); };
      vid.addEventListener('error', next);
      const hideCtl = () => { ctl.hidden = true; };
      const showCtl = (keep) => { ctl.hidden = false; clearTimeout(hideT); if (!keep) hideT = setTimeout(() => { if (!vid.paused && !dragging) hideCtl(); }, 3500); };
      const sync = () => { if (dead) return; if (!dragging && vid.duration) slider.value = Math.round((vid.currentTime / vid.duration) * 1000); v.querySelector('.vt').textContent = fmtT(vid.currentTime); v.querySelector('.vd').textContent = fmtT(vid.duration); };
      vid.addEventListener('timeupdate', sync); vid.addEventListener('loadedmetadata', () => { clearTimeout(srcT); sync(); });
      vid.addEventListener('play', () => { pp.textContent = '⏸'; }); vid.addEventListener('pause', () => { pp.textContent = '▶'; if (!dead) showCtl(true); });
      pp.onclick = () => { if (vid.paused) vid.play().catch(() => {}); else vid.pause(); showCtl(vid.paused); };
      slider.addEventListener('input', () => { dragging = true; if (vid.duration) vid.currentTime = (slider.value / 1000) * vid.duration; showCtl(true); });
      slider.addEventListener('change', () => { dragging = false; showCtl(); });
      let lastTap = 0; let lastSide = ''; let tapT = null;
      v.querySelector('.vtap').addEventListener('click', (e) => {
        const r = e.currentTarget.getBoundingClientRect(); const side = (e.clientX - r.left) < r.width / 2 ? 'l' : 'r'; const now = Date.now();
        if (now - lastTap < 300 && side === lastSide) {
          clearTimeout(tapT); lastTap = 0;
          vid.currentTime = Math.max(0, Math.min(vid.duration || 1e9, vid.currentTime + (side === 'r' ? 10 : -10))); showCtl(); return; // يمين = تقديم، يسار = ترجيع
        }
        lastTap = now; lastSide = side;
        clearTimeout(tapT); tapT = setTimeout(() => { if (ctl.hidden) showCtl(); else hideCtl(); }, 260);
      });
      v.querySelector('.vx').onclick = () => closeViewer();
      wireNav(v);
      if (!nav) history.pushState({ viewer: 1 }, '');
      try { if (v.requestFullscreen) v.requestFullscreen().catch(() => {}); } catch (e) { /* */ }
      next();
    };
    const openViewer = (id, cat, name, nav) => {
      closeViewer(true);
      if (!nav) { VIEW.list = [...main.querySelectorAll('a.row[data-id]')].map((a) => ({ id: a.dataset.id, cat: a.dataset.cat, name: a.dataset.name })); VIEW.idx = Math.max(0, VIEW.list.findIndex((x) => x.id === id)); }
      if (cat === 'video') return openVideo(id, name, nav);
      const v = document.createElement('div'); v.id = 'viewer'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true');
      const body = cat === 'image'
        ? `<img alt="${esc(name)}" src="https://drive.google.com/thumbnail?id=${id}&sz=w2400">`
        : `<iframe src="https://drive.google.com/file/d/${id}/preview" allow="autoplay; fullscreen" allowfullscreen title="${esc(name)}"></iframe>`;
      const cnt = VIEW.list.length > 1 ? `<span class="vc" dir="ltr">${VIEW.idx + 1} / ${VIEW.list.length}</span>` : '';
      v.innerHTML = `<div class="vbar"><span class="vn">${cnt}${esc(name)}</span><button class="vx" type="button">✕ ${esc(ui.exit)}</button></div><div class="vbody">${body}${prevBtn('vnav prev', '❮')}${nextBtn('vnav next', '❯')}</div>`;
      document.body.appendChild(v); document.body.style.overflow = 'hidden';
      v.querySelector('.vx').onclick = () => closeViewer();
      wireNav(v);
      let x0 = null; const vb = v.querySelector('.vbody');
      vb.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      vb.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) >= 60) goView((dx < 0) === (ui.dir === 'rtl') ? -1 : 1); }, { passive: true });
      if (!nav) history.pushState({ viewer: 1 }, '');
      try { if (v.requestFullscreen) v.requestFullscreen().catch(() => {}); } catch (e) { /* */ }
    };
    window.addEventListener('popstate', () => closeViewer(true));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeViewer();
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.getElementById('viewer')) goView((e.key === 'ArrowRight') === (ui.dir === 'rtl') ? -1 : 1);
    });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a.row[data-id]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); openViewer(a.dataset.id, a.dataset.cat, a.dataset.name);
    });
    const thumb = (it) => { const m = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(it.href || ''); return m && it.category !== 'link' && it.category !== 'audio' ? `<img class="th" loading="lazy" alt="" src="https://drive.google.com/thumbnail?id=${m[1]}&sz=w240">` : ''; };
    // مرشّح اللغة: الملف بلا لغات يظهر دائماً؛ الرابط قد يحمل مرشّحاً افتراضياً (f=ku,en) يضعه المرسل، ويستطيع العميل تغييره
    const LN = { ar: 'العربية', ku: 'کوردی', en: 'English' };
    const hasLangs = d.groups.some((g) => g.items.some((it) => (it.langs || []).length));
    let FL = (q.get('f') || '').split(',').filter((l) => LN[l]);
    const visC = (it) => !FL.length || !(it.langs || []).length || it.langs.some((l) => FL.indexOf(l) >= 0);
    const chipsHtml = () => (hasLangs ? `<div class="flt" role="group" aria-label="${esc(ui.flang)}"><span class="fl-l">${esc(ui.flang)}</span><button class="chip${FL.length ? '' : ' on'}" type="button" data-l="all" aria-pressed="${!FL.length}">${esc(ui.all)}</button>${Object.keys(LN).map((l) => `<button class="chip${FL.indexOf(l) >= 0 ? ' on' : ''}" type="button" data-l="${l}" aria-pressed="${FL.indexOf(l) >= 0}">${LN[l]}</button>`).join('')}</div>` : '');
    const rowHtml = (it) => (it.category === 'text'
      ? `<div class="row note"><span class="ic">📝</span><span class="nm"><b>${esc(it.name)}</b><br><span class="tx">${esc(it.text)}</span></span></div>`
      : `<a class="row" href="${esc(safeHref(it.href))}" target="_blank" rel="noopener"${driveId(it) ? ` data-id="${esc(driveId(it))}" data-cat="${esc(it.category)}" data-name="${esc(it.name)}"` : ''}><span class="ic">${ICON[it.category] || ICON.other}${thumb(it)}</span><span class="nm">${esc(it.name)}</span><span class="sz">${esc(fmtSize(it.size))}</span></a>`);
    const block = (title, items) => `<section>${title ? `<h2>${esc(title)}</h2>` : ''}${items.map(rowHtml).join('')}</section>`;
    // الأقسام الرئيسية: رابط "معلومات المشروع" يعرض كل قسم معلومات كبطاقة، ورابط المشروع يدمج أقسام المعلومات في بطاقة واحدة
    const buildTops = () => {
      const groups = d.groups.map((g) => ({ key: g.key, items: g.items.filter(visC) })).filter((g) => g.items.length);
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
      return tops;
    };
    const countOf = (tp) => tp.blocks.reduce((n, x) => n + x.items.length, 0);
    const draw = (keepScroll) => {
      const tops = buildTops(); const chips = chipsHtml();
      if (!tops.length) { main.innerHTML = chips + `<p class="msg">${esc(ui.empty)}</p>`; return; }
      const cur = tops.length > 1 ? tops.find((x) => x.id === decodeURIComponent((location.hash.match(/^#s=(.+)$/) || [])[1] || '')) : tops[0];
      if (cur) {
        main.innerHTML = (tops.length > 1 ? `<a class="back" href="#">${esc(ui.back)}</a><h3 class="sh">${esc(cur.label)}</h3>` : '') + chips + cur.blocks.map((x) => block(x.title, x.items)).join('');
      } else {
        main.innerHTML = chips + `<div class="tiles">${tops.map((tp) => `<a class="tile" href="#s=${encodeURIComponent(tp.id)}"><span>${esc(tp.label)}</span><b>${countOf(tp)}</b></a>`).join('')}</div>`;
      }
      if (keepScroll !== true) window.scrollTo(0, 0);
    };
    main.addEventListener('click', (e) => {
      const c = e.target.closest('.chip[data-l]'); if (!c) return;
      const l = c.dataset.l; FL = l === 'all' ? [] : (FL.indexOf(l) >= 0 ? FL.filter((x) => x !== l) : FL.concat(l));
      draw(true);
    });
    window.addEventListener('hashchange', () => draw());
    draw();
  } catch (e) {
    document.getElementById('title').textContent = ui.fail;
    main.innerHTML = `<p class="msg">${esc(e.message || ui.err)}</p>`;
  }
})();
