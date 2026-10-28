import subprocess, time, os, urllib.request, json, sys, zlib, struct
from urllib.parse import unquote, quote
from playwright.sync_api import sync_playwright

SP, AP = 4101, 4102
BASE = f'http://127.0.0.1:{SP}/'; API = f'http://127.0.0.1:{AP}'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen(['node', 'test/harness.js', str(SP), str(AP)], cwd=ROOT, stdout=subprocess.PIPE)
srv.stdout.readline()
tmp = '/tmp/claude-0/ui3'; os.makedirs(tmp, exist_ok=True)
open(f'{tmp}/a.pdf', 'wb').write(b'%PDF-1.4 hello'); open(f'{tmp}/tour.mp4', 'wb').write(b'\x00\x00\x00\x18ftypmp42' + b'0' * 200)
open(f'{tmp}/big.bin', 'wb').write(b'0' * (16 * 1024 * 1024))
def png(w, h, rgb):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    def ch(t, d): c = struct.pack('>I', len(d)) + t + d; return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
open(f'{tmp}/cover.png', 'wb').write(png(60, 40, (40, 110, 160)))

MOCK = """(()=>{window.__shared=[];window.__opened=[];window.__mode='ok';
navigator.canShare=(d)=>window.__mode!=='unsupported'&&!!(d&&d.files&&d.files.length);
navigator.share=async(d)=>{window.__shared.push({n:d.files.map(f=>f.name),t:d.files.map(f=>f.type),sz:d.files.map(f=>f.size),text:d.text||null})};
window.open=(u)=>{window.__opened.push(u===undefined?'(none)':u);return null};})()"""
fails = []; errors = []
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra and not cond else ''))
    if not cond: fails.append(name)
def seed(pid, section, name, mb):
    urllib.request.urlopen(f"{API}/__seed?project={quote(pid)}&section={section}&name={quote(name)}&mb={mb}").read()

