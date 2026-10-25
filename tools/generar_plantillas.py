#!/usr/bin/env python3
"""Genera las plantillas Word limpias de S1 con campos {asi}.

Reglas para que salgan igual en pantalla, en Word y al imprimir:
- A4, margenes de 2 cm o mas (las impresoras no imprimen el borde).
- Solo Arial (en el PDF se usa Helvetica, que mide exactamente lo mismo).
- Nada flotante: ni cuadros de texto ni imagenes ancladas; las cabeceras son tablas.
- El destinatario va en el pie de pagina, no empujado con lineas en blanco.
- Las filas de tablas tienen altura fija y los saltos de pagina son explicitos.

Uso: python3 tools/generar_plantillas.py  (escribe en s1/plantillas/)
"""
import os, sys
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT, WD_ROW_HEIGHT_RULE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, 's1', 'plantillas')
ESCUDO = os.path.join(RAIZ, 'assets', 'img', 'escudo.jpg')
FUENTE = 'Arial'

J, C, L, R = (WD_ALIGN_PARAGRAPH.JUSTIFY, WD_ALIGN_PARAGRAPH.CENTER,
              WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT)


# ---------------------------------------------------------------- utilidades
def documento(arriba=2.0, abajo=2.0, izq=2.5, der=2.0, pie=1.2):
    d = Document()
    s = d.sections[0]
    s.page_width, s.page_height = Cm(21.0), Cm(29.7)
    s.orientation = WD_ORIENT.PORTRAIT
    s.top_margin, s.bottom_margin = Cm(arriba), Cm(abajo)
    s.left_margin, s.right_margin = Cm(izq), Cm(der)
    s.header_distance, s.footer_distance = Cm(1.0), Cm(pie)
    st = d.styles['Normal']
    st.font.name = FUENTE
    st.font.size = Pt(11)
    rpr = st.element.get_or_add_rPr()
    rf = rpr.find(qn('w:rFonts'))
    if rf is None:
        rf = OxmlElement('w:rFonts'); rpr.append(rf)
    for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        rf.set(qn(a), FUENTE)
    pf = st.paragraph_format
    pf.space_before, pf.space_after, pf.line_spacing = Pt(0), Pt(0), 1.0
    # idioma espanol para el corrector de Word
    lang = OxmlElement('w:lang'); lang.set(qn('w:val'), 'es-ES'); rpr.append(lang)
    # Fuente por defecto del documento = Arial en TODAS partes (sin fuentes del tema:
    # si no, Word/visores usan Cambria o Calibri y el texto cambia de anchura).
    for rfs in d.styles.element.iter(qn('w:rFonts')):
        for a in list(rfs.attrib):
            if a.endswith('Theme'):
                del rfs.attrib[a]
        for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
            rfs.set(qn(a), FUENTE)
    # quitar el parrafo vacio inicial que crea python-docx
    for p in list(d.paragraphs):
        p._element.getparent().remove(p._element)
    return d


def ancho_util(d):
    s = d.sections[0]
    return s.page_width - s.left_margin - s.right_margin


def runs(p, partes, tam=None):
    """partes: str o lista de (texto, 'biu^') ; ^ = superindice."""
    if isinstance(partes, str):
        partes = [(partes, '')]
    for item in partes:
        texto, fmt = (item, '') if isinstance(item, str) else item
        # los saltos de linea dentro del texto se convierten en <w:br/>
        trozos = texto.split('\n')
        for i, t in enumerate(trozos):
            r = p.add_run(t)
            r.bold = 'b' in fmt or None
            r.italic = 'i' in fmt or None
            r.underline = 'u' in fmt or None
            if '^' in fmt:
                r.font.superscript = True
            if tam:
                r.font.size = Pt(tam)
            if i < len(trozos) - 1:
                r.add_break()
    return p


def interlineado_exacto(p, tam, mult):
    """Interlineado en puntos exactos (Arial: 1 linea = 1,15 x cuerpo). Asi Word, el visor
    y el PDF ponen cada linea en el mismo sitio, sin depender de la impresora."""
    pPr = p._p.get_or_add_pPr()
    sp = pPr.find(qn('w:spacing'))
    if sp is None:
        sp = OxmlElement('w:spacing'); pPr.append(sp)
    pts = round((tam or 11) * 1.15 * mult * 2) / 2
    sp.set(qn('w:line'), str(int(pts * 20))); sp.set(qn('w:lineRule'), 'exact')


def parrafo(destino, partes='', al=L, antes=0, despues=0, interlineado=1.0,
            tam=None, sangria=0, primera=0, colgante=0, tabs=None, seguir=False,
            juntas=False):
    p = destino.add_paragraph()
    f = p.paragraph_format
    p.alignment = al
    f.space_before, f.space_after = Pt(antes), Pt(despues)
    if sangria:
        f.left_indent = Cm(sangria)
    if primera:
        f.first_line_indent = Cm(primera)
    if colgante:
        f.left_indent = Cm(sangria + colgante)
        f.first_line_indent = Cm(-colgante)
    if seguir:
        f.keep_with_next = True
    if juntas:
        f.keep_together = True
    for pos, tipo in (tabs or []):
        f.tab_stops.add_tab_stop(pos, tipo)
    runs(p, partes, tam)
    interlineado_exacto(p, tam, interlineado)
    return p


