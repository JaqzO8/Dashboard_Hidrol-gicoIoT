# SITPA — preparación local para la carga al ESP32

Actualización: **13 de octubre de 2026**. El usuario confirmó que el ESP32 usará la red Wi-Fi guardada. No hay placa/puerto COM detectados y no se ha ejecutado una carga.

## Preparado en este equipo

- Se corrigió la ruta del firmware después de que Arduino lo colocara en su carpeta homónima: `D:\SistemaHidrológico\iot_code\09_Codigo_Final_Proyecto\09_Codigo_Final_Proyecto.ino`.
- Wi-Fi conservado en `iot_code/secrets.h`; no se imprimió la contraseña ni se consultaron claves Wi-Fi del sistema.
- Dos contraseñas aleatorias nuevas de 32 bytes: la estación puede publicar solo sus cuatro tópicos y el backend solo puede leerlos. Las contraseñas no son iguales. El broker conserva hashes scrypt, no sus valores originales.
- CA local y certificado del broker, con validación de nombre/IP. No se instaló la CA en el almacén global de Windows ni se desactivó la validación TLS.
- Broker local con TLS 1.2 como mínimo, en **10.129.30.118:8883**, la IPv4 de la interfaz Wi-Fi activa durante la preparación. Se comprobó que escucha exclusivamente en esa dirección.
- Backend configurado para ese broker y esa CA; su HTTP y la web permanecen en loopback. Un arranque real devolvió `/healthz` 200 con MQTT y SQLite disponibles; la estación física seguía sin lecturas.
- Preparación reproducible, comprobación de coherencia, ensayo de credenciales y comandos de compilación/carga.
- Diagnóstico serie a 115200: estado Wi-Fi/MQTT, espera NTP, nivel, lluvia, clima y fallos, sin imprimir contraseñas. La alarma local sigue independiente de la red.

## Archivos privados y fuentes

| Ruta | Uso |
|---|---|
| `iot_code/09_Codigo_Final_Proyecto/09_Codigo_Final_Proyecto.ino` | Fuente que se edita y se abre con Arduino IDE |
| `iot_code/edge_logic.h` | Constantes y lógica de nivel/alerta; copia sincronizada junto al sketch |
| `iot_code/secrets.h` | Wi-Fi, host MQTT, cuenta de estación y CA; archivo privado principal |
| `iot_code/09_Codigo_Final_Proyecto/secrets.h` | Copia privada sincronizada para Arduino IDE |
| `.local-mqtt/broker.json` | IP, puerto, roles y hashes de las cuentas |
| `.local-mqtt/backend.env` | Cuenta lectora, URL TLS y CA del backend de pruebas físicas |
| `.local-mqtt/ca.crt`, `server.crt` | Certificados locales |
| `.local-mqtt/ca.key`, `server.key` | Claves privadas; no copiar ni publicar |
| `.local-mqtt/secrets.before-local.h` | Respaldo privado de configuración anterior |
| `.tools/firmware-ready/` | Binarios con credenciales y manifiesto de compilación; no distribuir |
| `.tools/firmware-build/` | Binarios de comprobación con credenciales vacías; no usar para la puesta en servicio |

Los secretos y los directorios de firmware configurado tienen ACL restringidas al usuario actual y SYSTEM. Están ignorados por Git y excluidos del contenedor y del servidor web. Las rutas de secretos devuelven 404 desde la web. No se versionó ni publicó ninguna contraseña.

## Comandos preparados

Desde `D:\SistemaHidrológico`:

```powershell
# Comprueba archivos, CA, claves, IP y correspondencia entre fuentes y binario.
npm run check:hardware

# Usa las credenciales reales en un ensayo TLS aislado:
# puertos efímeros, SQLite en memoria, sin lecturas de sensores.
npm run verify:hardware

# Compila con la configuración privada actual, sin cargar.
./tools/compile-firmware.ps1 -UseLocalSecrets

# Inicia broker TLS, backend y dashboard para la placa.
npm run hardware
```

La web se abre en `http://localhost:4173`. El comando `npm run local` sigue siendo el modo de simulación/desarrollo con broker loopback sin TLS; para conectar la placa se usa `npm run hardware`. No ejecutar ambos simultáneamente. Ctrl+C detiene los procesos.

## Único ajuste del sistema que esta sesión no pudo aplicar

**La regla del firewall está pendiente porque la sesión no es administradora.** Se preparó el script, se verificó su sintaxis y no se modificó ni desactivó el firewall.

Abrir PowerShell **como administrador** y ejecutar:

```powershell
& 'D:\SistemaHidrológico\tools\configure-hardware-firewall.ps1'
```

La regla `SITPA-MQTT-TLS-Local` permite únicamente el ejecutable Node actual, TCP 8883, la IP configurada y clientes de la subred local. No abre la web, el backend HTTP ni MQTT sin TLS. Si ya existe esa regla específica, el script la actualiza. No requiere cambiar la clasificación pública/privada de la red ni redirigir puertos en el router.

Comando de retirada, también como administrador, cuando deje de usarse el banco local:

```powershell
Remove-NetFirewallRule -Name 'SITPA-MQTT-TLS-Local'
```

