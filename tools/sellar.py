#!/usr/bin/env python3
"""Pone a cada CSS/JS de index.html una marca de versión (?v=huella del archivo).
Así, cuando algo cambia, el navegador descarga el archivo nuevo en vez de usar el
que tenía guardado. Ejecutar antes de cada subida: python3 tools/sellar.py"""
import hashlib, os, re
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ruta = os.path.join(RAIZ, 'index.html')
html = open(ruta, encoding='utf-8').read()

def sello(m):
    attr, archivo = m.group(1), m.group(2)
    local = os.path.join(RAIZ, archivo)
    if not os.path.isfile(local):
        return m.group(0)
    h = hashlib.sha1(open(local, 'rb').read()).hexdigest()[:8]
    return f'{attr}="{archivo}?v={h}"'

nuevo = re.sub(r'(src|href)="((?:assets|moral|s[1-4])/[^"?]+\.(?:js|css|png))(?:\?v=[0-9a-f]+)?"', sello, html)
open(ruta, 'w', encoding='utf-8').write(nuevo)
print('sellado', len(re.findall(r'\?v=', nuevo)), 'archivos')