def borde_celda(celda, lados='tblr', grosor=4, color='000000', valor='single'):
    tcPr = celda._tc.get_or_add_tcPr()
    b = tcPr.find(qn('w:tcBorders'))
    if b is None:
        b = OxmlElement('w:tcBorders'); tcPr.append(b)
    for lado, nombre in (('t', 'top'), ('l', 'left'), ('b', 'bottom'), ('r', 'right')):
        e = b.find(qn('w:' + nombre))
        if e is None:
            e = OxmlElement('w:' + nombre); b.append(e)
        if lado in lados:
            e.set(qn('w:val'), valor); e.set(qn('w:sz'), str(grosor))
            e.set(qn('w:space'), '0'); e.set(qn('w:color'), color)
        else:
            e.set(qn('w:val'), 'nil')


def sombrear(celda, color):
    tcPr = celda._tc.get_or_add_tcPr()
    sh = OxmlElement('w:shd')
    sh.set(qn('w:val'), 'clear'); sh.set(qn('w:color'), 'auto'); sh.set(qn('w:fill'), color)
    tcPr.append(sh)


def margen_celdas(tabla, izq=0.12, der=0.12, arr=0.0, aba=0.0):
    tblPr = tabla._tbl.tblPr
    for viejo in tblPr.findall(qn('w:tblCellMar')):
        tblPr.remove(viejo)
    m = OxmlElement('w:tblCellMar')
    for nombre, v in (('top', arr), ('left', izq), ('bottom', aba), ('right', der)):
        e = OxmlElement('w:' + nombre)
        e.set(qn('w:w'), str(int(v * 567))); e.set(qn('w:type'), 'dxa')
        m.append(e)
    tblPr.append(m)


def tabla(destino, filas, anchos_cm, bordes=True, alto=None, regla='atLeast',
          grosor=4, centrada=False):
    try:
        t = destino.add_table(rows=filas, cols=len(anchos_cm))
    except TypeError:  # cabeceras y pies exigen ancho
        t = destino.add_table(filas, len(anchos_cm), Cm(sum(anchos_cm)))
    t.autofit = False
    t.alignment = WD_TABLE_ALIGNMENT.CENTER if centrada else WD_TABLE_ALIGNMENT.LEFT
    # ancho fijo: el diseno no depende del contenido (clave para imprimir igual)
    tblPr = t._tbl.tblPr
    lay = OxmlElement('w:tblLayout'); lay.set(qn('w:type'), 'fixed'); tblPr.append(lay)
    w = OxmlElement('w:tblW'); w.set(qn('w:w'), str(int(sum(anchos_cm) * 567))); w.set(qn('w:type'), 'dxa')
    for e in tblPr.findall(qn('w:tblW')):
        tblPr.remove(e)
    tblPr.append(w)
    margen_celdas(t)
    grid = t._tbl.tblGrid
    for i, gc in enumerate(grid.findall(qn('w:gridCol'))):
        gc.set(qn('w:w'), str(int(anchos_cm[i] * 567)))
    for fila in t.rows:
        if alto:
            fila.height = Cm(alto)
            fila.height_rule = WD_ROW_HEIGHT_RULE.EXACTLY if regla == 'exact' else WD_ROW_HEIGHT_RULE.AT_LEAST
        no_partir(fila)
        for i, c in enumerate(fila.cells):
            c.width = Cm(anchos_cm[i])
            c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            borde_celda(c, 'tblr' if bordes else '', grosor)
            for p in c.paragraphs:
                p.paragraph_format.space_after = Pt(0)
    return t


def no_partir(fila):
    trPr = fila._tr.get_or_add_trPr()
    e = OxmlElement('w:cantSplit'); trPr.append(e)


def cabecera_tabla(fila):
    trPr = fila._tr.get_or_add_trPr()
    e = OxmlElement('w:tblHeader'); trPr.append(e)


def texto_celda(celda, partes, al=C, tam=None, interlineado=1.0):
    p = celda.paragraphs[0]
    p.alignment = al
    runs(p, partes, tam)
    interlineado_exacto(p, tam, interlineado)
    return p


def salto_pagina(d):
    p = d.add_paragraph()
    p.add_run().add_break(WD_BREAK.PAGE)


def espacio(d, puntos):
    """Hueco vertical exacto (en vez de muchas lineas en blanco)."""
    p = d.add_paragraph()
    f = p.paragraph_format
    f.space_before = Pt(0); f.space_after = Pt(0)
    f.line_spacing_rule = None
    pPr = p._p.get_or_add_pPr()
    sp = pPr.find(qn('w:spacing'))
    if sp is None:
        sp = OxmlElement('w:spacing'); pPr.append(sp)
    sp.set(qn('w:line'), str(int(puntos * 20))); sp.set(qn('w:lineRule'), 'exact')
    sp.set(qn('w:before'), '0'); sp.set(qn('w:after'), '0')
    return p


def pie_destinatario(d, izquierda, derecha, negrita=False, subrayar_derecha=False, tam=10):
    """Destinatario abajo: tabla de 2 columnas sin bordes (un tabulador a la derecha
    no se respeta en todos los visores; una tabla sí)."""
    s = d.sections[0]
    pie = s.footer
    pie.is_linked_to_previous = False
    total = s.page_width.cm - s.left_margin.cm - s.right_margin.cm
    t = tabla(pie, 1, [total - 3.5, 3.5], bordes=False)
    margen_celdas(t, 0, 0)
    b = 'b' if negrita else ''
    texto_celda(t.cell(0, 0), [(izquierda, b)], al=L, tam=tam)
    texto_celda(t.cell(0, 1), [(derecha, b + ('u' if subrayar_derecha else ''))], al=R, tam=tam)
    # el pie trae un parrafo vacio delante: se quita; Word exige uno tras la tabla, minimo
    primero = pie.paragraphs[0]
    primero._element.getparent().remove(primero._element)
    espacio(pie, 1)


