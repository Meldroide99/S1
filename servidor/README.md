# Servidor propio (Raspberry)

Con esto la página funciona en tu propio servidor, con **cuentas personales** para Moral y Bienestar:

- Cada persona se registra con el **código de la unidad**, confirma su correo y **tú apruebas la cuenta**. Nadie entra sin tu aprobación.
- **Permisos por catálogo**: cada cosa que se puede hacer es un permiso, y los tipos de cuenta (roles) son grupos de permisos guardados en `roles.json`, no fijos en el código.

| Tipo de cuenta | Qué puede hacer |
| --- | --- |
| **Personal** | Ver el calendario y los apartados, y apuntarse a actividades |
| **Editor de clubs** | Lo anterior, y editar y convocar en los clubs que tenga asignados |
| **Maestro** | Todo: apartados, usuarios, solicitudes, ajustes, correo y copias |

- **Avisos por correo**: al convocar a alguien, cuando cambia o se cancela una actividad suya, cuando sale de la reserva y **el día anterior** (recordatorio).
- **Contraseña olvidada**: cada uno se la cambia solo, por correo.
- La sesión dura 90 días en cada aparato, y el navegador recuerda la contraseña.

No necesita instalar nada más que Node.js. Los datos (programa, inscripciones, usuarios, sesiones y ajustes) se guardan en `~/iibpac-datos`, **fuera del repositorio**. Ese repositorio es público, así que esa carpeta no se sube nunca a GitHub.

## Montaje en la Raspberry (una vez)

1. **Sistema.** Con *Raspberry Pi Imager* graba **Raspberry Pi OS Lite (64 bits)**. En los ajustes del Imager pon el usuario (`balu`), una contraseña larga y activa SSH.
2. **Actualizar e instalar.** Por SSH:
   ```
   sudo apt update && sudo apt full-upgrade -y
   sudo apt install -y git nodejs unattended-upgrades
   node -v        # tiene que ser 18 o más
   ```
3. **Descargar la página.**
   ```
   git clone https://github.com/Meldroide99/S1.git ~/S1
   ```
4. **Crear tu usuario maestro.**
   ```
   node ~/S1/servidor/admin.js maestro balu
   ```
5. **Cargar el programa.** Copia `moral-bienestar.json` a la Raspberry (con WinSCP o `scp`) y:
   ```
   node ~/S1/servidor/admin.js importar ~/moral-bienestar.json
   rm ~/moral-bienestar.json
   ```
   También se puede cargar luego desde la página, entrando como maestro: menú ⋯ → «Cargar un archivo .json».
6. **Arranque automático.** Si tu usuario no es `balu`, cámbialo dentro de `servidor/iibpac.service`. Después:
   ```
   sudo cp ~/S1/servidor/iibpac.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now iibpac
   systemctl status iibpac
   ```
7. **Probar en casa.** Desde la Raspberry: `curl localhost:8080/api/yo` tiene que responder `{"modo":"servidor",…}`.
8. **Salir a internet con Cloudflare Tunnel.** En Cloudflare Zero Trust → Redes → Túneles → Crear túnel. Instala `cloudflared` con el comando que te da el panel y apunta tu dominio a `http://localhost:8080`. No hace falta abrir puertos en el router.
9. **Correo.** Crea una cuenta gratuita en [Brevo](https://www.brevo.com) o [Resend](https://resend.com) y verifica tu dominio en el servicio. Para eso añades en Cloudflare los registros DNS que te indique, y así los correos no acaban en «no deseado». Saca una clave (API key). Después, en la página: menú ⋯ → **Ajustes del servidor y correo** → elige el servicio, pon el remitente (`avisos@tudominio.es`) y la clave → **Enviarme un correo de prueba**. Pon también la dirección de la página (`https://tudominio.es`), que es la que va en los enlaces de los correos.
   Mientras no lo configures, los correos no se envían: quedan apuntados en `~/iibpac-datos/correos.log`.
10. **Abrir el registro.** Botón **Usuarios** → **Abrir con código**. Da ese código solo dentro de la unidad. Cuando alguien se registre, te llegará un correo y verás la solicitud en **Usuarios**, donde eliges su tipo de cuenta y la apruebas. A los editores, después, **Cambiar** → marca sus clubs.

## Día a día

- **Actualizar la página** después de que suba cambios a GitHub:
  ```
  cd ~/S1 && git pull && sudo systemctl restart iibpac
  ```
- **Copias de seguridad.** Hay una copia automática al día en `~/iibpac-datos/copias` (se guardan 60 días). Guarda además, de vez en cuando, una copia fuera de la Raspberry: menú ⋯ → «Descargar copia de seguridad».
- **Alguien olvidó su contraseña.** La cambia solo con «He olvidado mi contraseña». Si su correo no funciona, ponle una nueva desde **Usuarios → Cambiar**, o por SSH: `node ~/S1/servidor/admin.js clave <usuario>`.
- **Si el código de registro se filtra**: Usuarios → **Generar otro** (el viejo deja de valer) o **Cerrar el registro**.
- **Ver usuarios.** `node ~/S1/servidor/admin.js usuarios`
- **Ver qué pasa.** `journalctl -u iibpac -f`

## Seguridad (lo que ya hace)

- Las contraseñas se guardan cifradas (scrypt), nunca en claro.
- Tras 8 intentos fallidos desde un mismo sitio, se bloquea 15 minutos.
- Las sesiones duran 90 días y se cierran al cambiar la contraseña o al bloquear la cuenta.
- Registro solo con código de la unidad, correo confirmado y aprobación. Los enlaces de los correos son de un solo uso y caducan (3 días para confirmar el correo, 1 hora para cambiar la contraseña).
- La clave del servicio de correo se guarda en el servidor y nunca se manda a la página.
- El servidor comprueba los permisos de cada cambio: aunque alguien manipule la página, un lector no puede editar y un editor no puede tocar clubs ajenos.
- Solo escucha en la propia Raspberry (`127.0.0.1`); desde fuera solo se entra por el túnel de Cloudflare (con HTTPS).
- No sirve el código del servidor, ni los archivos ocultos, ni ningún `.json`.

Pregunta al S2 qué datos de la unidad pueden alojarse en un equipo particular antes de cargar nada.
