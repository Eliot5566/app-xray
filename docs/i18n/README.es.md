# App X-Ray

**La etiqueta de ingredientes y privacidad de cualquier app, con un solo comando.**

[English](../../README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · Español · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

App X-Ray analiza una app de escritorio, un APK de Android, un programa en Go o Rust, o archivos de modelos de IA, y genera un informe HTML de una sola página que se puede compartir: qué framework y versión incluye, si esa versión sigue recibiendo parches de seguridad, qué SDK de analítica, publicidad o reporte de fallos contiene, con qué direcciones se comunica y qué ajustes debilitan su seguridad. Cada dato indica el archivo del que proviene.

El análisis lo hace [REA (Reverse Engineer Anything)](https://github.com/morluto/rea); App X-Ray convierte sus evidencias en algo que cualquiera puede leer.

Sin instalación (Node.js 22 o superior):

```bash
npx app-xray scan /ruta/a/la/app
# abre xray-out/report.html
```

| Tienes | Indica |
| --- | --- |
| Una app instalada en Windows o Linux | su carpeta de instalación, p. ej. `C:\Program Files\Signal` |
| Una app instalada en macOS | el paquete, p. ej. `/Applications/Signal.app` |
| Un `app.asar` | el propio archivo |
| El código fuente | la carpeta de la app en el repositorio |
| Una app de Android | el archivo `.apk` |
| Un programa en Go o Rust | el ejecutable (ELF, PE o Mach-O) |
| Un modelo de IA | un archivo `.gguf`, `.safetensors`, `.pt`/`.pth`/`.bin`/`.ckpt` o `.pkl`, o una carpeta con ellos |

En `xray-out/` se escriben `xray.json` (todos los hechos y hallazgos), `report.html` (el informe para compartir), `card.png`/`card.svg` (imagen resumen de 1200×630) y `badge.svg` (insignia para el README).

## Qué detecta

| Entrada | Lo más destacado |
| --- | --- |
| Apps Electron | Versión de Electron/Chromium y si tiene soporte, fuses, `webPreferences` que debilitan el aislamiento, páginas remotas, IPC sin verificar el remitente, rastreadores, HTTP sin cifrar |
| APK de Android | SDK de analítica, publicidad, grabación de sesiones y fallos, permisos sensibles, builds depurables, HTTP sin cifrar, API de destino antigua, ID de publicidad, componentes expuestos |
| Ejecutables Go/Rust | Bibliotecas incluidas y sus versiones, Go sin soporte, builds con cambios sin confirmar; vulnerabilidades conocidas con `--osv` |
| Modelos | Pickles que ejecutan código al cargarse, imports de pickle poco habituales, plantillas de chat GGUF que intentan salir del sandbox u ocultan direcciones y texto |

Todas las reglas, el formato del informe y los límites están en la [guía (en inglés)](../en/guide.md).

## Comparar versiones en CI

`xray diff before/ after/` muestra los hosts, paquetes, SDK, permisos, versiones de bibliotecas y hallazgos nuevos entre dos análisis. Como GitHub Action, comenta en cada pull request.

## Galería

Informes de apps de código abierto: <https://eliot5566.github.io/app-xray/> (se actualiza cada lunes).

## Uso responsable

Solo análisis estático: la app nunca se ejecuta. Analiza únicamente software que te pertenezca o que tengas autorización para examinar, y respeta el [aviso legal](https://github.com/morluto/rea/blob/main/DISCLAIMER.md) de REA. Los informes describen componentes y hechos; nunca incluyen el código de la app.

Licencia: MIT
