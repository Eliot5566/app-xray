# App X-Ray

**An ingredients and privacy label for any app, in one command.**
**任何 App 的成分標示，一個指令產生。**

App X-Ray scans a desktop app and writes a single, shareable HTML report: which
framework and version it ships, whether that version still gets security fixes,
which analytics or crash-reporting services it contains, which network addresses
it talks to, and how its windows are configured. Every line links back to the file
and line it came from.

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

For an installed app, only the app inside it (`resources/app.asar` or
`resources/app`) is analyzed, not Electron itself; the Electron and Chromium
versions and the fuses are read from the executable.

Output in `xray-out/`:

- `xray.json`: the facts and findings (schema `app-xray/report@0`)
- `report.html`: one self-contained page you can share
- `card.png` and `card.svg`: a 1200×630 summary image for social posts
- `badge.svg`: a README badge, e.g. `app x-ray | 2 high`

## Compare two versions

`xray diff` compares two reports of the same app and lists what a reviewer should
look at: new server hosts, new packages, new trackers or SDKs, new high or medium
findings, changed Electron fuses and Electron upgrades or downgrades.

```bash
xray scan old-release/ --out before
xray scan new-release/ --out after
xray diff before after                       # markdown, ready for a PR comment
xray diff before after --format json
xray diff before after --fail-on new-host,new-service   # exit 1 if either happened
```

### GitHub Action

Add this to an Electron app's repository to get a comment on every pull request
that changes what the app talks to or ships:

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
          fail-on: new-service          # optional: new-host, new-service, new-package, new-serious, electron-downgrade
```

The action scans the pull request's base commit and its head, posts one comment
(updated on each push) and writes the same summary to the job page.

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

To work on App X-Ray itself: `npm install`, `npm test`, `node dist/cli.js scan …`.

## What it checks today (v0.7)

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

## Limits

- Static analysis only. The app is never run. A finding means the code *contains*
  something, not that it *does* it at runtime.
- Only literal values are seen. Addresses built at runtime are missed.
- Electron version comes from `package.json`, macOS `Electron Framework.framework`,
  the user-agent string inside a packaged Windows/Linux executable (which also
  gives the bundled Chromium version), or Electron's `version` file.
- Tested with `rea-agents` 6.7.0 (pinned).

## Corpus benchmark

`bench/corpus.json` lists 20 open-source Electron apps. `npm run bench` clones
each one, scans it and writes `bench-out/summary.md` with timings and findings.

## Responsible use

Analyze only software you own or are authorized to examine, and follow REA's
[disclaimer](https://github.com/morluto/rea/blob/main/DISCLAIMER.md). Reports
describe components and facts; they never include the app's code.

The summary card bundles the [Inter](https://github.com/rsms/inter) typeface
(`data/fonts`, SIL Open Font License 1.1).

## 中文說明

App X-Ray 用 REA 分析桌面 App，輸出一頁可分享的 HTML 報告、一張可貼到社群的摘要圖卡（card.png）和 README 徽章，內容包括框架與版本、該版本是否仍有安全更新、內嵌的分析／追蹤服務、連線網域，以及視窗安全設定。每一項都標出它來自哪個檔案的哪一行。

用法：`npx github:Eliot5566/app-xray scan <App 路徑>`。`xray diff` 可以比較兩個版本，列出新增的連線網域、套件、追蹤服務與安全設定變化；也可以當 GitHub Action 使用，在每個 PR 自動留言。開源 App 的報告圖鑑在 <https://eliot5566.github.io/app-xray/>，每週一自動更新。路徑可以是 Windows／Linux 的安裝資料夾、macOS 的 .app、app.asar，或原始碼資料夾。

只做靜態分析，不會執行目標 App。請只分析自己擁有或有權檢查的軟體。

## License

MIT
