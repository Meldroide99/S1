# IIBPAC · Documentación S1 · S2 · S3 · S4

Página local para rellenar los modelos de la unidad con los datos del Excel de personal y sacarlos en **Word** o **PDF**.

## Cómo se usa

1. Descarga la carpeta (botón verde **Code → Download ZIP**) y descomprímela.
2. Abre `index.html` con doble clic (Chrome o Edge). **No necesita internet ni instalar nada.**
3. Arrastra el Excel de personal a la página.
4. Elige el modelo, escribe dos letras del apellido o el DNI y pulsa Intro: se rellena solo.
5. Completa lo que falte (la columna «Revisión» te avisa) y mira la hoja a la derecha: es exactamente como saldrá impresa.
6. Descarga en **Word**, en **PDF** o pulsa **Imprimir**.

**Varias a la vez (carga masiva):** en **todos** los modelos, «Varias a la vez» → filtra por compañía o empleo, o **pega una lista de DNI o nombres** → un ZIP con un Word por persona o un único PDF para imprimir de una vez. La selección se mantiene al pasar de un modelo a otro. Cualquier modelo nuevo (también las plantillas propias) tiene esta opción sin hacer nada.

**Listas (S2 · Formulario Clearance):** un solo documento con todas las personas marcadas, una fila cada una. Las filas se pueden corregir o añadir a mano sin tocar el Excel de personal. Sale en **Excel** (la plantilla del S2, ya preparada para imprimir: A4, ajustada al ancho, cabecera en cada hoja y número de página), **Word** y **PDF** (repartida en hojas A4 con la cabecera repetida). Avisa de HPS caducadas, que caducan en 6 meses y DNI repetidos.

## Moral y Bienestar (pestaña MyB)

Calendario principal (mes y agenda, al estilo de Google Calendar) y un apartado por cada tema del programa, cada uno con su jefe bien visible, su foto, su color, sus fechas, sus ideas «por programar» y sus notas. Lo que se añade dentro de un apartado sale solo en el calendario principal.

- Crear: pulsar un día (o arrastrar sobre varios días) o el botón **Crear**. Mover: arrastrar la actividad a otro día. Lo «por programar» se arrastra al día que toque.
- Cada actividad: fechas o «por programar» con mes orientativo, uno o varios apartados, estado (idea, encaminado, confirmado, hecho, cancelado), prioridad, color, lugar, responsable, notas y repetición semanal o mensual.
- Exportar a Outlook/Google (.ics), imprimir el mes e imprimir la lista de jefes.

**Dónde se guarda:** en ningún caso en la página (es pública). Todo va en un archivo `moral-bienestar.json` en la carpeta compartida de la unidad. Con Edge o Chrome, «Abrir archivo» y cada cambio se escribe solo en ese archivo; si otra persona lo cambia a la vez, se juntan los cambios (gana lo último que se tocó de cada actividad) y cada 20 s se recogen los de los demás. En otros navegadores: abrir, trabajar y «Descargar copia» para sustituir el archivo. **Nunca subas ese archivo al repositorio.**

## Privacidad

- La página pide usuario y contraseña al entrar. Es una **cortina**, no seguridad real: la página es pública y funciona entera en el navegador. Lo que protege los datos es que el Excel nunca sale del equipo.

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

Para el Clearance se usan `HPS NACIONAL / OTAN` (grado) y `VALIDEZ HPS` (caducidad). Si solo hay `APELLIDOS`, se parte en 1.º y 2.º apellido (las partículas «de», «del», «la»… van con el apellido).

## Estructura

```
index.html            la página
assets/               estilos, código y librerías (incluidas: funciona sin internet)
s1/ s2/ s3/ s4/       una carpeta por sección
moral/                pestaña Moral y Bienestar (sin datos: se abren desde el archivo .json)
  plantillas/         modelos Word (y Excel, en las listas) con huecos {asi}
  documentos.js       campos, cálculos y comprobaciones de cada modelo
  plantillas.js       las plantillas empaquetadas (se genera solo)
tools/                scripts para regenerar las plantillas
```

## Añadir o cambiar un modelo

- **Rápido (solo en tu equipo):** en la página, *Plantillas propias* → sube un Word con huecos como `{NOMBRE_COMPLETO}`, `{dni}`, `{EMPLEO}`, `{fecha_firma_larga}`. Sale un formulario automático.
- **Para todos:** se pone el `.docx` en `sX/plantillas/`, se describe en `sX/documentos.js` y se ejecuta:

```
python3 tools/generar_plantillas.py   # solo si se cambian los modelos de S1 hechos por código
python3 tools/empaquetar.py           # siempre que cambie algún .docx o .xlsx
python3 tools/sellar.py               # antes de subir: marca de versión para que nadie vea la versión vieja
```

Huecos: `{campo}` tal cual · `{CAMPO}` en mayúsculas · `{Campo}` tipo título · `{#lista}…{/lista}` repite una fila de tabla · un párrafo solo con `{#bloque}` y otro con `{/bloque}` repiten todo lo de en medio (una hoja por elemento) · `{?campo}` al inicio de un párrafo lo quita si el campo está vacío · `{^campo}` empieza el párrafo en hoja nueva si el campo tiene valor.

En las plantillas **Excel** de las listas: la fila modelo lleva `{#filas}` en su primera celda y `{/filas}` en la última, y se repite por cada persona conservando bordes, letra y formato (las fechas se guardan como fecha; el DNI, como texto). El Excel solo puede llevar plantillas vacías: el `.gitignore` deja subir `sX/plantillas/*.xlsx` y nada más.

## Librerías incluidas

[docx-preview](https://github.com/VolodymyrBaydalka/docxjs) (Apache 2.0), [JSZip](https://stuk.github.io/jszip/) (MIT), [pdf-lib](https://pdf-lib.js.org/) (MIT), fuentes Manrope y EB Garamond (OFL).