try:
  with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx(mobile=False, locale='ar', ua=None):
        kw = dict(locale=locale)
        if ua: kw['user_agent'] = ua
        if mobile: return b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, **kw)
        return b.new_context(viewport={'width': 1280, 'height': 800}, **kw)
    def watch(pg, tag):
        pg.on('pageerror', lambda e: errors.append((tag, str(e))))
        pg.on('console', lambda m: errors.append((tag, m.text)) if m.type == 'error' and 'fonts.g' not in m.text and 'ERR_' not in m.text and 'drive.google' not in m.text and 'status of 401' not in m.text and 'status of 403' not in m.text and 'googleapis' not in m.text else None)
    def login(pg, u, pw):
        pg.fill('input[name=username]', u); pg.fill('input[name=password]', pw); pg.click('button[type=submit]')

    # ---------- لغة المتصفح تحدد اللغة الأولى
    c0 = ctx(locale='en-US'); g0 = c0.new_page(); g0.goto(BASE); g0.wait_for_selector('#lf')
    check('browser en-US -> English UI, LTR', g0.evaluate('document.documentElement.dir') == 'ltr' and 'Sign in' in g0.inner_text('#lf') and 'Company Projects' in g0.inner_text('.login h1'))
    g0.screenshot(path=f'{tmp}/00-login-en.png'); c0.close()
    c0 = ctx(locale='ckb-IQ'); g0 = c0.new_page(); g0.goto(BASE); g0.wait_for_selector('#lf')
    check('browser ckb -> Kurdish UI, RTL', g0.evaluate('document.documentElement.dir') == 'rtl' and 'چوونەژوورەوە' in g0.inner_text('#lf') and 'پڕۆژەکانی کۆمپانیا' in g0.inner_text('.login h1'))
    g0.screenshot(path=f'{tmp}/00-login-ku.png'); c0.close()

    c = ctx(); pg = c.new_page(); watch(pg, 'admin'); pg.goto(BASE); pg.wait_for_selector('#lf')
    check('Arabic default', pg.evaluate('document.documentElement.dir') == 'rtl' and 'دخول' in pg.inner_text('#lf'))
    login(pg, 'admin', 'wrong'); pg.wait_for_selector('.err'); check('wrong password (ar)', 'غير صحيحة' in pg.inner_text('.err'))
    pg.click('.login-lang'); pg.click('[data-lang=en]'); pg.wait_for_selector('#lf')
    login(pg, 'admin', 'wrong'); pg.wait_for_selector('.err'); check('server error translated to English', 'Incorrect username or password' in pg.inner_text('.err'), pg.inner_text('.err'))
    pg.click('.login-lang'); pg.click('[data-lang=ku]'); pg.wait_for_selector('#lf')
    login(pg, 'admin', 'wrong'); pg.wait_for_selector('.err'); check('server error translated to Kurdish', 'هەڵەیە' in pg.inner_text('.err'), pg.inner_text('.err'))
    pg.click('.login-lang'); pg.click('[data-lang=ar]'); pg.wait_for_selector('#lf')
    login(pg, 'admin', 'Admin#123'); pg.wait_for_selector('.page-h')
    pg.evaluate("history.replaceState({idx:0},'')")

    # ---------- مشروع + ملفات + نصوص
    pg.click('[data-act=new-project]'); pg.fill('#pn', 'مجمع الأمل السكني'); pg.click('.dlg .btn.pri'); pg.wait_for_selector('.phead')
    pid = pg.evaluate('S.project.id')
    def upload(sel, f):
        with pg.expect_file_chooser() as fc: pg.click(sel)
        fc.value.set_files(f'{tmp}/{f}')
    upload('[data-act=upload][data-sec=cover]', 'cover.png'); pg.wait_for_selector('.phead .cover[style*=thumbnail]')
    upload('.blk[data-sec=info_ar] [data-act=upload]', 'a.pdf'); pg.wait_for_selector('.blk[data-sec=info_ar] .f')
    upload('.blk[data-sec=videos] [data-act=upload]', 'tour.mp4'); pg.wait_for_selector('.blk[data-sec=videos] .f')
    upload('.blk[data-sec=prices] [data-act=upload]', 'big.bin'); time.sleep(1.2)
    check('upload over 15MB rejected (ar)', 'مباشرة في Google Drive' in pg.inner_text('#toasts'))
    pg.click('.blk[data-sec=location] [data-act=add-link]'); pg.fill('#lt', 'الموقع على خرائط Google'); pg.fill('#lu', 'maps.google.com/?q=35.5,45.4'); pg.click('.dlg .btn.pri'); pg.wait_for_selector('.blk[data-sec=location] .f')
    check('add-text button only in info blocks', pg.locator('[data-act=add-note]').count() == 3 and pg.locator('.blk[data-sec=videos] [data-act=add-note]').count() == 0)
    pg.click('.blk[data-sec=info_ku] [data-act=add-note]'); pg.fill('#nt', 'ملاحظة السعر'); pg.fill('#nx', 'السعر يبدأ من 50 ألف دولار\nالتسليم خلال سنة'); pg.click('.dlg .btn.pri'); pg.wait_for_selector('.blk[data-sec=info_ku] .f.note')
    pg.click('.blk[data-sec=info_en] [data-act=add-note]'); pg.fill('#nx', 'Starts from $50k, delivery in 12 months'); pg.click('.dlg .btn.pri'); pg.wait_for_selector('.blk[data-sec=info_en] .f.note')
    check('note rendered with text + send button', 'التسليم خلال سنة' in pg.inner_text('.blk[data-sec=info_ku] .f.note') and pg.locator('.blk[data-sec=info_ku] [data-act=send-note]').count() == 1)
    pg.screenshot(path=f'{tmp}/02-project-desktop.png', full_page=True)

    # ---------- واتساب: لغة الموظف
    pg.evaluate(MOCK)
    g = lambda: pg.evaluate('[window.__shared.splice(0), window.__opened.splice(0)]')
    pg.click('.blk[data-sec=info_ku] [data-act=send-note]'); time.sleep(.4); sh, op = g()
    check('single note sent as plain text only', not sh and op and unquote(op[0].split('text=')[1]) == 'السعر يبدأ من 50 ألف دولار\nالتسليم خلال سنة', op)
    pg.click('[data-act=mode]'); toast = pg.inner_text('.toast'); check('toggle to link mode', 'رابط' in pg.inner_text('[data-act=mode]'))
    pg.click('[data-act=send-project]'); time.sleep(.4); sh, op = g(); txt = unquote(op[0].split('text=')[1])
    check('AR link message: Arabic intro + labels + note text', txt.startswith('مرحباً، هذه تفاصيل مشروع مجمع الأمل السكني:') and '*الفيديوهات*' in txt and 'التسليم خلال سنة' in txt and '*معلومات المشروع — العربية*' in txt, txt[:200])
    pg.click('.blk[data-sec=info_en] [data-act=send-section]'); time.sleep(.3); sh, op = g(); txt = unquote(op[0].split('text=')[1]); check('section message includes note text', 'Starts from $50k' in txt)
    pg.click('[data-act=lang]'); pg.click('[data-lang=en]'); pg.wait_for_selector('.phead'); time.sleep(.3)
    check('English UI: LTR + labels', pg.evaluate('document.documentElement.dir') == 'ltr' and 'Videos' in pg.inner_text('#view') and 'Send section' in pg.inner_text('#view') and 'Project information' in pg.inner_text('#view'))
    pg.screenshot(path=f'{tmp}/03-project-en.png', full_page=True)
    pg.evaluate(MOCK); pg.click('[data-act=send-project]'); time.sleep(.4); sh, op = g(); txt = unquote(op[0].split('text=')[1])
    check('EN link message in English', txt.startswith('Hello, here are the details of مجمع الأمل السكني:') and '*Videos*' in txt and '*Project information — English*' in txt, txt[:160])
    check('EN share page links carry l=en', 'l=en' in pg.evaluate('S.project.shareUrl'))
    pg.click('[data-act=lang]'); pg.click('[data-lang=ku]'); pg.wait_for_selector('.phead'); time.sleep(.3)
    check('Kurdish UI: RTL + labels', pg.evaluate('document.documentElement.dir') == 'rtl' and 'ڤیدیۆکان' in pg.inner_text('#view') and 'ناردنی بەش' in pg.inner_text('#view'))
    pg.screenshot(path=f'{tmp}/04-project-ku.png', full_page=True)
    pg.evaluate(MOCK); pg.click('[data-act=send-project]'); time.sleep(.4); sh, op = g(); txt = unquote(op[0].split('text=')[1])
    check('KU link message in Kurdish', txt.startswith('سڵاو، وردەکارییەکانی پڕۆژەی مجمع الأمل السكني:') and '*ڤیدیۆکان*' in txt, txt[:160])
    check('language persisted', pg.evaluate("localStorage.getItem('lang')") == 'ku')
    pg.reload(); pg.wait_for_selector('.phead'); check('language survives reload', pg.evaluate('document.documentElement.lang') == 'ku')
    pg.click('[data-act=lang]'); pg.click('[data-lang=ar]'); pg.wait_for_selector('.phead'); pg.evaluate(MOCK)
    pg.click('[data-act=mode]'); check('back to file mode', 'ملف' in pg.inner_text('[data-act=mode]'))

    # ---------- مشاركة الملفات: مباشرة + كبيرة
    pg.click('.blk[data-sec=info_ar] [data-act=send-file]'); time.sleep(1.2); sh, op = g()
    check('small file shared via Drive API key', len(sh) == 1 and sh[0]['n'] == ['a.pdf'] and sh[0]['sz'] == [14], sh)
    seed(pid, 'prices', 'big35.bin', 35); seed(pid, 'prices', 'huge101.bin', 101)
    pg.click('[data-act=refresh]'); pg.wait_for_selector('.blk[data-sec=prices] .f'); time.sleep(.5)
    requests_seen = []
    def handle(route):
        requests_seen.append(route.request.url); n = 35 * 1048576
        route.fulfill(status=200, headers={'access-control-allow-origin': '*', 'content-type': 'application/octet-stream', 'content-length': str(n)}, body=b'\x01' * n)
    c.route('https://www.googleapis.com/drive/v3/files/**', handle)
    pg.evaluate(MOCK)
    pg.locator('.blk[data-sec=prices] .f', has_text='big35.bin').locator('[data-act=send-file]').click(); time.sleep(4); sh, op = g()
    check('35MB file shared directly (limit raised)', len(sh) == 1 and sh[0]['sz'] == [35 * 1048576] and sh[0]['n'] == ['big35.bin'], (sh, op))
    check('direct download used the API key', requests_seen and 'key=TESTKEY' in requests_seen[0] and 'alt=media' in requests_seen[0], requests_seen)
    pg.locator('.blk[data-sec=prices] .f', has_text='huge101.bin').locator('[data-act=send-file]').click(); time.sleep(.8); sh, op = g()
    check('101MB file falls back to link', not sh and op and 'wa.me' in op[0] and 'drive.google.com/file/d/' in unquote(op[0]), (sh, op))
    check('fallback explains why (limit 100 MB)', '100' in pg.inner_text('#toasts'), pg.inner_text('#toasts'))
    c.unroute('https://www.googleapis.com/drive/v3/files/**')
    # فشل التنزيل المباشر ثم الملف صغير → مسار Apps Script الاحتياطي
    c.route('https://www.googleapis.com/drive/v3/files/**', lambda r: r.fulfill(status=403, headers={'access-control-allow-origin': '*'}, body='no'))
    pg.evaluate(MOCK); pg.click('.blk[data-sec=info_ar] [data-act=send-file]'); time.sleep(1.5); sh, op = g()
    check('API key failure -> falls back to Apps Script for small file', len(sh) == 1 and sh[0]['sz'] == [14], (sh, op))
    c.unroute('https://www.googleapis.com/drive/v3/files/**')

    # ---------- زر الرجوع والنوافذ
    pg.goto(BASE + '#/'); pg.wait_for_selector('.grid'); pg.evaluate("history.replaceState({idx:0},'')"); pg.evaluate('S.idx=0')
    pg.click('.pcard h2 a'); pg.wait_for_selector('.phead'); check('project page via history push', pg.evaluate('S.idx') == 1)
    pg.click('.blk[data-sec=info_ar] [data-act=add-link]'); pg.wait_for_selector('.dlg')
    pg.go_back(); time.sleep(.4)
    check('Back closes the modal and stays on the project', pg.locator('.dlg').count() == 0 and pg.locator('.phead').count() == 1 and '#/p/' in pg.url)
    pg.click('.blk[data-sec=videos] .fn'); pg.wait_for_selector('.viewer'); pg.go_back(); time.sleep(.3)
    check('Back closes the video viewer', pg.locator('.viewer').count() == 0 and pg.locator('.phead').count() == 1)
    pg.click('.blk[data-sec=info_ar] [data-act=add-link]'); pg.wait_for_selector('.dlg'); pg.keyboard.press('Escape'); time.sleep(.4)
    pg.go_back(); pg.wait_for_selector('.grid'); check('Esc closes modal cleanly, then Back goes to the list (no ghost entry)', pg.locator('.grid').count() == 1 and pg.url.endswith('#/'), pg.url)
    pg.click('[data-act=new-project]'); pg.fill('#pn', 'مشروع ثان'); pg.click('.dlg .btn.pri'); pg.wait_for_selector('.phead')
    pg.go_back(); time.sleep(.8); pg.wait_for_selector('.grid')
    check('after create-project (modal+navigate) one Back returns to the list', pg.locator('.grid').count() == 1 and pg.locator('.dlg').count() == 0 and pg.url.endswith('#/'), pg.url)
    pg.click('.pcard h2 a'); pg.wait_for_selector('.phead'); pg.click('.crumb'); pg.wait_for_selector('.grid'); check('in-app Back button (crumb) returns to the list', pg.url.endswith('#/'))
    pg.goto(BASE + '#/p/' + quote(pid)); pg.wait_for_selector('.phead'); pg.evaluate("history.replaceState({idx:0},'')"); pg.evaluate('S.idx=0'); pg.click('.crumb'); pg.wait_for_selector('.grid'); check('crumb on deep link navigates home', pg.url.endswith('#/'))
    pg.click('a[href="#/admin"]'); pg.wait_for_selector('#nu'); pg.go_back(); pg.wait_for_selector('.grid'); check('Back from admin to list', True)

    # ---------- إعدادات بلغات
    pg.goto(BASE + '#/admin/settings'); pg.wait_for_selector('#save-set')
    pg.click('[data-sl=en]'); pg.wait_for_selector('#s-name'); pg.fill('#s-name', 'Al Noor Real Estate'); pg.fill('[data-lab=videos]', 'Video tours'); pg.click('#save-set'); pg.wait_for_selector('#save-set'); time.sleep(.4)
    check('English site name saved', pg.evaluate("S.cfg.texts.en.siteName") == 'Al Noor Real Estate' and pg.evaluate("S.cfg.texts.ar.siteName") == 'مشاريع الشركة')
    pg.click('[data-sl=ar]'); pg.wait_for_selector('#s-name'); pg.fill('#s-name', 'شركة النور العقارية'); pg.fill('#s-in', 'أهلاً بك، مشروع {project}:'); pg.click('#save-set'); pg.wait_for_selector('.brand b >> text=شركة النور'); check('Arabic site name applied in header', True)
    pg.screenshot(path=f'{tmp}/06-admin-settings.png', full_page=True)
    pg.goto(BASE + '#/admin/users'); pg.wait_for_selector('#nu')
    pg.fill('#nu [name=name]', 'سارة أحمد'); pg.fill('#nu [name=username]', 'sara'); pg.fill('#nu [name=password]', 'secret1'); pg.click('#nu button[type=submit]'); pg.wait_for_selector('.urow >> text=سارة')
    pg.goto(BASE + '#/'); pg.wait_for_selector('.pcard'); pg.click('.pcard h2 a'); pg.wait_for_selector('.phead')
    share_href = pg.evaluate("S.project.shareUrl"); sec_href = pg.evaluate("S.project.sectionShareUrls.info")
    c.close()

    # ---------- صفحة العميل بثلاث لغات
    c2 = ctx(True); cl = c2.new_page(); watch(cl, 'client')
    for lg, word, notew, dr in (('ar', 'الفيديوهات', 'التسليم خلال سنة', 'rtl'), ('en', 'Video tours', 'Starts from $50k', 'ltr'), ('ku', 'ڤیدیۆکان', 'التسليم خلال سنة', 'rtl')):
        cl.goto(share_href.replace('&l=ar', '').replace('&l=en', '').replace('&l=ku', '') + '&l=' + lg); cl.wait_for_selector('.row'); body = cl.inner_text('main')
        check(f'client page [{lg}] labels + dir + text note', word in body and notew in body and cl.evaluate('document.documentElement.dir') == dr, body[:150])
    cl.goto(sec_href.replace('&l=ar', '&l=en')); cl.wait_for_selector('.row'); check('info group page (en) lists 3 info blocks', cl.locator('section').count() == 3 and 'Project information — ' in cl.inner_text('main'), cl.inner_text('main')[:200])
    cl.screenshot(path=f'{tmp}/09-client-share.png', full_page=True)
    cl.goto(BASE + 'share.html?t=bad&l=en'); cl.wait_for_selector('.msg'); check('forged token message in English', 'invalid' in cl.inner_text('main').lower())
    c2.close()

    # ---------- موظف مبيعات على الهاتف + تثبيت التطبيق
    for lg in ('ku', 'en', 'ar'):
        c3 = ctx(True, locale={'ku': 'ckb-IQ', 'en': 'en-US', 'ar': 'ar'}[lg]); m = c3.new_page(); watch(m, 'mobile-' + lg)
        m.goto(BASE); login(m, 'sara', 'secret1'); m.wait_for_selector('.grid')
        check(f'[{lg}] sales: no admin controls', m.locator('[data-act=new-project]').count() == 0 and m.locator('a[href="#/admin"]').count() == 0)
        m.click('.pcard h2 a'); m.wait_for_selector('.phead')
        check(f'[{lg}] sales: no add-text/upload', m.locator('[data-act=add-note]').count() == 0 and m.locator('[data-act=upload]').count() == 0)
        check(f'[{lg}] no horizontal overflow at 390px', m.evaluate('document.documentElement.scrollWidth') <= 390, m.evaluate('document.documentElement.scrollWidth'))
        m.screenshot(path=f'{tmp}/08-mobile-{lg}.png', full_page=True)
        c3.close()

    c4 = ctx(True); ip = c4.new_page(); watch(ip, 'install')
    ip.add_init_script("window.__prompted=0")
    ip.goto(BASE); ip.wait_for_selector('#lf'); time.sleep(.3)
    check('install button hidden when not installable (desktop-like, no event)', ip.evaluate("document.getElementById('install').hidden") is True)
    ip.evaluate("""()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.__prompted++};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e)}""")
    ip.wait_for_function("!document.getElementById('install').hidden"); check('install FAB appears on beforeinstallprompt', 'تثبيت' in ip.inner_text('#install'))
    ip.screenshot(path=f'{tmp}/10-install-fab.png')
    ip.click('#install .go'); time.sleep(.3); check('FAB triggers native install prompt', ip.evaluate('window.__prompted') == 1)
    check('FAB hidden after prompt consumed', ip.evaluate("document.getElementById('install').hidden") is True)
    ip.evaluate("()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{};e.userChoice=Promise.resolve({});window.dispatchEvent(e)}")
    ip.wait_for_function("!document.getElementById('install').hidden"); ip.click('#install .x'); time.sleep(.2)
    check('dismiss hides FAB for a week', ip.evaluate("document.getElementById('install').hidden") is True and int(ip.evaluate("localStorage.getItem('installHideUntil')")) > time.time() * 1000)
    # بعد التثبيت: لا يظهر
    ip.evaluate("localStorage.removeItem('installHideUntil')")
    reg = ip.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r)"); check('service worker registered', reg is True)
    mf = json.load(urllib.request.urlopen(BASE + 'manifest.webmanifest')); icons = [i['src'] for i in mf['icons']]
    check('manifest icons exist (192/512/maskable)', all(urllib.request.urlopen(BASE + s).status == 200 for s in icons) and any('maskable' in i['purpose'] for i in mf['icons']) and mf['display'] == 'standalone')
    c4.close()
    c5 = ctx(True, ua='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    io = c5.new_page(); io.goto(BASE); io.wait_for_selector('#lf'); time.sleep(.3)
    check('iOS: install FAB visible without native prompt', io.evaluate("!document.getElementById('install').hidden"))
    io.click('#install .go'); io.wait_for_selector('.dlg'); check('iOS: shows Add to Home Screen instructions', 'الشاشة الرئيسية' in io.inner_text('.dlg'))
    io.go_back(); time.sleep(.3); check('iOS instructions dialog closes with Back', io.locator('.dlg').count() == 0)
    c5.close()
    # حساب موقوف
    c6 = ctx(); a = c6.new_page(); a.goto(BASE); login(a, 'admin', 'Admin#123'); a.wait_for_selector('.grid')
    a.goto(BASE + '#/admin/users'); a.wait_for_selector('.urow'); a.locator('.urow', has_text='سارة').locator('[data-uact=toggle]').click(); a.wait_for_selector('.badge.off'); c6.close()
    c7 = ctx(True); s2 = c7.new_page(); s2.goto(BASE); login(s2, 'sara', 'secret1'); s2.wait_for_selector('.err'); check('suspended account cannot log in', 'موقوف' in s2.inner_text('.err')); c7.close()
    b.close()
  st = json.load(urllib.request.urlopen(API + '/__stats'))
  check('no CORS preflight (OPTIONS) was ever sent', st['options'] == 0, st)
  print('requests to backend:', st['posts'])
finally:
  srv.terminate()
print('JS errors:', errors)
print('FAILED:' if fails else 'ALL PASSED', fails)
sys.exit(1 if fails else 0)
