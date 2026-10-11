# README 用のスクリーンショットを撮り直す（docs/screenshots/ に保存）
#   pip install playwright && python -m playwright install chromium
#   npm pack @fontsource/biz-udpgothic @fontsource/ibm-plex-mono  → 展開したフォルダを FONT_DIR に置く
#   python -m http.server 8765   （リポジトリのルートで起動しておく）
#   python tools/screenshots.py [FONT_DIR]
# 画面と同じ字体（BIZ UDPGothic・IBM Plex Mono）で撮るため、Google Fonts への要求を手元のフォントで返す
import sys, re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'screenshots'
FONT_DIR = Path(sys.argv[1] if len(sys.argv) > 1 else 'fonts')
URL = 'http://localhost:8765/index.html'

def font_css():
    css = ''
    for pkg, files in [('biz-udpgothic', ['400.css', '700.css']), ('ibm-plex-mono', ['500.css'])]:
        base = next(FONT_DIR.glob(f'fontsource-{pkg}-*/package'))
        for f in files:
            css += re.sub(r'url\(\./files/([^)]+)\)', lambda m: f'url(https://fonts.local/{pkg}/{m.group(1)})', (base / f).read_text(encoding='utf-8'))
    return css

def route_fonts(page):
    css = font_css()
    page.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=css))
    def serve(r):
        pkg, name = r.request.url.split('https://fonts.local/')[1].split('/', 1)
        path = next(FONT_DIR.glob(f'fontsource-{pkg}-*/package/files')) / name
        r.fulfill(status=200, content_type='font/woff2' if name.endswith('woff2') else 'font/woff', body=path.read_bytes())
    page.route('https://fonts.local/**', serve)

def open_page(b, **ctx):
    pg = b.new_context(service_workers='block', **ctx).new_page()
    route_fonts(pg)
    pg.goto(URL); pg.wait_for_load_state('networkidle')
    ok = pg.evaluate("""async () => { await document.fonts.ready;
        return [document.fonts.check("15px 'BIZ UDPGothic'", "三角形"), document.fonts.check("15px 'IBM Plex Mono'", "120")]; }""")
    assert all(ok), f'フォント未読込: {ok}'
    # 字体が読み込まれる前に描いた図を描き直す
    pg.click('#g-example'); pg.wait_for_timeout(300)
    return pg

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = open_page(b, viewport={'width': 1100, 'height': 900}, color_scheme='light')
    pg.click('#g-example'); pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT / 'general.png'), full_page=False)
    pg.click('nav.tabs button[data-tab="right"]'); pg.click('#r-example'); pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT / 'right.png'), full_page=False)
    pg.click('nav.tabs button[data-tab="coord"]'); pg.click('#c-example'); pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT / 'coord.png'), full_page=False)
    m = open_page(b, viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='dark')
    m.click('#g-example'); m.wait_for_timeout(300)
    m.evaluate("window.scrollTo(0, document.getElementById('g-fig').getBoundingClientRect().top + scrollY - document.querySelector('header.top').offsetHeight - 12)")
    m.wait_for_timeout(300)
    m.screenshot(path=str(OUT / 'mobile.png'))
    b.close()
print('docs/screenshots/ に保存しました')