## Al conectar el ESP32

1. Confirmar modelo: la compilación actual es para **ESP32 clásico**, FQBN `esp32:esp32:esp32`. No se ha identificado una placa física; ESP32-S3/C3 u otra variante requieren revisar placa y pines antes de cargar.
2. Conectar mediante un cable USB de datos y comprobar el COM con `.\.tools\arduino-cli\arduino-cli.exe board list`. Cerrar cualquier monitor serie antes de cargar.
3. Confirmar el cableado y polaridad de la tabla de `SITPA_02_OPERACION.md`: DHT11 GPIO16, FC-37 AO36, TRIG18/ECHO19, OLED21/22, LEDs25/26/27, buzzer23 activo HIGH. La fuente no identifica el modelo eléctrico exacto del ultrasónico ni del relé: revisar alimentación y niveles de señal del módulo real antes de conectarlos al ESP32.
4. Con PC y ESP32 en la misma red, iniciar `npm run hardware`. El primer arranque del ESP32 requiere poder sincronizar hora por NTP para validar el certificado; sin hora válida conserva la alarma local pero espera antes de iniciar MQTT TLS.
5. Cargar solo después de confirmar modelo y COM. Ejemplo con **COM5 como marcador**, que debe reemplazarse por el puerto real:

```powershell
./tools/upload-firmware.ps1 -Port COM5
```

El script rechaza un COM ausente antes de compilar/escribir, recompila los fuentes y configuración actuales y carga esa compilación. No selecciona una placa automáticamente. Para monitor serie:

```powershell
.\.tools\arduino-cli\arduino-cli.exe monitor --port COM5 --config baudrate=115200
```

6. Comprobar sensores y estados con distancias conocidas, buzzer/OLED/LEDs, pérdida de Wi-Fi/broker, eco inválido y recuperación. Medir la frecuencia física durante al menos 60 s. El checklist detallado está en la guía de operación.

## Si cambia la red o la IP del PC

El ESP32 debe alcanzar al PC en la red Wi-Fi guardada; no se pudo comprobar el SSID actual desde Windows por su permiso de ubicación, y no se modificó ese permiso. La IP actual puede cambiar por DHCP. Si cambia, ejecutar con la nueva IPv4 del PC:

```powershell
npm run prepare:hardware -- --host NUEVA_IPV4
./tools/compile-firmware.ps1 -UseLocalSecrets
```

La preparación conserva las cuentas y la CA, reemite el certificado si cambia la IP, actualiza backend/firmware y sincroniza los headers del IDE. Si se necesita otra contraseña Wi-Fi, modificar el archivo privado principal y repetir la preparación. Actualizar la regla del firewall y volver a cargar la placa. La comunicación entre clientes debe estar permitida en el router/punto de acceso.

El certificado del servidor dura un año y la CA cinco; el chequeo avisa cuando no son válidos. La generación evita renovar silenciosamente una CA próxima a caducar porque esa renovación exige actualizar el ESP32.

## Evidencias y límites

- **27 pruebas aprobadas**: las 21 anteriores más cinco casos TLS y su prueba contenedora. Se rechazaron contraseña incorrecta, CA no confiable, nombre incorrecto, Last Will no autorizado, suscripciones excesivas y publicación fuera de permisos. También se comprobó MQTTS → SQLite → WebSocket y Last Will offline.
- Ensayo adicional con las credenciales locales efectivas: estación/backend conectados por TLS verificado, online y offline recibidos, sin guardar mediciones ficticias ni modificar el histórico persistente.
- **Firmware con credenciales compilado correctamente** para `esp32:esp32:esp32`: 1 076 634 bytes de programa (82 %) y 49 164 bytes globales (15 %), con 278 516 bytes restantes para variables locales según Arduino. Los binarios están en `.tools/firmware-ready/`. El manifiesto `sitpa-build.json` identifica los hashes de los fuentes y secretos usados; `check:hardware` confirmó que coinciden con los archivos actuales. Evidencia local: `.tools/firmware-configured-compile.log` y `.tools/hardware-readiness.log`.
- Compilación web correcta y `npm audit` con **0 vulnerabilidades** notificadas.
- No hay puerto serial detectado. La autenticación Wi-Fi real, firewall desde otro dispositivo, niveles eléctricos, sensores, buzzer y cadencia física quedan pendientes de hardware. El script del firewall no se ejecutó con privilegios.
- La estación real sigue sin lecturas y ningún horizonte de pronóstico hidrológico se habilitó. La frecuencia aproximada de 1 Hz medida con simulador no sustituye la comprobación física.
- El PC debe permanecer encendido y ejecutar el servicio para este banco local. Aedes conserva mensajes retenidos en memoria; el histórico está en SQLite. Este modo no constituye un despliegue remoto permanente.
- Se conserva el Wi-Fi anterior por indicación del usuario; su eventual renovación y la revocación de la antigua clave ThingSpeak no se pueden realizar desde estos archivos. Las claves MQTT recién generadas son independientes.

No se ha realizado upload, push, publicación web, apertura del router ni instalación de certificados globales.