def cabecera_ministerio(d, caja, bajo_caja=None):
    """Escudo + MINISTERIO DE DEFENSA a la izquierda; recuadro gris a la derecha."""
    au = ancho_util(d) / 567 / 20 * 20  # en twips -> cm aproximado
    total = d.sections[0].page_width.cm - d.sections[0].left_margin.cm - d.sections[0].right_margin.cm
    anchos = [1.5, 4.6, total - 1.5 - 4.6 - 5.4, 5.4]
    filas = 2 if bajo_caja else 1
    t = tabla(d, filas, anchos, bordes=False)
    margen_celdas(t, 0.05, 0.05)
    esc = t.cell(0, 0)
    if filas == 2:
        esc = t.cell(0, 0).merge(t.cell(1, 0))
        t.cell(0, 1).merge(t.cell(1, 1))
    esc.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
    pe = esc.paragraphs[0]; pe.alignment = L
    pe.add_run().add_picture(ESCUDO, width=Cm(1.35))
    m = t.cell(0, 1)
    m.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    texto_celda(m, [('MINISTERIO\nDE DEFENSA', 'b')], al=L, tam=9.5)
    cj = t.cell(0, 3)
    cj.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    borde_celda(cj, 'tblr', 6)
    sombrear(cj, 'D9D9D9')
    texto_celda(cj, '\n'.join(caja), al=C, tam=7.5)
    t.rows[0].height = Cm(1.05); t.rows[0].height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST
    if bajo_caja:
        sub = t.cell(1, 3)
        sub.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
        p = texto_celda(sub, '\n'.join(bajo_caja), al=C, tam=7)
        p.paragraph_format.space_before = Pt(5)
    return t


# Orden de los elementos que exige Word (esquema OOXML). Si no se respeta, Word puede
# decir que el archivo tiene "contenido ilegible" aunque LibreOffice lo abra bien.
ORDEN = {
    'pPr': 'pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs '
           'suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd '
           'snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment '
           'textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange',
    'rPr': 'rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof snapToGrid '
           'vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd fitText vertAlign rtl cs '
           'em lang eastAsianLayout specVanish oMath',
    'tblPr': 'tblStyle tblpPr tblOverlap bidiVisual tblStyleRowBandSize tblStyleColBandSize tblW jc tblCellSpacing '
             'tblInd tblBorders shd tblLayout tblCellMar tblLook tblCaption tblDescription',
    'tcPr': 'cnfStyle tcW gridSpan hMerge vMerge tcBorders shd noWrap tcMar textDirection tcFitText vAlign hideMark',
    'tblCellMar': 'top start left bottom end right',
    'tcBorders': 'top start left bottom end right insideH insideV tl2br tr2bl',
    'pBdr': 'top left bottom right between bar',
}
W_NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def ordenar_xml(raiz):
    for etiqueta, orden in ORDEN.items():
        pos = {n: i for i, n in enumerate(orden.split())}
        for el in raiz.iter(W_NS + etiqueta):
            hijos = list(el)
            # quitar duplicados del mismo tipo (se queda el ultimo)
            vistos = {}
            for h in hijos:
                vistos[h.tag] = h
            for h in hijos:
                if vistos.get(h.tag) is not h and h.tag.replace(W_NS, '') in pos:
                    el.remove(h)
            hijos = sorted(list(el), key=lambda h: pos.get(h.tag.replace(W_NS, ''), 999))
            for h in hijos:
                el.remove(h)
            for h in hijos:
                el.append(h)


def guardar(d, nombre):
    for parte in d.part.package.iter_parts():
        el = getattr(parte, '_element', None)
        if el is not None:
            ordenar_xml(el)
    os.makedirs(SALIDA, exist_ok=True)
    ruta = os.path.join(SALIDA, nombre)
    props = d.core_properties
    props.author = 'S1'
    props.title = nombre.replace('.docx', '')
    props.comments = 'Plantilla generada por tools/generar_plantillas.py'
    d.save(ruta)
    print('  ok', nombre)


# Frase de identificacion que comparten las solicitudes de licencia
def encabezado_licencia(d):
    parrafo(d, [('{trat} ', ''), ('{NOMBRE_COMPLETO}', ''), (', {EMPLEO}, DNI. ', ''), ('{dni}', 'b'),
                (' CON DESTINO EN EL {UNIDAD} ({LOCALIDAD}).', '')],
            al=J, interlineado=1.5)


def datos_licencia(d, filas):
    t = tabla(d, len(filas), [3.6, 11.0], bordes=False, alto=0.75)
    for i, (et, val) in enumerate(filas):
        texto_celda(t.cell(i, 0), et, al=L)
        texto_celda(t.cell(i, 1), [(val, 'b')], al=L)
    t.alignment = WD_TABLE_ALIGNMENT.LEFT
    # sangria de la tabla como en el original
    tblPr = t._tbl.tblPr
    ind = OxmlElement('w:tblInd'); ind.set(qn('w:w'), str(int(1.0 * 567))); ind.set(qn('w:type'), 'dxa')
    tblPr.append(ind)
    return t


