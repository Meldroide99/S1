# Servidor propio (Raspberry)

Con esto la página funciona en tu propio servidor, con usuarios de verdad para **Moral y Bienestar**:

| Tipo | Qué puede hacer |
| --- | --- |
| **Lectura** (la mayoría) | Ver el calendario y los apartados, y apuntarse a actividades |
| **Editor** | Lo anterior y editar los clubs que le asigne el maestro |
| **Maestro** | Todo: apartados, jefes, nombre del programa, usuarios y copias |

No necesita instalar nada más que Node.js. Los datos (programa, inscripciones, usuarios y sesiones) se guardan en `~/iibpac-datos`, **fuera del repositorio**. Ese repositorio es público, así que esa carpeta no se sube nunca a GitHub.

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
9. **Crear los usuarios.** Entra en tu dominio → Moral y Bienestar → con tu usuario maestro → botón **Usuarios**:
   - un usuario de **Lectura** para todo el personal (por ejemplo `personal`);
   - un **Editor** por club, marcando sus clubs.

## Día a día

- **Actualizar la página** después de que suba cambios a GitHub:
  ```
  cd ~/S1 && git pull && sudo systemctl restart iibpac
  ```
- **Copias de seguridad.** Hay una copia automática al día en `~/iibpac-datos/copias` (se guardan 60 días). Guarda además, de vez en cuando, una copia fuera de la Raspberry: menú ⋯ → «Descargar copia de seguridad».
- **Olvidé una contraseña.** `node ~/S1/servidor/admin.js clave <usuario>`
- **Ver usuarios.** `node ~/S1/servidor/admin.js usuarios`
- **Ver qué pasa.** `journalctl -u iibpac -f`

## Seguridad (lo que ya hace)

- Las contraseñas se guardan cifradas (scrypt), nunca en claro.
- Tras 8 intentos fallidos desde un mismo sitio, se bloquea 15 minutos.
- Las sesiones duran 30 días y se cierran al cambiar la contraseña.
- El servidor comprueba los permisos de cada cambio: aunque alguien manipule la página, un lector no puede editar y un editor no puede tocar clubs ajenos.
- Solo escucha en la propia Raspberry (`127.0.0.1`); desde fuera solo se entra por el túnel de Cloudflare (con HTTPS).
- No sirve el código del servidor, ni los archivos ocultos, ni ningún `.json`.

Pregunta al S2 qué datos de la unidad pueden alojarse en un equipo particular antes de cargar nada.
