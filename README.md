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

```bash
npm install
npm run build
node dist/cli.js scan /path/to/app --out xray-out
# open xray-out/report.html
```

`<app-path>` can be an unpacked app directory or an `app.asar`. Output:

- `xray-out/xray.json`: the facts and findings (schema `app-xray/report@0`)
- `xray-out/report.html`: one self-contained page you can share

## What it checks today (v0.1)

| Rule | What it reports |
| --- | --- |
| `electron-support` | Electron version and whether it is in the supported window (latest three majors) |
| `electron-web-preferences` | `nodeIntegration`, `contextIsolation`, `webSecurity`, `sandbox` and similar settings that weaken isolation |
| `known-services` | Addresses of known analytics, session-recording, advertising and crash-reporting services |
| `plain-http` | Remote addresses reached over unencrypted HTTP |

Electron support data is a snapshot in `data/electron-releases.json`; service
signatures live in `data/trackers.json`. Both are plain JSON so they are easy to
review and extend.

## Limits

- Static analysis only. The app is never run. A finding means the code *contains*
  something, not that it *does* it at runtime.
- Only literal values are seen. Addresses built at runtime are missed.
- Electron version comes from `package.json`, a `version` file, or macOS
  `Electron Framework.framework`. Reading it from Windows/Linux binaries is next.
- Tested with `rea-agents` 6.7.0 (pinned).

## Responsible use

Analyze only software you own or are authorized to examine, and follow REA's
[disclaimer](https://github.com/morluto/rea/blob/main/DISCLAIMER.md). Reports
describe components and facts; they never include the app's code.

## 中文說明

App X-Ray 用 REA 分析桌面 App，輸出一頁可分享的 HTML 報告，內容包括框架與版本、該版本是否仍有安全更新、內嵌的分析／追蹤服務、連線網域，以及視窗安全設定。每一項都標出它來自哪個檔案的哪一行。

只做靜態分析，不會執行目標 App。請只分析自己擁有或有權檢查的軟體。

## License

MIT
