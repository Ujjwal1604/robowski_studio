#!/usr/bin/env python3
"""Build the page and run the engine suite in headless Chromium.  Usage: python3 tests/run.py  (from robowski-src/)"""
import subprocess, sys, pathlib, tempfile
from playwright.sync_api import sync_playwright
here = pathlib.Path(__file__).resolve().parent; root = here.parent
out = pathlib.Path(tempfile.mkdtemp()) / 'robowski.html'
subprocess.run([sys.executable, str(root / 'build.py'), str(out)], check=True, stdout=subprocess.DEVNULL)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(out.as_uri()); pg.wait_for_timeout(500)
    res = pg.evaluate((here / 'suite.js').read_text()); b.close()
bad = [r for r in res if not r['ok']]
for r in res: print(('PASS ' if r['ok'] else 'FAIL ') + r['name'] + ('' if r['ok'] else '\n     -> ' + r['msg']))
print(f"\n{len(res) - len(bad)}/{len(res)} passed" + (f", page errors: {errs}" if errs else ''))
sys.exit(1 if bad or errs else 0)
