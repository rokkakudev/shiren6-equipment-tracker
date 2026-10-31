"""Serve a disposable copy on a random local port, isolating browser storage."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from functools import partial
import shutil

root = Path(__file__).resolve().parent.parent
with TemporaryDirectory(prefix='shiren6-security-test-') as temp:
    for name in ('index.html', 'app.js', 'styles.css', 'icon.svg'):
        shutil.copy(root / name, temp)
    shutil.copy(root / 'tests' / 'restore.html', Path(temp) / 'test.html')
    for name in ('startup-seed.js', 'startup-check.js'):
        shutil.copy(root / 'tests' / name, temp)
    html = (root / 'index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head><script src="startup-seed.js"></script>', 1)
    html = html.replace('</body>', '<script src="startup-check.js"></script></body>', 1)
    (Path(temp) / 'startup.html').write_text(html, encoding='utf-8')
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=temp))
    print(f'Open http://127.0.0.1:{server.server_port}/test.html (Ctrl+C to stop)', flush=True)
    server.serve_forever()
