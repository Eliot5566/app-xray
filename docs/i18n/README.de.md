# App X-Ray

**Das Zutaten- und Datenschutzetikett für jede App – mit einem Befehl.**

[English](../../README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · Deutsch · [Português](README.pt-BR.md)

App X-Ray untersucht eine Desktop-App, eine Android-APK, ein Go- oder Rust-Programm oder KI-Modelldateien und erstellt einen teilbaren HTML-Bericht auf einer Seite: welches Framework in welcher Version enthalten ist, ob diese Version noch Sicherheitsupdates bekommt, welche Analyse-, Werbe- oder Absturzbericht-SDKs eingebaut sind, mit welchen Adressen die App spricht und welche Einstellungen ihre Sicherheit schwächen. Jede Angabe nennt die Datei, aus der sie stammt.

Die Analyse übernimmt [REA (Reverse Engineer Anything)](https://github.com/morluto/rea); App X-Ray macht aus den Belegen einen Bericht, den jeder lesen kann.

Ohne Installation (Node.js 22 oder neuer):

```bash
npx app-xray scan /pfad/zur/app
# xray-out/report.html öffnen
```

| Sie haben | Geben Sie an |
| --- | --- |
| Eine installierte App unter Windows oder Linux | ihren Installationsordner, z. B. `C:\Program Files\Signal` |
| Eine installierte App unter macOS | das Bundle, z. B. `/Applications/Signal.app` |
| Ein `app.asar` | die Datei selbst |
| Den Quellcode | den Ordner der App im Repository |
| Eine Android-App | die `.apk`-Datei |
| Ein Go- oder Rust-Programm | die ausführbare Datei (ELF, PE oder Mach-O) |
| Ein KI-Modell | eine `.gguf`-, `.safetensors`-, `.pt`/`.pth`/`.bin`/`.ckpt`- oder `.pkl`-Datei oder einen Ordner damit |

In `xray-out/` landen `xray.json` (alle Fakten und Befunde), `report.html` (der teilbare Bericht), `card.png`/`card.svg` (Übersichtsbild 1200×630) und `badge.svg` (README-Badge).

## Was es findet

| Eingabe | Schwerpunkte |
| --- | --- |
| Electron-Apps | Electron-/Chromium-Version und Support-Status, Fuses, `webPreferences`, die die Isolation schwächen, entfernte Seiten, IPC ohne Absenderprüfung, Tracker, unverschlüsseltes HTTP |
| Android-APKs | Analyse-, Werbe-, Sitzungsaufzeichnungs- und Absturz-SDKs, sensible Berechtigungen, debugbare Builds, unverschlüsseltes HTTP, veraltete Ziel-API, Werbe-ID, offene Komponenten |
| Go-/Rust-Programme | Enthaltene Bibliotheken und Versionen, nicht mehr unterstütztes Go, Builds aus nicht committeten Änderungen; bekannte Schwachstellen mit `--osv` |
| Modelldateien | Pickles, die beim Laden Code ausführen, ungewöhnliche Pickle-Importe, GGUF-Chat-Templates, die aus der Sandbox ausbrechen wollen oder Adressen und Text verstecken |

Alle Regeln, das Berichtsformat und die Grenzen stehen im [Leitfaden (Englisch)](../en/guide.md).

## Versionen in CI vergleichen

`xray diff before/ after/` listet neue Hosts, Pakete, SDKs, Berechtigungen, Bibliotheksversionen und Befunde zwischen zwei Scans. Als GitHub Action kommentiert es jeden Pull Request.

## Galerie

Berichte zu Open-Source-Apps: <https://eliot5566.github.io/app-xray/> (jeden Montag aktualisiert).

## Verantwortungsvoller Einsatz

Nur statische Analyse: Die App wird nie ausgeführt. Analysieren Sie nur Software, die Ihnen gehört oder die Sie untersuchen dürfen, und beachten Sie den [Haftungsausschluss](https://github.com/morluto/rea/blob/main/DISCLAIMER.md) von REA. Berichte beschreiben Komponenten und Fakten; sie enthalten nie den Code der App.

Lizenz: MIT