def tabla_fechas(d, tercera, bucle=None):
    anchos = [5.5, 5.5, 5.5]
    t = tabla(d, 2, anchos, alto=0.62)
    for i, h in enumerate(['FECHA INICIO', 'FECHA FINAL', tercera]):
        texto_celda(t.cell(0, i), h, tam=10)
    cabecera_tabla(t.rows[0])
    if bucle:
        texto_celda(t.cell(1, 0), '{#%s}{ini}' % bucle, tam=10)
        texto_celda(t.cell(1, 1), '{fin}', tam=10)
        texto_celda(t.cell(1, 2), '{n}{/%s}' % bucle, tam=10)
    else:
        texto_celda(t.cell(1, 0), '{fecha_ini_corta}', tam=10)
        texto_celda(t.cell(1, 1), '{fecha_fin_corta}', tam=10)
        texto_celda(t.cell(1, 2), '{total}', tam=10)
    return t


def lugar_fecha(d, antes=26, al=C, prefijo=''):
    return parrafo(d, prefijo + '{localidad_firma}, {fecha_firma_larga}', al=al, antes=antes)


# ----------------------------------------------------------------- modelos
def licencia_asuntos_propios():
    d = documento()
    encabezado_licencia(d)
    espacio(d, 22)
    datos_licencia(d, [('Solicita:', 'Licencia por Asuntos Propios'),
                       ('Total licencias:', '{total_tramos}'),
                       ('Localidad:', '{localidad_disfrute}'),
                       ('Total días:', '{total_dias}')])
    espacio(d, 14)
    tabla_fechas(d, 'DÍAS (1)(2)(3)', bucle='tramos')
    notas = [
        '(1) Solo se podrán solicitar licencias con una antelación máxima de nueve meses, por la imposibilidad de conocer las necesidades del servicio más allá de este periodo.',
        '(2) Respetando la antelación admitida en el párrafo anterior, si el periodo incluye años consecutivos, solo se podrá solicitar licencias del año posterior siempre y cuando haya sido publicada la relación de fiestas laborales del mismo.',
        '(3) Deberá existir un día laborable (no podrá ser ni sábado, ni domingo, ni festivo local o nacional) entre licencia y licencia (tramo y tramo) ya que las licencias se disfrutarán de manera ininterrumpida.',
    ]
    for i, n in enumerate(notas):
        parrafo(d, n, al=J, tam=7.5, antes=4 if i else 3, interlineado=1.1)
    lugar_fecha(d, antes=30)
    pie_destinatario(d, '{destinatario}', '{ciudad_destino}', subrayar_derecha=True, tam=11)
    guardar(d, 'licencia_asuntos_propios.docx')


def licencia_estudios(tipo):
    d = documento()
    encabezado_licencia(d)
    espacio(d, 22)
    datos_licencia(d, [('Solicita:', 'Licencia por Estudios'),
                       ('Estudios:', '{estudios}'),
                       ('Localidad:', '{localidad_disfrute}')])
    espacio(d, 14)
    parrafo(d, 'Fechas:', sangria=1.2, despues=6)
    tabla_fechas(d, 'DÍAS' if tipo == 'dias' else 'HORAS')
    nota = ('Nota: sólo se puede solicitar una licencia en el año natural (01ENE-31DIC).' if tipo == 'dias' else
            'Nota: la solicitud únicamente deberá contener la fecha de inicio, la fecha final, el número de horas a disfrutar y la localidad donde se disfrutará.')
    parrafo(d, nota, al=J, tam=7.5, antes=4)
    lugar_fecha(d, antes=40)
    pie_destinatario(d, '{destinatario}', '{ciudad_destino}', subrayar_derecha=True, tam=11)
    guardar(d, 'licencia_estudios_%s.docx' % tipo)


def declaracion_jurada():
    d = documento(arriba=2.5)
    parrafo(d, [('DECLARACIÓN JURADA', 'bu')], al=C, despues=30)
    parrafo(d, 'Declaración jurada que formula {trat} {NOMBRE_COMPLETO}, {Empleo} del {escala}, con DNI nº {dni} '
               'y destino en el {Unidad}, de que:', al=J, interlineado=1.5, despues=18)
    for t in ['La actividad profesional para la que solicita compatibilidad será ejercida fuera del horario de trabajo.',
              'Dicha actividad no superará las veinte (20) horas semanales.',
              'La mencionada actividad no estará relacionada con las funciones propias del puesto de trabajo de mi Unidad.']:
        parrafo(d, t, al=J, interlineado=1.5, despues=10, sangria=0.6)
    lugar_fecha(d, antes=40, prefijo='')
    parrafo(d, 'FIRMA', al=C, antes=24)
    parrafo(d, '', antes=60)
    parrafo(d, 'Fdo.: {NOMBRE_COMPLETO}', al=C)
    guardar(d, 'declaracion_jurada_compatibilidad.docx')


