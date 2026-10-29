# App X-Ray

**모든 앱의 성분표를, 명령어 하나로.**

[English](../../README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · 한국어 · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

App X-Ray는 데스크톱 앱, Android APK, Go／Rust 프로그램, AI 모델 파일을 스캔해 공유할 수 있는 한 페이지짜리 HTML 보고서를 만듭니다. 어떤 프레임워크와 버전을 쓰는지, 그 버전이 아직 보안 업데이트를 받는지, 어떤 분석·광고·크래시 리포팅 SDK가 들어 있는지, 어떤 주소와 통신하는지, 보안을 약하게 만드는 설정은 무엇인지 보여 주며 각 항목이 어느 파일에서 나왔는지 표시합니다.

분석은 [REA(Reverse Engineer Anything)](https://github.com/morluto/rea)가 하고, App X-Ray는 그 증거를 누구나 읽을 수 있는 보고서로 정리합니다.

설치 없이 실행(Node.js 22 이상):

```bash
npx github:Eliot5566/app-xray scan /path/to/app
# xray-out/report.html 열기
```

| 가진 것 | 지정할 경로 |
| --- | --- |
| Windows／Linux에 설치된 앱 | 설치 폴더(예: `C:\Program Files\Signal`) |
| macOS에 설치된 앱 | .app 번들(예: `/Applications/Signal.app`) |
| `app.asar` | 그 파일 |
| 소스 코드 | 저장소 안의 앱 폴더 |
| Android 앱 | `.apk` 파일 |
| Go 또는 Rust 프로그램 | 실행 파일(ELF, PE, Mach-O) |
| AI 모델 | `.gguf`, `.safetensors`, `.pt`/`.pth`/`.bin`/`.ckpt`, `.pkl` 파일 또는 이를 담은 폴더 |

`xray-out/`에 생성되는 파일: `xray.json`(모든 사실과 발견 사항), `report.html`(공유용 단일 페이지 보고서), `card.png`／`card.svg`(1200×630 요약 이미지), `badge.svg`(README 배지).

## 찾아내는 것

| 입력 | 주요 내용 |
| --- | --- |
| Electron 앱 | Electron／Chromium 버전과 지원 상태, fuses, 격리를 약화하는 `webPreferences`, 원격 페이지, 발신자를 확인하지 않는 IPC, 트래커, 평문 HTTP |
| Android APK | 분석·광고·세션 녹화·크래시 리포팅 SDK, 민감한 권한, debuggable 빌드, 평문 HTTP, 오래된 대상 API, 광고 ID, 다른 앱에 공개된 컴포넌트 |
| Go／Rust 실행 파일 | 포함된 라이브러리와 버전, 지원이 끝난 Go, 커밋되지 않은 변경으로 빌드됨. `--osv`로 알려진 취약점 확인 |
| 모델 파일 | 로드할 때 코드를 실행하는 pickle, 비표준 pickle import, 샌드박스를 벗어나려 하거나 주소·숨은 문자를 담은 GGUF 채팅 템플릿 |

모든 규칙, 보고서 형식, 한계는 [가이드(영문)](../en/guide.md)를 참고하세요.

## CI에서 버전 비교

`xray diff before/ after/`는 두 번의 스캔 사이에 새로 생긴 호스트, 패키지, SDK, 권한, 라이브러리 버전, 발견 사항을 보여 줍니다. GitHub Action으로 쓰면 풀 리퀘스트마다 댓글을 남깁니다.

## 갤러리

오픈소스 앱 보고서 모음: <https://eliot5566.github.io/app-xray/> (매주 월요일 갱신).

## 책임 있는 사용

정적 분석만 하며 대상 앱을 실행하지 않습니다. 본인이 소유하거나 검사 권한이 있는 소프트웨어만 분석하고 REA의 [면책 조항](https://github.com/morluto/rea/blob/main/DISCLAIMER.md)을 따르세요. 보고서는 구성 요소와 사실만 담으며 앱의 코드는 포함하지 않습니다.

라이선스: MIT
