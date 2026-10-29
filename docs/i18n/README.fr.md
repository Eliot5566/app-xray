# App X-Ray

**L'étiquette de composition et de confidentialité de n'importe quelle app, en une commande.**

[English](../../README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · Français · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

App X-Ray analyse une application de bureau, un APK Android, un programme Go ou Rust, ou des fichiers de modèles d'IA, et produit un rapport HTML d'une page, facile à partager : quel framework et quelle version l'app embarque, si cette version reçoit encore des correctifs de sécurité, quels SDK d'analyse, de publicité ou de rapport de plantage elle contient, avec quelles adresses elle communique et quels réglages affaiblissent sa sécurité. Chaque ligne indique le fichier d'où elle provient.

L'analyse est faite par [REA (Reverse Engineer Anything)](https://github.com/morluto/rea) ; App X-Ray transforme ses preuves en un rapport lisible par tous.

Sans installation (Node.js 22 ou plus récent) :

```bash
npx app-xray scan /chemin/vers/app
# ouvrir xray-out/report.html
```

| Vous avez | Indiquez |
| --- | --- |
| Une app installée sous Windows ou Linux | son dossier d'installation, p. ex. `C:\Program Files\Signal` |
| Une app installée sous macOS | le bundle, p. ex. `/Applications/Signal.app` |
| Un `app.asar` | le fichier lui-même |
| Le code source | le dossier de l'app dans le dépôt |
| Une app Android | le fichier `.apk` |
| Un programme Go ou Rust | l'exécutable (ELF, PE ou Mach-O) |
| Un modèle d'IA | un fichier `.gguf`, `.safetensors`, `.pt`/`.pth`/`.bin`/`.ckpt` ou `.pkl`, ou un dossier qui en contient |

Dans `xray-out/` : `xray.json` (tous les faits et constats), `report.html` (le rapport à partager), `card.png`/`card.svg` (image de synthèse 1200×630) et `badge.svg` (badge pour le README).

## Ce qu'il détecte

| Entrée | Points clés |
| --- | --- |
| Apps Electron | Version d'Electron/Chromium et support, fuses, `webPreferences` qui affaiblissent l'isolation, pages distantes, IPC sans vérification de l'émetteur, traqueurs, HTTP non chiffré |
| APK Android | SDK d'analyse, de publicité, d'enregistrement de session et de plantage, permissions sensibles, builds débogables, HTTP non chiffré, API cible ancienne, identifiant publicitaire, composants exposés |
| Exécutables Go/Rust | Bibliothèques embarquées et leurs versions, Go non supporté, builds depuis des modifications non commitées ; vulnérabilités connues avec `--osv` |
| Modèles | Pickles qui exécutent du code au chargement, imports pickle inhabituels, modèles de chat GGUF qui tentent de sortir du bac à sable ou cachent des adresses et du texte |

Toutes les règles, le format du rapport et les limites sont décrits dans le [guide (en anglais)](../en/guide.md).

## Comparer des versions en CI

`xray diff before/ after/` liste les nouveaux hôtes, paquets, SDK, permissions, versions de bibliothèques et constats entre deux analyses. En tant que GitHub Action, il commente chaque pull request.

## Galerie

Rapports d'apps open source : <https://eliot5566.github.io/app-xray/> (mis à jour chaque lundi).

## Utilisation responsable

Analyse statique uniquement : l'app n'est jamais exécutée. N'analysez que des logiciels qui vous appartiennent ou que vous êtes autorisé à examiner, et respectez l'[avertissement](https://github.com/morluto/rea/blob/main/DISCLAIMER.md) de REA. Les rapports décrivent des composants et des faits ; ils n'incluent jamais le code de l'app.

Licence : MIT