def anexo_ii_baja():
    d = documento(arriba=2.3, izq=2.5, der=2.5)
    parrafo(d, [('ANEXO II', 'b')], al=C, despues=18)
    parrafo(d, [('PARTE DE SOLICITUD DE BAJA TEMPORAL PARA EL SERVICIO', 'b')], al=C, despues=22)
    parrafo(d, [('{Trat} {NOMBRE_COMPLETO}, {EMPLEO} {escala}, DNI {dni}, con destino en el {unidad_corta}, {COMPANIA}. A ', ''),
                ('Ud.', 'b'), (' da parte de que el día {fecha_asistencia} ha sido asistido por el médico {medico} '
                 'perteneciente a {entidad_medica}, ', ''),
                ('dictaminando contingencia según código CIE-9-MC: ', 'b'), ('{cie}', ''), (', ', ''),
                ('y adjuntado el correspondiente parte médico', 'b'),
                (', por lo que se encuentra en {domicilio_habitual} imposibilitado para desempeñar las funciones o '
                 'actividades que le corresponden durante aproximadamente {dias_baja} días.', '')],
            al=J, interlineado=1.25, despues=14)
    parrafo(d, 'La incapacidad se ha producido como consecuencia de (marcar lo que corresponda):', al=J, despues=10)
    t = tabla(d, 3, [0.7, 15.3], bordes=False, alto=0.7)
    opciones = [('{x_comun}', [('Contingencia común.', 'b')]),
                ('{x_profesional}', [('Contingencia profesional', 'b'), ('{hechos_profesional}', '')]),
                ('{x_resto}', [('Resto de situaciones incluidas en el apartado décimo.3, párrafos b), c) y d) de la '
                               'Instrucción por la que se dictan normas sobre la determinación y el control de las bajas '
                               'temporales para el servicio del personal militar.', 'b')])]
    for i, (marca, texto) in enumerate(opciones):
        caja = t.cell(i, 0)
        caja.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
        texto_celda(caja, [(marca, 'b')], tam=10)
        borde_celda(caja, 'tblr', 6)
        c = t.cell(i, 1)
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
        p = texto_celda(c, texto, al=J, tam=10.5, interlineado=1.15)
        p.paragraph_format.left_indent = Cm(0.2)
        p.paragraph_format.space_after = Pt(8)
    parrafo(d, 'En virtud de las atribuciones que tiene conferidas, solicita le sea concedida la baja temporal durante '
               '{dias_baja} días, proponiendo como lugar de residencia durante dicha baja {residencia_baja}.',
            al=J, interlineado=1.25, antes=12)
    lugar_fecha(d, antes=22, prefijo='En ')
    parrafo(d, 'Firma:', al=C, antes=14)
    parrafo(d, '{Trat} {NOMBRE_COMPLETO}', al=C, antes=58)
    guardar(d, 'anexo_ii_baja_temporal.docx')


def encabezado_solicitud_conciliacion(d):
    parrafo(d, '{trat} {Nombre_completo}, {Empleo} del {escala} con DNI. {dni} y destino en el {Unidad}, ubicado en la '
               '{base}, de acuerdo con lo establecido en la Orden DEF/253/2015, con las modificaciones introducidas en '
               'la Orden DEF/112/2019:', al=J, interlineado=1.15, antes=26, despues=22)
    parrafo(d, [('SOLICITA:', 'b')], despues=16)


def firma_conciliacion(d):
    lugar_fecha(d, antes=26, prefijo='En ')
    parrafo(d, 'El {EMPLEO}', al=C, antes=22)
    parrafo(d, 'Fdo.: {NOMBRE_COMPLETO}', al=C, antes=56)


def apartado(d, letra, partes, despues=12):
    return parrafo(d, [(letra + ')\t', '')] + partes, al=J, sangria=0.6, colgante=0.7,
                   interlineado=1.15, despues=despues)


def flexibilidad_horaria():
    d = documento()
    cabecera_ministerio(d, ['{cab_mp_1}', '{cab_mp_2}'])
    encabezado_solicitud_conciliacion(d)
    parrafo(d, 'FLEXIBILIDAD HORARIA, según los siguientes datos:', despues=14)
    apartado(d, 'a', [('MOTIVO: {MOTIVO}.', '')])
    apartado(d, 'b', [('Fecha de inicio de la flexibilidad horaria: {fecha_ini_larga}.', '')])
    apartado(d, 'c', [('Fecha fin prevista: {fecha_fin_larga}.', '')])
    apartado(d, 'd', [('El periodo horario de flexibilidad de jornada laboral solicitado es: ', ''), ('{periodo}', 'u'), ('.', '')])
    firma_conciliacion(d)
    guardar(d, 'solicitud_flexibilidad_horaria.docx')


def reduccion_jornada():
    d = documento()
    cabecera_ministerio(d, ['{cab_mp_1}', '{cab_mp_2}'])
    parrafo(d, [('ANEXO I\nMODELO DE SOLICITUD', 'bu')], al=C, antes=16)
    encabezado_solicitud_conciliacion(d)
    parrafo(d, 'REDUCCIÓN DE JORNADA DE TRABAJO DIARIA, según los siguientes datos:', despues=14)
    apartado(d, 'a', [('MOTIVO: {MOTIVO}.', '')])
    apartado(d, 'b', [('Fecha de inicio de la reducción de jornada: {fecha_ini_larga}.', '')])
    apartado(d, 'c', [('Fecha de finalización: {fecha_fin_larga}.', '')])
    apartado(d, 'd', [('El periodo horario de reducción de jornada laboral solicitado es: ', ''), ('{periodo}', 'u'), ('.', '')])
    apartado(d, 'e', [('{?fecha_nac_menor}Fecha de nacimiento del menor: {fecha_nac_menor_larga}.', '')])
    firma_conciliacion(d)
    guardar(d, 'solicitud_reduccion_jornada.docx')


def instancia_bold_cabecera(d, texto):
    parrafo(d, [(texto, 'b')], al=J, interlineado=1.4, despues=20)


