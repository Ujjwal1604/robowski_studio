#!/usr/bin/env python3
"""Assemble the single-file Robowski Studio page from the parts in this folder.
Usage: python3 build.py [output.html]   (default: robowski-studio.html next to this script)
The page stays ONE html file on purpose: artifacts and a plain double-click both load it with no server."""
import os, sys, glob
here = os.path.dirname(os.path.abspath(__file__))
def parts(d, ext): return ''.join(open(p).read() for p in sorted(glob.glob(os.path.join(here, d, '*' + ext))))
t = open(os.path.join(here, 'index.template.html')).read()
out = t.replace('{{style}}', parts('style', '.css')).replace('{{engine}}', parts('engine', '.js')).replace('{{app}}', parts('app', '.js'))
dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'robowski-studio.html')
open(dst, 'w').write(out); print('wrote', dst, len(out), 'bytes')
