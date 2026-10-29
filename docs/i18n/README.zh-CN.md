# App X-Ray

**任何 App 的成分标签，一条命令生成。**

[English](../../README.md) · [繁體中文](README.zh-TW.md) · 简体中文 · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

App X-Ray 可以扫描桌面 App、Android APK、Go／Rust 程序或 AI 模型文件，生成一页可分享的 HTML 报告：使用了哪个框架和版本、该版本是否仍有安全更新、内置了哪些统计／广告／崩溃上报 SDK、会连接哪些网址，以及哪些设置削弱了安全性。每一项都标明来自哪个文件。

分析由 [REA（Reverse Engineer Anything）](https://github.com/morluto/rea) 完成，App X-Ray 把 REA 的证据整理成人人都能看懂的报告。

无需安装（Node.js 22 及以上）：

```bash
npx github:Eliot5566/app-xray scan /path/to/app
# 打开 xray-out/report.html
```

| 你有 | 指向 |
| --- | --- |
| Windows／Linux 已安装的 App | 安装目录，例如 `C:\Program Files\Signal` |
| macOS 已安装的 App | .app，例如 `/Applications/Signal.app` |
| `app.asar` | 文件本身 |
| 源代码 | 仓库中 App 的目录 |
| Android App | `.apk` 文件 |
| Go 或 Rust 程序 | 可执行文件（ELF、PE 或 Mach-O） |
| AI 模型 | `.gguf`、`.safetensors`、`.pt`/`.pth`/`.bin`/`.ckpt`、`.pkl` 文件，或包含它们的目录 |

输出到 `xray-out/`：`xray.json`（全部事实与发现）、`report.html`（可分享的单页报告）、`card.png`／`card.svg`（1200×630 摘要图）、`badge.svg`（README 徽章）。

## 能发现什么

| 输入 | 重点 |
| --- | --- |
| Electron App | Electron／Chromium 版本与支持状态、fuses、削弱隔离的 `webPreferences`、远程页面、未校验来源的 IPC、追踪服务、明文 HTTP |
| Android APK | 统计／广告／录屏回放／崩溃上报 SDK、敏感权限、debuggable、明文 HTTP、过旧的目标 API、广告 ID、对外开放的组件 |
| Go／Rust 可执行文件 | 内置的库及版本、不再受支持的 Go 版本、用未提交的修改构建；加 `--osv` 可查询已知漏洞 |
| 模型文件 | 加载时会执行代码的 pickle、非标准的 pickle 导入、会逃逸沙箱或藏有网址与文字的 GGUF chat template |

全部规则、报告格式与限制见[使用指南（英文）](../en/guide.md)或[繁體中文指南](../zh-TW/guide.md)。

## 在 CI 中比较版本

`xray diff before/ after/` 列出两次扫描之间新增的域名、包、SDK、权限、库版本与发现。作为 GitHub Action 使用时，会在每个 PR 自动评论。

## 报告图鉴

开源 App 的报告图鉴：<https://eliot5566.github.io/app-xray/>（每周一更新）。

## 负责任地使用

仅做静态分析，不会运行目标 App。请只分析你拥有或有权检查的软件，并遵守 REA 的[免责声明](https://github.com/morluto/rea/blob/main/DISCLAIMER.md)。报告只描述组件与事实，不包含 App 的代码。

许可证：MIT