def instancia_saltos():
    d = documento(arriba=2.5)
    instancia_bold_cabecera(d, '{TRAT} {NOMBRE_COMPLETO}, CON DNI NÚM. {dni}, {EMPLEO_ABREV} {ESCALA}, DESTINADO EN EL '
                               '{UNIDAD} UBICADO EN EL TÉRMINO MUNICIPAL DE {LOCALIDAD} ({PROVINCIA}).')
    parrafo(d, [('EXPONE:', 'b')], al=C, antes=6, despues=14)
    parrafo(d, [('1.\t', ''), ('Que tiene cargados más de {saltos_letra} ({saltos}) saltos en el dato “SX” '
                               '(saltos en paracaídas) de SIPERDEF.', '')],
            al=J, sangria=0.6, colgante=0.7, interlineado=1.4)
    parrafo(d, [('SOLICITA:', 'b')], al=C, antes=40)
    parrafo(d, [('(A LA DIRECCIÓN DE PERSONAL)', 'b')], al=C, despues=16)
    parrafo(d, 'Le sea concedido el distintivo de {saltos_letra} saltos, y cargado en el apartado “DI” (Distintivos) de la '
               'Hoja General de Servicios de SIPERDEF.', al=J, interlineado=1.4)
    lugar_fecha(d, antes=40, prefijo='En ')
    pie_destinatario(d, '{DESTINATARIO}.', '{CIUDAD_DESTINO}.-', negrita=True, tam=10)
    guardar(d, 'instancia_distintivo_saltos.docx')


def excedencia():
    d = documento(arriba=2.3)
    instancia_bold_cabecera(d, '{TRAT} {NOMBRE_COMPLETO}, CON DNI {dni}, {EMPLEO} {ESCALA}, DESTINADO EN EL {UNIDAD}, '
                               'UBICADO EN EL TÉRMINO MUNICIPAL DE {LOCALIDAD} ({PROVINCIA}).')
    parrafo(d, [('EXPONE:', 'b')], al=C, despues=12)
    puntos = [
        'Que ingresó en las FAS el {fecha_ingreso_larga}, como militar de tropa por Resolución {res_ingreso}, BOD núm. '
        '{bod_ingreso}, de {fecha_bod_ingreso}. Adquiriendo el empleo de {empleo_adquirido} con fecha {fecha_empleo} '
        'por Resolución {res_empleo}, BOD núm. {bod_empleo}, de {fecha_bod_empleo}.',
        'Que actualmente se encuentra cumpliendo un compromiso de {tipo_compromiso} que finaliza el {fin_compromiso}.',
        'Que en la actualidad se encuentra destinado en el {Unidad}, por Resolución {res_destino}, BOD núm. '
        '{bod_destino}, de {fecha_bod_destino}.',
        'Que reúne los requisitos que establece el artículo 110.3 de la Ley 39/2007, de la carrera militar, para pasar '
        'a la situación de excedencia voluntaria por interés particular.',
        'Que en la actualidad no está sujeto a ningún proceso judicial, ni procedimiento disciplinario, ni designado '
        'para participar en operaciones fuera del territorio nacional.',
        'Que fija su residencia en: {domicilio}, con el teléfono {telefono}.',
    ]
    for i, t in enumerate(puntos, 1):
        parrafo(d, [('%d.\t' % i, ''), (t, '')], al=J, sangria=0.6, colgante=0.7, interlineado=1.3, despues=8, tam=10.5)
    parrafo(d, [('SOLICITA:', 'b')], al=C, antes=14)
    parrafo(d, '(Al Mando de Personal)', al=C, despues=12)
    parrafo(d, 'Se tenga por presentada la presente instancia, sea admitida, y se conceda la oportuna excedencia '
               'voluntaria por interés particular, a partir del {fecha_efectos_larga}, fijando su residencia en lo '
               'expuesto en el punto 6, en cumplimiento del artículo 110.1.b) de la Ley 39/2007, de 19 de noviembre, '
               'de la carrera militar.', al=J, interlineado=1.3, primera=1.0, tam=10.5)
    lugar_fecha(d, antes=26, prefijo='En ')
    pie_destinatario(d, '{DESTINATARIO}', '{CIUDAD_DESTINO}.-', negrita=True, tam=9)
    guardar(d, 'solicitud_excedencia_voluntaria.docx')


def mantener_con_siguiente(tabla_o_parrafo):
    """Word no separa este bloque de lo que viene detrás (título + tabla + firmas)."""
    if hasattr(tabla_o_parrafo, 'rows'):
        for fila in tabla_o_parrafo.rows:
            for c in fila.cells:
                for p in c.paragraphs:
                    p.paragraph_format.keep_with_next = True
    else:
        tabla_o_parrafo.paragraph_format.keep_with_next = True


