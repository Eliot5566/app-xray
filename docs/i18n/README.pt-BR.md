# App X-Ray

**O rótulo de ingredientes e privacidade de qualquer app, em um comando.**

[English](../../README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · Português

O App X-Ray analisa um app de desktop, um APK Android, um programa em Go ou Rust, ou arquivos de modelos de IA, e gera um relatório HTML de uma página para compartilhar: qual framework e versão o app usa, se essa versão ainda recebe correções de segurança, quais SDKs de análise, publicidade ou relatório de falhas ele contém, com quais endereços se comunica e quais configurações enfraquecem sua segurança. Cada item indica o arquivo de onde veio.

A análise é feita pelo [REA (Reverse Engineer Anything)](https://github.com/morluto/rea); o App X-Ray transforma as evidências em algo que qualquer pessoa consegue ler.

Sem instalação (Node.js 22 ou mais recente):

```bash
npx app-xray scan /caminho/do/app
# abra xray-out/report.html
```

| Você tem | Aponte para |
| --- | --- |
| Um app instalado no Windows ou Linux | a pasta de instalação, ex.: `C:\Program Files\Signal` |
| Um app instalado no macOS | o pacote, ex.: `/Applications/Signal.app` |
| Um `app.asar` | o próprio arquivo |
| O código-fonte | a pasta do app no repositório |
| Um app Android | o arquivo `.apk` |
| Um programa em Go ou Rust | o executável (ELF, PE ou Mach-O) |
| Um modelo de IA | um arquivo `.gguf`, `.safetensors`, `.pt`/`.pth`/`.bin`/`.ckpt` ou `.pkl`, ou uma pasta com eles |

Em `xray-out/` ficam `xray.json` (todos os fatos e achados), `report.html` (o relatório para compartilhar), `card.png`/`card.svg` (imagem de resumo 1200×630) e `badge.svg` (selo para o README).

## O que ele encontra

| Entrada | Destaques |
| --- | --- |
| Apps Electron | Versão do Electron/Chromium e status de suporte, fuses, `webPreferences` que enfraquecem o isolamento, páginas remotas, IPC sem verificar o remetente, rastreadores, HTTP sem criptografia |
| APKs Android | SDKs de análise, publicidade, gravação de sessão e falhas, permissões sensíveis, builds depuráveis, HTTP sem criptografia, API alvo antiga, ID de publicidade, componentes expostos |
| Executáveis Go/Rust | Bibliotecas incluídas e versões, Go sem suporte, builds com alterações não commitadas; vulnerabilidades conhecidas com `--osv` |
| Modelos | Pickles que executam código ao carregar, imports de pickle incomuns, templates de chat GGUF que tentam escapar do sandbox ou escondem endereços e texto |

Todas as regras, o formato do relatório e os limites estão no [guia (em inglês)](../en/guide.md).

## Comparar versões no CI

`xray diff before/ after/` lista hosts, pacotes, SDKs, permissões, versões de bibliotecas e achados novos entre duas análises. Como GitHub Action, comenta em cada pull request.

## Galeria

Relatórios de apps de código aberto: <https://eliot5566.github.io/app-xray/> (atualizada toda segunda-feira).

## Uso responsável

Apenas análise estática: o app nunca é executado. Analise somente software que você possui ou tem autorização para examinar, e siga o [aviso legal](https://github.com/morluto/rea/blob/main/DISCLAIMER.md) do REA. Os relatórios descrevem componentes e fatos; nunca incluem o código do app.

Licença: MIT
