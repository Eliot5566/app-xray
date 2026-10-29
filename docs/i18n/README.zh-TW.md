# App X-Ray

**任何 App 的成分標示，一個指令產生。**

[English](../../README.md) · 繁體中文 · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

App X-Ray 可以掃描桌面 App、Android APK、Go／Rust 程式或 AI 模型檔，輸出一頁可分享的 HTML 報告：用了哪個框架與版本、該版本是否仍有安全更新、內嵌了哪些分析／廣告／錯誤回報 SDK、會連到哪些網址，以及哪些設定削弱了安全性。每一項都標出它來自哪個檔案。

分析由 [REA（Reverse Engineer Anything）](https://github.com/morluto/rea) 完成，App X-Ray 把 REA 的證據整理成任何人都看得懂的報告。

不需要安裝（Node.js 22 以上）：

```bash
npx github:Eliot5566/app-xray scan /path/to/app
# 開啟 xray-out/report.html
```

| 你手上有 | 指向 |
| --- | --- |
| Windows／Linux 已安裝的 App | 安裝資料夾，例如 `C:\Program Files\Signal` |
| macOS 已安裝的 App | .app，例如 `/Applications/Signal.app` |
| `app.asar` | 檔案本身 |
| 原始碼 | repo 中 App 的資料夾 |
| Android App | `.apk` 檔 |
| Go 或 Rust 程式 | 執行檔（ELF、PE 或 Mach-O） |
| AI 模型 | `.gguf`、`.safetensors`、`.pt`/`.pth`/`.bin`/`.ckpt`、`.pkl` 檔，或放這些檔案的資料夾 |

輸出到 `xray-out/`：`xray.json`（所有事實與發現）、`report.html`（可分享的單頁報告）、`card.png`／`card.svg`（1200×630 摘要圖卡）、`badge.svg`（README 徽章）。

## 會找出什麼

| 輸入 | 重點 |
| --- | --- |
| Electron App | Electron／Chromium 版本與支援狀態、fuses、削弱隔離的 `webPreferences`、遠端網頁、沒檢查來源的 IPC、追蹤服務、明文 HTTP |
| Android APK | 分析／廣告／錄影回放／錯誤回報 SDK、敏感權限、debuggable、明文 HTTP、過舊的目標 API、廣告 ID、對外開放的元件 |
| Go／Rust 執行檔 | 內含的函式庫與版本、不再支援的 Go 版本、以未提交修改建置；加 `--osv` 可查已知弱點 |
| 模型檔 | 載入時會執行程式的 pickle、非標準的 pickle 匯入、會逃出沙箱或藏網址與文字的 GGUF chat template |

所有規則、報告格式與限制請見[使用指南](../zh-TW/guide.md)。

## 在 CI 比較版本

`xray diff before/ after/` 會列出兩次掃描之間新增的網域、套件、SDK、權限、函式庫版本與發現。當成 GitHub Action 使用時，會在每個 PR 自動留言，詳見[指南](../zh-TW/guide.md#比較兩個版本)。

## 圖鑑

開源 App 的報告圖鑑：<https://eliot5566.github.io/app-xray/>（每週一更新）。

## 負責任地使用

只做靜態分析，不會執行目標 App。請只分析自己擁有或有權檢查的軟體，並遵守 REA 的[免責聲明](https://github.com/morluto/rea/blob/main/DISCLAIMER.md)。報告只描述元件與事實，不包含 App 的程式碼。

授權：MIT
