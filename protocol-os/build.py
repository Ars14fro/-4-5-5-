#!/usr/bin/env python3
"""Build Protocol OS: assemble self-contained index.html + PWA files."""
import base64, json, os, urllib.parse, io
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
ASSETS = os.path.join(ROOT, "assets")

def b64_png(path, size=None, quantize=True):
    im = Image.open(path).convert("RGBA")
    if size:
        im = im.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    if quantize and im.width >= 500:
        # flat icon art quantizes cleanly; keeps data-URI manifest small
        q = im.convert("RGB").quantize(colors=256, method=Image.MEDIANCUT)
        q.save(buf, "PNG", optimize=True)
    else:
        im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

icon192 = b64_png(os.path.join(ASSETS, "icon-192.png"))
icon512 = b64_png(os.path.join(ASSETS, "icon-512.png"))
icon_mask = b64_png(os.path.join(ASSETS, "icon-maskable-512.png"))
touch = b64_png(os.path.join(ASSETS, "apple-touch-icon.png"))

manifest = {
    "name": "Protocol OS — персональный ассистент дисциплины",
    "short_name": "Protocol OS",
    "description": "Личная операционная система дня: таймлайн блоков, привычки 24/7, помодоро, JSON-управление планом.",
    "lang": "ru",
    "start_url": ".",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#000000",
    "theme_color": "#000000",
    "categories": ["productivity", "health", "lifestyle"],
    "icons": [
        {"src": icon192, "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": icon512, "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": icon_mask, "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
manifest_uri = "data:application/manifest+json;charset=utf-8," + urllib.parse.quote(json.dumps(manifest, ensure_ascii=False))

css = open(os.path.join(SRC, "styles.css"), encoding="utf-8").read()
data = open(os.path.join(SRC, "data.js"), encoding="utf-8").read()
app = open(os.path.join(SRC, "app.js"), encoding="utf-8").read()
tpl = open(os.path.join(SRC, "template.html"), encoding="utf-8").read()

html = (tpl.replace("__CSS__", css)
           .replace("__DATA__", data)
           .replace("__APP__", app)
           .replace("__MANIFEST_DATAURI__", manifest_uri)
           .replace("__ICON_DATAURI__", touch))

out = os.path.join(ROOT, "index.html")
open(out, "w", encoding="utf-8").write(html)
print("index.html written:", os.path.getsize(out), "bytes")
