# App X-Ray

**あらゆるアプリの「成分表示」を、コマンドひとつで。**

[English](../../README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · 日本語 · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

App X-Ray はデスクトップアプリ、Android APK、Go／Rust のプログラム、AI モデルファイルをスキャンし、共有できる 1 ページの HTML レポートを作ります。使っているフレームワークとバージョン、そのバージョンにまだセキュリティ修正が出ているか、組み込まれている解析・広告・クラッシュレポート SDK、通信先のアドレス、セキュリティを弱める設定を一覧にし、それぞれがどのファイルから見つかったかを示します。

解析は [REA（Reverse Engineer Anything）](https://github.com/morluto/rea) が行い、App X-Ray はその証拠を誰でも読めるレポートにまとめます。

インストール不要（Node.js 22 以上）：

```bash
npx github:Eliot5566/app-xray scan /path/to/app
# xray-out/report.html を開く
```

| 手元にあるもの | 指定するパス |
| --- | --- |
| Windows／Linux にインストール済みのアプリ | インストールフォルダ（例：`C:\Program Files\Signal`） |
| macOS にインストール済みのアプリ | .app バンドル（例：`/Applications/Signal.app`） |
| `app.asar` | そのファイル |
| ソースコード | リポジトリ内のアプリのフォルダ |
| Android アプリ | `.apk` ファイル |
| Go／Rust のプログラム | 実行ファイル（ELF、PE、Mach-O） |
| AI モデル | `.gguf`、`.safetensors`、`.pt`/`.pth`/`.bin`/`.ckpt`、`.pkl` ファイル、またはそれらを含むフォルダ |

`xray-out/` に出力されるもの：`xray.json`（すべての事実と検出結果）、`report.html`（共有用の 1 ページレポート）、`card.png`／`card.svg`（1200×630 の概要画像）、`badge.svg`（README 用バッジ）。

## 検出できること

| 入力 | 主な内容 |
| --- | --- |
| Electron アプリ | Electron／Chromium のバージョンとサポート状況、fuses、分離を弱める `webPreferences`、リモートページ、送信元を確認しない IPC、トラッカー、平文 HTTP |
| Android APK | 解析・広告・セッション録画・クラッシュレポート SDK、機密性の高い権限、debuggable ビルド、平文 HTTP、古いターゲット API、広告 ID、他アプリに公開されたコンポーネント |
| Go／Rust 実行ファイル | 組み込まれたライブラリとバージョン、サポート終了の Go、未コミットの変更からのビルド。`--osv` で既知の脆弱性も確認 |
| モデルファイル | 読み込み時にコードを実行する pickle、標準外の pickle インポート、サンドボックスを抜けようとしたりアドレスや隠し文字を含む GGUF チャットテンプレート |

すべてのルール、レポート形式、制限は[ガイド（英語）](../en/guide.md)を参照してください。

## CI でバージョンを比較

`xray diff before/ after/` は 2 回のスキャンの間に増えたホスト、パッケージ、SDK、権限、ライブラリのバージョン、検出結果を一覧にします。GitHub Action として使うと、プルリクエストごとにコメントします。

## ギャラリー

オープンソースアプリのレポート集：<https://eliot5566.github.io/app-xray/>（毎週月曜に更新）。

## 責任ある利用

静的解析のみで、対象アプリは実行しません。自分が所有する、または調査を許可されたソフトウェアだけを解析し、REA の[免責事項](https://github.com/morluto/rea/blob/main/DISCLAIMER.md)に従ってください。レポートは構成要素と事実のみを記述し、アプリのコードは含みません。

ライセンス：MIT
