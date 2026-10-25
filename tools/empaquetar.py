#!/usr/bin/env python3
"""Empaqueta las plantillas .docx de cada carpeta (s1, s2, s3, s4) en un .js.

Hace falta porque al abrir index.html con doble clic (file://) el navegador no deja
leer otros archivos de la carpeta; en cambio sí carga <script>. Así funciona sin servidor.

Uso: python3 tools/empaquetar.py
"""
import base64, os, json

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

for seccion in ('s1', 's2', 's3', 's4'):
    carpeta = os.path.join(RAIZ, seccion, 'plantillas')
    datos = {}
    if os.path.isdir(carpeta):
        for nombre in sorted(os.listdir(carpeta)):
            if nombre.lower().endswith('.docx') and not nombre.startswith('~$'):
                with open(os.path.join(carpeta, nombre), 'rb') as f:
                    datos[nombre[:-5]] = base64.b64encode(f.read()).decode('ascii')
    salida = os.path.join(RAIZ, seccion, 'plantillas.js')
    with open(salida, 'w', encoding='utf-8') as f:
        f.write('/* Generado por tools/empaquetar.py — no editar a mano. */\n')
        f.write('window.PLANTILLAS = Object.assign(window.PLANTILLAS || {}, ')
        f.write(json.dumps(datos, indent=0))
        f.write(');\n')
    print(f'{seccion}: {len(datos)} plantillas -> {os.path.relpath(salida, RAIZ)}')