def hoja_anual():
    """Una sola hoja anual: la tabla biográfica tiene solo las filas usadas (31DIC justo
    debajo de la última) y todo lo demás sube. Si no cabe en una hoja, el marcador
    {^salto_pagina} manda «3.- Resumen de mandos» y las firmas juntos a la segunda."""
    d = documento(arriba=1.5, abajo=1.6, izq=2.0, der=2.0, pie=0.8)
    total = 17.0
    cabecera_ministerio(d, ['{cab_ft_1}', '{cab_ft_2}'], ['{cab_ft_3}', '{cab_ft_4}'])
    parrafo(d, [('ANEXO I', 'bu')], al=C, antes=6, tam=10.5)
    parrafo(d, [('HOJA ANUAL DE SERVICIOS', 'bu')], al=C, antes=10, tam=10.5)
    parrafo(d, [('AÑO: ', 'b'), ('{anio}', '')], al=R, antes=6, tam=10)
    espacio(d, 8)
    t = tabla(d, 1, [12.0, 5.0], bordes=False)
    margen_celdas(t, 0, 0)
    texto_celda(t.cell(0, 0), [('APELLIDOS Y NOMBRE: ', 'b'), ('{APELLIDOS_NOMBRE}', '')], al=L, tam=10)
    texto_celda(t.cell(0, 1), [('DNI: ', 'b'), ('{dni}', '')], al=L, tam=10)
    parrafo(d, [('1.- DATOS ADMINISTRATIVOS (Señale lo que corresponda)', 'bu')], antes=12, despues=6, tam=10)
    t = tabla(d, 2, [15.6, 0.8], bordes=False, alto=0.62)
    filas_adm = [[('• He comprobado la correcta anotación de los datos administrativos en SIPERDEF', ''), ('1', '^')],
                 '• He detectado errores en los datos administrativos en SIPERDEF y confeccionado nota de reparos para solicitar la corrección de los mismos.']
    for i, txt in enumerate(filas_adm):
        p = texto_celda(t.cell(i, 0), txt, al=L, tam=9.5)
        p.paragraph_format.left_indent = Cm(0.6)
        p.paragraph_format.first_line_indent = Cm(-0.3)
        caja = t.cell(i, 1)
        borde_celda(caja, 'tblr', 6)
        texto_celda(caja, [('{x_correcto}' if i == 0 else '{x_errores}', 'b')], tam=10)
    mantener_con_siguiente(parrafo(d, [('2.- DATOS BIOGRÁFICOS', 'bu')], antes=12, despues=6, tam=10))
    t = tabla(d, 4, [3.0, total - 3.0], alto=0.56)
    texto_celda(t.cell(0, 0), [('FECHA', 'b')], tam=9)
    texto_celda(t.cell(0, 1), [('INFORMACIÓN BIOGRÁFICA', 'b')], tam=9)
    cabecera_tabla(t.rows[0])
    texto_celda(t.cell(1, 0), '01ENE', tam=9)
    texto_celda(t.cell(1, 1), '{BIO_INICIO}', al=L, tam=9)
    texto_celda(t.cell(2, 0), '{#bio}{fecha}', tam=9)
    texto_celda(t.cell(2, 1), '{TEXTO}{/bio}', al=L, tam=9)
    texto_celda(t.cell(3, 0), '31DIC', tam=9)
    texto_celda(t.cell(3, 1), '{BIO_FIN}', al=L, tam=9)
    mantener_con_siguiente(parrafo(d, [('{^salto_pagina}', ''), ('3.- RESUMEN DE LOS MANDOS EJERCIDOS DURANTE EL AÑO.', 'bu')], antes=12, despues=6, tam=10))
    # Empleo y unidad más anchos; las 6 fechas iguales (caben dd/mm/aa holgadas).
    # Cabeceras en negrita y filas a la misma altura que los datos biográficos.
    anchos = [2.2, 4.0] + [1.8, 1.8] * 3
    t = tabla(d, 4, anchos, alto=0.56)
    for r in range(3):
        t.rows[r].height = Cm(0.5)
    a = t.cell(0, 0).merge(t.cell(2, 0)); texto_celda(a, [('EMPLEO', 'b')], tam=8.5)
    b = t.cell(0, 1).merge(t.cell(2, 1)); texto_celda(b, [('TIPO DE UNIDAD', 'b')], tam=8.5)
    tm = t.cell(0, 2).merge(t.cell(0, 7)); texto_celda(tm, [('TIPO DE MANDO', 'b')], tam=8.5)
    for k, nom in enumerate(['TITULAR', 'INTERINO', 'ACCTAL.']):
        c = t.cell(1, 2 + 2 * k).merge(t.cell(1, 3 + 2 * k)); texto_celda(c, [(nom, 'b')], tam=8)
        texto_celda(t.cell(2, 2 + 2 * k), 'Inicio', tam=8)
        texto_celda(t.cell(2, 3 + 2 * k), 'Fin', tam=8)
    for r in range(3):
        cabecera_tabla(t.rows[r])
    campos = ['{#mandos}{EMPLEO_M}', '{UNIDAD_M}', '{ti}', '{tf}', '{ii}', '{if}', '{ai}', '{af}{/mandos}']
    for k, cmp in enumerate(campos):
        texto_celda(t.cell(3, k), cmp, tam=8.5)
    mantener_con_siguiente(t)
    mantener_con_siguiente(espacio(d, 18))
    # firmas: dos columnas, sin bordes (una sola fila que no se parte)
    f = tabla(d, 1, [8.5, 8.5], bordes=False)
    texto_celda(f.cell(0, 0), 'CERTIFICO LA VERACIDAD DE LOS DATOS\nEXPUESTOS POR EL INTERESADO.\n'
                              '{localidad_firma}, {fecha_jefe_larga}\nEL JEFE DE LA UNIDAD\n\n\n\n{jefe_unidad}',
                tam=9.5, interlineado=1.1)
    texto_celda(f.cell(0, 1), '\n\n{localidad_firma}, {fecha_interesado_larga}\nEL INTERESADO\n\n\n\n'
                              '{Trat} {NOMBRE_COMPLETO}', tam=9.5, interlineado=1.1)
    # nota al pie del superindice 1 (en el pie, solo en la primera hoja)
    s = d.sections[0]
    s.different_first_page_header_footer = True
    p = s.first_page_footer.paragraphs[0]
    runs(p, [('1', '^'), (' La comprobación de los datos administrativos puede realizarse a través del portal personal o '
                          'directamente en el SIPERDEF desde un terminal del negociado de gestión de expedientes '
                          'personales de la UCO.', '')], tam=7)
    p.paragraph_format.line_spacing = 1.0
    # filete de separacion de la nota
    pPr = p._p.get_or_add_pPr()
    bdr = OxmlElement('w:pBdr'); top = OxmlElement('w:top')
    for k, v in (('w:val', 'single'), ('w:sz', '4'), ('w:space', '3'), ('w:color', '000000')):
        top.set(qn(k), v)
    bdr.append(top); pPr.append(bdr)
    guardar(d, 'hoja_anual_servicios.docx')


