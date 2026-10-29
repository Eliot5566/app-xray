# App X-Ray

**An ingredients and privacy label for any app, in one command.**
**任何 App 的成分標示，一個指令產生。**

English · [繁體中文](docs/i18n/README.zh-TW.md) · [简体中文](docs/i18n/README.zh-CN.md) · [日本語](docs/i18n/README.ja.md) · [한국어](docs/i18n/README.ko.md) · [Español](docs/i18n/README.es.md) · [Français](docs/i18n/README.fr.md) · [Deutsch](docs/i18n/README.de.md) · [Português](docs/i18n/README.pt-BR.md)

App X-Ray scans a desktop app, an Android APK, a Go or Rust program, or AI model
files, and writes a single, shareable HTML report: which framework and version it
ships, whether that version still gets security fixes, which analytics, advertising
or crash-reporting SDKs it contains, which network addresses it talks to, and the
settings that weaken its security. Every line links back to the file it came from.

It is built on [REA (Reverse Engineer Anything)](https://github.com/morluto/rea),
which does the analysis. App X-Ray turns REA's evidence into something anyone can
read.

No install step needed (Node.js 22 or newer):

```bash
npx github:Eliot5566/app-xray scan /path/to/app
# open xray-out/report.html
```

`/path/to/app` can be any of these:

| You have | Point xray at |
| --- | --- |
| An installed app on Windows or Linux | its install folder, e.g. `C:\Program Files\Signal` |
| An installed app on macOS | the bundle, e.g. `/Applications/Signal.app` |
| An `app.asar` | the file itself |
| A source checkout | the app's folder in the repo |
| An Android app | the `.apk` file |
| A Go or Rust program | the executable (ELF, PE or Mach-O) |
| AI model weights | a `.gguf`, `.safetensors`, `.pt`/`.pth`/`.bin`/`.ckpt` or `.pkl` file, or a folder of them |

For an installed app, only the app inside it (`resources/app.asar` or
`resources/app`) is analyzed, not Electron itself; the Electron and Chromium
versions and the fuses are read from the executable.

Output in `xray-out/`:

- `xray.json`: the facts and findings (schema `app-xray/report@0`)
- `report.html`: one self-contained page you can share
- `card.png` and `card.svg`: a 1200×630 summary image for social posts
- `badge.svg`: a README badge, e.g. `app x-ray | 2 high`

## What it finds

| Input | Highlights |
| --- | --- |
| Electron apps | Electron/Chromium version and support status, fuses, `webPreferences` that weaken isolation, remote pages, IPC handlers without sender checks, trackers, plain HTTP |
| Android APKs | Analytics/ad/session-recording/crash SDKs, sensitive permissions, debuggable builds, cleartext HTTP, outdated target API, advertising ID, exported components |
| Go / Rust executables | Compiled-in libraries and versions, unsupported Go releases, uncommitted-source builds; known vulnerabilities with `--osv` |
| Model files | Pickles that run code when loaded, non-standard pickle imports, GGUF chat templates that escape their sandbox or hide addresses and text |

Every rule, the report format and the limits are in the [guide](docs/en/guide.md)
([繁體中文](docs/zh-TW/guide.md)).

## Compare versions in CI

`xray diff before/ after/` lists new hosts, packages, SDKs, permissions, library
versions and findings between two scans. As a GitHub Action it comments on every
pull request:

```yaml
# .github/workflows/app-xray.yml
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  xray:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Eliot5566/app-xray@main
        with:
          path: .                 # the folder with the app's package.json
          fail-on: new-service    # optional
```

See [Compare two versions](docs/en/guide.md#compare-two-versions) for every option.

## Gallery

The public gallery at <https://eliot5566.github.io/app-xray/> lists reports for
the open-source apps in `bench/corpus.json`. Each report links every finding to
the exact line on GitHub, and each page has a link preview image and a README badge
snippet for the app's maintainers. The `gallery` workflow rebuilds it every Monday.

Build it locally from any folder of scan outputs:

```bash
npm run bench                                   # scans the corpus into bench-out/
node dist/cli.js gallery bench-out --out site   # writes site/index.html
```

[REA-Bench](bench/rea-bench/) turns the same reports into questions for coding
agents and grades their answers, to compare agents with and without REA's tools.

To work on App X-Ray itself: `npm install`, `npm test`, `node dist/cli.js scan …`.

## Responsible use

Analyze only software you own or are authorized to examine, and follow REA's
[disclaimer](https://github.com/morluto/rea/blob/main/DISCLAIMER.md). Reports
describe components and facts; they never include the app's code.

The summary card bundles the [Inter](https://github.com/rsms/inter) typeface
(`data/fonts`, SIL Open Font License 1.1).

## License

MIT
