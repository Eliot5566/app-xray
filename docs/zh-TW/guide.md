# App X-Ray 使用指南

[README](../../README.md) · [English](../en/guide.md)

這份指南說明 App X-Ray 能讀哪些檔案、會套用哪些規則、輸出哪些報告檔，以及怎麼在 CI 比較兩個版本。只想一分鐘上手的話，看 README 就夠了。

- [輸出檔案](#輸出檔案)
- [桌面 App（Electron）](#桌面-appelectron)
- [Android App（APK）](#android-appapk)
- [Go 與 Rust 執行檔](#go-與-rust-執行檔)
- [AI 模型檔](#ai-模型檔)
- [比較兩個版本](#比較兩個版本)
- [嚴重程度](#嚴重程度)
- [限制](#限制)
- [圖鑑與測試語料](#圖鑑與測試語料)

## 輸出檔案

`xray scan <路徑> --out <資料夾>` 會寫出：

| 檔案 | 內容 |
| --- | --- |
| `xray.json` | 所有事實與發現，格式為 `app-xray/report@0`。每一項都記著它來自哪個檔案（知道的話也記行號） |
| `report.html` | 一頁獨立的報告：發現、網址，以及依輸入類型而定的章節 |
| `card.png`、`card.svg` | 1200×630 的摘要圖卡，用於連結預覽與社群貼文（`card.png` 需要預設會安裝的選用套件 `@resvg/resvg-js`） |
| `badge.svg` | README 徽章，例如 `app x-ray | 2 high` |

報告的 `engine` 欄位標示由誰產生：Electron App 與執行檔是 `rea-agents`（由 REA 分析），APK 與模型檔則是 `app-xray` 自己讀取。

## 桌面 App（Electron）

可以指向安裝資料夾（`C:\Program Files\Signal`）、macOS 的 .app（`/Applications/Signal.app`）、`app.asar`，或原始碼資料夾。已安裝的 App 只分析它自己的程式（`resources/app.asar` 或 `resources/app`），Electron 與 Chromium 版本和 fuses 則從執行檔讀取。

| 規則 | 回報內容 |
| --- | --- |
| `electron-support` | Electron（以及內建 Chromium）的版本，以及是否仍在支援範圍內（最新三個主版本） |
| `electron-fuses` | 打包好的 App 中仍為寬鬆設定的 fuses，例如 `RunAsNode` 或關閉的 ASAR 完整性檢查 |
| `electron-web-preferences` | 削弱隔離的 `nodeIntegration`、`contextIsolation`、`webSecurity`、`sandbox` 等設定 |
| `remote-content` | 在 App 視窗中載入的遠端網頁；若同時有視窗削弱隔離，提升為 high |
| `ipc-sender-validation` | 主行程中沒有檢查訊息來源頁面的 IPC handler |
| `dynamic-ipc-channels` | 在執行時才決定頻道名稱的 IPC 呼叫 |
| `known-services` | 已知的分析、錄影回放、廣告與錯誤回報服務的網址 |
| `plain-http` | 以未加密 HTTP 連線的遠端網址 |
| `local-data` | App 在裝置上儲存資料的位置（僅供參考） |
| `native-addons` | App 載入的原生擴充模組（僅供參考） |

如果路徑在原始碼專案裡（git repo 或套件 workspace），測試、stories、建置工具與壓縮或自動產生的檔案會被排除，報告會寫出排除了幾個。加上 `--all-files` 可以保留它們。

400 個以上原始檔的 App 會依 CPU 核心數平行分批分析再合併，比單次執行更快，也能保留更多事實（單次執行可能碰到 REA 的結果上限）。報告會註明跨批次的關聯（例如 IPC 的送出端與處理端）可能不完整。

Electron 支援資料是 `data/electron-releases.json` 的快照，服務特徵在 `data/trackers.json`，都是純 JSON，方便檢查與擴充。

## Android App（APK）

`xray scan app.apk` 直接讀取 APK，不需要 Java、反編譯器或 REA，多數 App 在一秒內完成。

| 規則 | 回報內容 |
| --- | --- |
| `android-sdks` | 編譯進 App 的分析、廣告、錄影回放與錯誤回報 SDK，依類別名稱辨識（`data/android-sdks.json`） |
| `android-permissions` | 需要使用者授權的敏感權限，例如位置、相機、聯絡人或簡訊 |
| `android-manifest` | `debuggable` 建置、允許明文 HTTP、目標 API 低於 Google Play 最低要求、可讀取廣告 ID、允許備份，以及對其他 App 開放的元件 |
| `known-services` | DEX 字串表中已知追蹤服務的網址 |

報告也會列出程式中所有網址、所有權限、元件數量、原生函式庫，以及 App 是否以 Flutter、React Native、Unity、Xamarin、Cordova 或 Capacitor 開發。DEX 以外的程式（Dart、JavaScript bundle、C#）不會分析；用 R8/ProGuard 混淆的 App 可能因類別改名而藏住 SDK，報告會註明。目前不支援 split APK 與 `.aab`。

## Go 與 Rust 執行檔

`xray scan` 也可以指向編譯好的程式。Go 執行檔內含模組清單與建置設定；用 [cargo-auditable](https://github.com/rust-secure-code/cargo-auditable) 建置的 Rust 執行檔內含 crate 清單。兩者都由 REA 讀取（`inspect-go-binary`、`inspect-rust-binary`）。

| 規則 | 回報內容 |
| --- | --- |
| `go-support` | Go 工具鏈版本，以及該版本是否仍有安全更新（`data/go-releases.json`） |
| `go-build` | 以未提交的修改建置、使用 cgo，以及被換成分支或本地副本的模組 |
| `known-vulnerabilities` | 加上 `--osv` 時：在 [OSV](https://osv.dev) 有公告的函式庫版本（含 Go 標準函式庫） |

```bash
xray scan ./mytool --osv
```

`--osv` 只會把套件名稱與版本送到 `api.osv.dev`。不加的話掃描完全離線，報告會寫「未檢查弱點」。執行檔中的網址也會讀出來，所以 `known-services` 一樣有效。沒有 Go 建置資訊或 cargo-auditable 資料的執行檔仍會列出網址，並註明函式庫未知。

## AI 模型檔

`xray scan model.gguf`（或下載下來的 Hugging Face 模型資料夾）只讀檔頭，不載入權重、不執行任何東西：

| 規則 | 回報內容 |
| --- | --- |
| `model-pickle` | 以 pickle 儲存的檔案（`.pt`、`.bin`、`.ckpt`、`.pkl`）在載入時會呼叫的所有函式。`os.system`、`subprocess`、`eval` 等為 high；一般 PyTorch／NumPy 檔不會用到的為 medium |
| `model-chat-template` | 試圖碰觸 Python 內部（`__globals__`、`popen`…）、含有網址，或藏了不可見字元的 GGUF chat template |
| `model-format` | 檔頭無法完整讀取的檔案 |

pickle 會逐個指令檢查，絕不實際反序列化。報告也會列出每個檔案的格式、大小、參數量、架構、量化方式或資料型別、上下文長度與授權，並完整顯示 GGUF 的 chat template。

## 比較兩個版本

`xray diff` 比較同一個 App 的兩份報告，列出審查者該注意的變化：新的伺服器網域、新套件（npm 套件、Go 模組、Rust crate）、新的追蹤服務或 SDK、新的 Android 權限、函式庫版本變化、新的 high／medium 發現、Electron fuses 變化，以及 Electron 升級或降級。任何兩份同類型的報告都能比較，例如兩個 APK 版本。

```bash
xray scan old-release/ --out before
xray scan new-release/ --out after
xray diff before after                       # Markdown，可直接貼成 PR 留言
xray diff before after --format json
xray diff before after --fail-on new-host,new-service   # 任一發生就以代碼 1 結束
```

### GitHub Action

加到 App 的 repo 後，每個改變了 App 連線對象或內容的 PR 都會收到一則留言。`path` 是 repo 裡的資料夾或檔案，會在 PR 的 base 與 head 各掃一次（例如 Electron App 的原始碼資料夾，或放在 repo 裡的模型檔）：

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
          path: .                 # App 的 package.json 所在資料夾
          fail-on: new-service    # 選填
```

Action 會掃描 PR 的 base 與 head，發一則留言（之後每次 push 都更新同一則），並把相同摘要寫到 job 頁面。輸出為 `changed`（`true` 或 `false`）與 `report`（Markdown 摘要的路徑）。

| `fail-on` 條件 | 何時失敗 |
| --- | --- |
| `new-host` | 出現 base 沒有的伺服器網域 |
| `new-service` | 出現已知的追蹤、分析、廣告或錯誤回報 SDK |
| `new-package` | 出現新的套件、Go 模組或 Rust crate |
| `new-permission` | 出現新的 Android 權限 |
| `new-serious` | 出現新的 high 或 medium 發現 |
| `electron-downgrade` | Electron 版本降低 |

## 嚴重程度

| 等級 | 意義 |
| --- | --- |
| high | 出貨狀態下就可能被利用或明顯不安全：早已停止支援的 Electron、搭配遠端內容的 `nodeIntegration`、debuggable 的 APK、載入時會執行 `os.system` 的 pickle |
| medium | 值得審查者注意：廣告或錄影回放 SDK、不再支援的 Go、非標準的 pickle 匯入、含網址或隱藏文字的 chat template |
| low | 在意隱私或安全的使用者可能想知道的背景：分析與錯誤回報、敏感的 Android 權限、明文 HTTP |
| info | 不帶評價的事實：仍受支援的版本、備份、cgo、乾淨的 pickle |

發現代表程式或檔案「含有」某樣東西，不代表 App 執行時「一定會」那樣做。

## 限制

- 只做靜態分析，不會執行 App。
- 只看得到字面上的值，執行時才組出來的網址會漏掉。
- Electron 版本來自 `package.json`、macOS 的 `Electron Framework.framework`、Windows／Linux 執行檔內的 user-agent 字串（也提供 Chromium 版本），或 Electron 的 `version` 檔。
- APK 只讀 DEX 程式；Flutter、React Native、Unity、Xamarin 的程式不讀，R8/ProGuard 改名可能藏住 SDK。目前不支援 split APK 與 `.aab`。
- 執行檔的函式庫只能從 Go 建置資訊或 cargo-auditable 資料得知。
- 模型檔只讀檔頭；pickle 只列出它宣告的匯入，不會執行。
- 以 `rea-agents` 6.7.0 測試（版本固定）。

## 圖鑑與測試語料

公開圖鑑 <https://eliot5566.github.io/app-xray/> 收錄 `bench/corpus.json` 中開源 App 的報告。每項發現都連到 GitHub 上的確切行數，每頁都有連結預覽圖與給維護者的 README 徽章語法。`gallery` workflow 每週一重建。

在本機從任何掃描輸出資料夾建置：

```bash
npm run bench                                   # 把語料掃描到 bench-out/
node dist/cli.js gallery bench-out --out site   # 寫出 site/index.html
```

`bench/corpus.json` 列了 20 個開源 Electron App。`npm run bench` 會逐一 clone、掃描，並把耗時與發現寫到 `bench-out/summary.md`。

開發 App X-Ray 本身：`npm install`、`npm test`、`node dist/cli.js scan …`。