def papeleta_vacantes():
    d = documento(arriba=1.5, abajo=1.4, izq=1.6, der=1.6, pie=0.7)
    parrafo(d, [('PAPELETA DE SOLICITUD DE VACANTES {UNIDAD_VACANTES}', 'b')], al=C, despues=10, tam=11)
    anchos = [2.0, 3.2, 2.3, 5.0, 1.8, 3.5]
    t = tabla(d, 2, anchos, alto=0.55, grosor=6)
    datos = [['DNI:', '{dni}', 'APELLIDOS:', '{APELLIDOS}', 'NOMBRE:', '{NOMBRE}'],
             ['EMPLEO:', '{EMPLEO}', 'UCO:', '{uco}', 'CÍA.:', '{cia}']]
    for i, fila in enumerate(datos):
        for k, v in enumerate(fila):
            es_et = k % 2 == 0
            texto_celda(t.cell(i, k), [(v, 'b' if es_et else '')], al=R if es_et else L, tam=8.5)
            if es_et:
                sombrear(t.cell(i, k), 'F2F2F2')
    espacio(d, 8)
    anchos = [2.2, 1.9, 5.2, 1.8, 3.4, 3.3]
    t = tabla(d, 2, anchos, alto=0.47, grosor=4)
    cab = ['ORDEN DE PREFERENCIA', 'Nº DE VACANTE', 'UNIDAD, CENTRO U ORGANISMO QUE SOLICITA', 'CARÁCTER V/A',
           'Nº RESOLUCIÓN - Nº BOD', 'OBSERVACIONES DE LA VACANTE (5)']
    for k, h in enumerate(cab):
        texto_celda(t.cell(0, k), [(h, 'b')], tam=7)
        sombrear(t.cell(0, k), 'D9D9D9')
    cabecera_tabla(t.rows[0])
    campos = ['{#vacantes}{orden}', '{num}', '{UNIDAD_V}', '{caracter}', '{resolucion}', '{obs}{/vacantes}']
    for k, cmp in enumerate(campos):
        texto_celda(t.cell(1, k), cmp, tam=7.5)
    parrafo(d, [('OBSERVACIONES DEL SOLICITANTE:', 'b')], antes=10, despues=3, tam=8)
    o = tabla(d, 1, [sum(anchos)], alto=1.5, grosor=6)
    o.cell(0, 0).vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
    texto_celda(o.cell(0, 0), '{observaciones}', al=L, tam=8.5)
    espacio(d, 10)
    f = tabla(d, 1, [8.9, 8.9], bordes=False)
    texto_celda(f.cell(0, 0), [('El solicitante\n', 'b'), ('{localidad_firma}, {fecha_firma_larga}.\n\n\n\n', ''),
                               ('Fdo.: ', 'b'), ('{NOMBRE_COMPLETO}', '')], al=L, tam=8)
    texto_celda(f.cell(0, 1), [('Vacante cargada en SIPERDEF módulo GVD por:\nPERSONAL DE S-1 (sello, nombre y firma)\n\n\n\n\n', 'b'),
                               ('Fdo.:', 'b')], al=L, tam=8)
    parrafo(d, [('OBSERVACIONES PARA RELLENAR LA PAPELETA', 'b')], antes=8, despues=2, tam=7)
    obs = [
        '1) Solo se podrá rellenar una papeleta de solicitud de vacante por resolución. En caso de varias resoluciones se rellenarán tantas papeletas como resoluciones se soliciten.',
        '2) Preferentemente el personal que solicite vacante, después de informar a sus Jefes de pelotón, sección y compañía, acudirá personalmente a S-1 con su papeleta de vacante (cumplimentada) para la carga de la misma.',
        '3) En caso de que tenga entrada en S-1 una solicitud de vacante mal cumplimentada y el interesado no se encuentre presente en el momento de la carga en el módulo de vacantes de SIPERDEF, ésta será devuelta a la compañía del solicitante.',
        '4) En caso de solicitar una vacante en la que se exija algún curso, deberá añadir en el apartado de observaciones que se compromete a realizar el mismo.',
        '5) El interesado deberá leer obligatoriamente todas las observaciones de las vacantes solicitadas para no solicitar una vacante que no le corresponda por su empleo, arma o situación actual (compromiso inicial, personal con pérdida de aptitud psicofísica o personal que se encuentre pendiente de asignación de destino). Indicar en la columna "OBSERVACIONES DE LA VACANTE" los números que se indican en el BOD.',
        '6) Dudas sobre los destinos: consultar el Real Decreto 456/2011, de 1 de abril, por el que se aprueba el Reglamento de destinos del personal militar profesional.',
    ]
    for n in obs:
        parrafo(d, n, al=J, tam=6.5, despues=1, interlineado=1.0)
    guardar(d, 'papeleta_solicitud_vacantes.docx')


if __name__ == '__main__':
    print('Generando plantillas en', SALIDA)
    licencia_asuntos_propios()
    licencia_estudios('dias')
    licencia_estudios('horas')
    declaracion_jurada()
    anexo_ii_baja()
    flexibilidad_horaria()
    reduccion_jornada()
    instancia_saltos()
    excedencia()
    hoja_anual()
    papeleta_vacantes()
