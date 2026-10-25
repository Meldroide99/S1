# IIBPAC · Documentación S1 · S2 · S3 · S4

Página local para rellenar los modelos de la unidad con los datos del Excel de personal y sacarlos en **Word** o **PDF**.

## Cómo se usa

1. Descarga la carpeta (botón verde **Code → Download ZIP**) y descomprímela.
2. Abre `index.html` con doble clic (Chrome o Edge). **No necesita internet ni instalar nada.**
3. Arrastra el Excel de personal a la página.
4. Elige el modelo, escribe dos letras del apellido o el DNI y pulsa Intro: se rellena solo.
5. Completa lo que falte (la columna «Revisión» te avisa) y mira la hoja a la derecha: es exactamente como saldrá impresa.
6. Descarga en **Word**, en **PDF** o pulsa **Imprimir**.

**Varias a la vez:** en cualquier modelo, «Varias a la vez» → filtra por compañía → marca a la gente → un ZIP con un Word por persona o un único PDF para imprimir de una vez (ideal para la hoja anual).

## Privacidad

- El Excel se lee **solo en el navegador** y desaparece al cerrar la pestaña. No se sube a ningún sitio y no se guarda en el equipo.
- El repositorio es **público**: el `.gitignore` impide subir Excel o CSV. No subas nunca documentos rellenos.
- En el navegador solo se guardan los datos de la unidad (Ajustes), qué columna es cada dato y las plantillas propias.

## Para que se imprima bien

- Para imprimir, usa siempre el **PDF**: es idéntico a la vista previa en cualquier ordenador e impresora.
- En el cuadro de impresión: escala **Predeterminada / Tamaño real (100 %)**, nunca «Ajustar al área de impresión».
- El Word está maquetado para que no se mueva (solo Arial, interlineado exacto, sin cuadros flotantes, destinatario en el pie), pero Word puede variar algo según la versión y la impresora predeterminada.

## El Excel

Se reconoce cada columna por su título (sin importar tildes ni mayúsculas): `NOMBRE`, `1º APELLIDO`, `2º APELLIDO`, `APELLIDOS Y NOMBRE`, `NUMERO DNI`, `EMPLEO`, `EMPLEO ABREVIADO`, `CIA`, `TELEFONO`, `RESIDENCIA 1`… Si alguna no la reconoce, se corrige en **Base de datos** (pulsando el contador de personas).

Columnas que conviene **añadir** para que se rellene más solo: `ESCALA` (ej. `MTM CGET ILG`), `SEXO` (para D./Dª), `DOMICILIO`, `FECHA INGRESO`, `FIN COMPROMISO`.

## Estructura

```
index.html            la página
assets/               estilos, código y librerías (incluidas: funciona sin internet)
s1/ s2/ s3/ s4/       una carpeta por sección
  plantillas/         modelos Word con huecos {asi}
  documentos.js       campos, cálculos y comprobaciones de cada modelo
  plantillas.js       las plantillas empaquetadas (se genera solo)
tools/                scripts para regenerar las plantillas
```

## Añadir o cambiar un modelo

- **Rápido (solo en tu equipo):** en la página, *Plantillas propias* → sube un Word con huecos como `{NOMBRE_COMPLETO}`, `{dni}`, `{EMPLEO}`, `{fecha_firma_larga}`. Sale un formulario automático.
- **Para todos:** se pone el `.docx` en `sX/plantillas/`, se describe en `sX/documentos.js` y se ejecuta:

```
python3 tools/generar_plantillas.py   # solo si se cambian los modelos de S1 hechos por código
python3 tools/empaquetar.py           # siempre que cambie algún .docx
```

Huecos: `{campo}` tal cual · `{CAMPO}` en mayúsculas · `{Campo}` tipo título · `{#lista}…{/lista}` repite una fila de tabla · `{?campo}` al inicio de un párrafo lo quita si el campo está vacío.

## Librerías incluidas

[docx-preview](https://github.com/VolodymyrBaydalka/docxjs) (Apache 2.0), [JSZip](https://stuk.github.io/jszip/) (MIT), [pdf-lib](https://pdf-lib.js.org/) (MIT), fuentes Manrope y Cormorant Garamond (OFL).
