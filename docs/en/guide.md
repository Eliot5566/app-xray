# App X-Ray guide

[README](../../README.md) · [繁體中文](../zh-TW/guide.md)

This guide covers every input App X-Ray understands, every rule it applies, the
report files, and how to compare versions in CI. For a one-minute start, see the
README.

- [Output files](#output-files)
- [Desktop apps (Electron)](#desktop-apps-electron)
- [Android apps (APK)](#android-apps-apk)
- [Go and Rust executables](#go-and-rust-executables)
- [Model files](#model-files)
- [Compare two versions](#compare-two-versions)
- [Severity levels](#severity-levels)
- [Limits](#limits)
- [Gallery and corpus](#gallery-and-corpus)

## Output files

`xray scan <path> --out <dir>` writes:

| File | What it is |
| --- | --- |
| `xray.json` | Every fact and finding, schema `app-xray/report@0`. Each fact keeps the file (and line, when known) it came from |
| `report.html` | One self-contained page: findings, addresses, and the sections for the kind of input |
| `card.png`, `card.svg` | A 1200×630 summary image for link previews and social posts (`card.png` needs the optional `@resvg/resvg-js`, installed by default) |
| `badge.svg` | A README badge such as `app x-ray | 2 high` |

The report's `engine` field says what produced it: `rea-agents` for Electron apps
and executables (analysis by REA), or `app-xray` for APKs and model files, which
are read natively.

## Desktop apps (Electron)

Point `xray scan` at an install folder (`C:\Program Files\Signal`), a macOS
bundle (`/Applications/Signal.app`), an `app.asar`, or a source checkout. For an
installed app only the app's own code (`resources/app.asar` or `resources/app`) is
analyzed; the Electron and Chromium versions and the fuses are read from the
executable.

| Rule | What it reports |
| --- | --- |
| `electron-support` | Electron (and bundled Chromium) version, and whether it is in the supported window (latest three majors) |
| `electron-fuses` | Packaged apps: fuses left permissive, such as `RunAsNode` or disabled ASAR integrity checks |
| `electron-web-preferences` | `nodeIntegration`, `contextIsolation`, `webSecurity`, `sandbox` and similar settings that weaken isolation |
| `remote-content` | Remote pages loaded into app windows, raised to high when some window also weakens isolation |
| `ipc-sender-validation` | Main-process IPC handlers with no check of which page sent the message |
| `dynamic-ipc-channels` | IPC calls whose channel name is chosen at runtime |
| `known-services` | Addresses of known analytics, session-recording, advertising and crash-reporting services |
| `plain-http` | Remote addresses reached over unencrypted HTTP |
| `local-data` | Where the app stores data on the device (informational) |
| `native-addons` | Native add-ons the app loads (informational) |

When `<app-path>` is inside a source checkout (a git repository or package
workspace), tests, stories, build tooling and minified or generated bundles are
left out, and the report says how many. Pass `--all-files` to keep them.

Apps with 400 or more source files are analyzed in parallel batches, one per
CPU core, and the results are merged. This is faster and keeps more facts than a
single run, which can hit REA's result budget; the report notes that links
between batches, such as an IPC send and its handler, may be incomplete.

Electron support data is a snapshot in `data/electron-releases.json`; service
signatures live in `data/trackers.json`. Both are plain JSON so they are easy to
review and extend.

## Android apps (APK)

`xray scan app.apk` reads an APK directly, with no Java, decompiler or REA run, in
well under a second for most apps. It reports:

| Rule | What it reports |
| --- | --- |
| `android-sdks` | Analytics, advertising, session-recording and crash-reporting SDKs compiled in, recognized by class name (`data/android-sdks.json`) |
| `android-permissions` | Runtime and special-access permissions the app asks for, such as location, camera, contacts or SMS |
| `android-manifest` | `debuggable` builds, cleartext HTTP allowed, a target API below Google Play's minimum, advertising ID access, backups, and components open to other apps |
| `known-services` | Addresses of known tracking services among the URLs in the app's DEX string tables |

The report also lists every literal URL in the code, all permissions, the
component counts, native libraries, and whether the app is built with Flutter,
React Native, Unity, Xamarin, Cordova or Capacitor. Code that runs outside DEX
(Dart, JavaScript bundles, C#) is not analyzed, and apps shrunk with R8/ProGuard
can hide SDKs by renaming their classes; the report says so. Split APKs and
`.aab` bundles are not supported yet.

## Go and Rust executables

Point `xray scan` at a compiled program. Go binaries carry their module list and
build settings, and Rust binaries built with
[cargo-auditable](https://github.com/rust-secure-code/cargo-auditable) carry their
crate list; REA reads both (`inspect-go-binary`, `inspect-rust-binary`).

| Rule | What it reports |
| --- | --- |
| `go-support` | The Go toolchain version, and whether that release still gets security fixes (`data/go-releases.json`) |
| `go-build` | Built from uncommitted changes, cgo in use, and modules replaced with forks or local copies |
| `known-vulnerabilities` | With `--osv`: libraries (and the Go standard library) whose exact version has an advisory in [OSV](https://osv.dev) |

```bash
xray scan ./mytool --osv
```

`--osv` sends package names and versions, nothing else, to `api.osv.dev`. Without
it the scan stays offline and the report says vulnerabilities were not checked.
Literal URLs are also read from the binary's bytes, so `known-services` works here
too. Binaries without Go build info or cargo-auditable data still get an address
list, and the report says the libraries are unknown.

## Model files

`xray scan model.gguf` (or a downloaded Hugging Face folder) reads model headers
without loading any weights or running anything:

| Rule | What it reports |
| --- | --- |
| `model-pickle` | Pickle-based files (`.pt`, `.bin`, `.ckpt`, `.pkl`): every callable the file imports when loaded. `os.system`, `subprocess`, `eval` and similar are high; anything an ordinary PyTorch/NumPy checkpoint would not use is medium |
| `model-chat-template` | GGUF chat templates that try to reach Python internals (`__globals__`, `popen`…), contain URLs, or hide invisible characters |
| `model-format` | Files whose header could not be fully read |

Pickles are walked opcode by opcode and never unpickled. The report also lists
each file's format, size, parameter count, architecture, quantization or dtypes,
context length and license, and shows GGUF chat templates in full.

## Compare two versions

`xray diff` compares two reports of the same app and lists what a reviewer should
look at: new server hosts, new packages (npm packages, Go modules, Rust crates),
new trackers or SDKs, new Android permissions, changed library versions, new high
or medium findings, changed Electron fuses and Electron upgrades or downgrades.
It works on any two reports of the same kind, e.g. two APK builds.

```bash
xray scan old-release/ --out before
xray scan new-release/ --out after
xray diff before after                       # markdown, ready for a PR comment
xray diff before after --format json
xray diff before after --fail-on new-host,new-service   # exit 1 if either happened
```

### GitHub Action

Add this to an app's repository to get a comment on every pull request that
changes what the app talks to or ships. `path` is a folder or file in the
repository, scanned at the pull request's base and head commits (for example an
Electron app's source folder, or a checked-in model file):

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
          path: .                       # the folder with the app's package.json
          fail-on: new-service          # optional: new-host, new-service, new-package, new-permission, new-serious, electron-downgrade
```

The action scans the pull request's base commit and its head, posts one comment
(updated on each push) and writes the same summary to the job page. Its outputs
are `changed` (`true` or `false`) and `report` (the path of the markdown summary).

| `fail-on` condition | Fails when |
| --- | --- |
| `new-host` | a server host appears that the base did not have |
| `new-service` | a known tracker, analytics, advertising or crash SDK appears |
| `new-package` | a package, Go module or Rust crate appears |
| `new-permission` | an Android permission appears |
| `new-serious` | a new high or medium finding appears |
| `electron-downgrade` | the Electron version goes down |

## Severity levels

| Level | Meaning |
| --- | --- |
| high | Likely exploitable or plainly unsafe as shipped: an Electron release long out of support, `nodeIntegration` with remote content, a debuggable APK, a pickle that runs `os.system` on load |
| medium | Worth a reviewer's attention: advertising or session-recording SDKs, unsupported Go, non-standard pickle imports, chat templates with addresses or hidden text |
| low | Context a privacy- or security-minded user may care about: analytics and crash reporting, sensitive Android permissions, plain HTTP |
| info | Facts without a judgment: supported versions, backups, cgo, clean pickles |

A finding means the code or file *contains* something. It does not prove the app
does it at runtime.

## Limits

- Static analysis only. The app is never run. A finding means the code *contains*
  something, not that it *does* it at runtime.
- Only literal values are seen. Addresses built at runtime are missed.
- Electron version comes from `package.json`, macOS `Electron Framework.framework`,
  the user-agent string inside a packaged Windows/Linux executable (which also
  gives the bundled Chromium version), or Electron's `version` file.
- APKs: only DEX code is read; Flutter, React Native, Unity and Xamarin code is
  not, and R8/ProGuard renaming can hide SDKs. Split APKs and `.aab` are not
  supported yet.
- Executables: libraries are known only from Go build info or cargo-auditable data.
- Model files: headers only; pickles are listed as declared, not executed.
- Tested with `rea-agents` 6.7.0 (pinned).

## Gallery and corpus

The public gallery at <https://eliot5566.github.io/app-xray/> lists reports for
the open-source apps in `bench/corpus.json`. Each report links every finding to
the exact line on GitHub, and each page has a link preview image and a README badge
snippet for the app's maintainers. The `gallery` workflow rebuilds it every Monday.

Build it locally from any folder of scan outputs:

```bash
npm run bench                                   # scans the corpus into bench-out/
node dist/cli.js gallery bench-out --out site   # writes site/index.html
```

`bench/corpus.json` lists 20 open-source Electron apps. `npm run bench` clones
each one, scans it and writes `bench-out/summary.md` with timings and findings.

To work on App X-Ray itself: `npm install`, `npm test`, `node dist/cli.js scan …`.
