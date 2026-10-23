# Corpus results, week 5 (2026-10-23)

Same 20 apps and rules as week 4, re-cloned at their latest commits. This run was
on a different 4-core container that is about 1.5× slower than week 4's (the
fixture scan takes 3.8 s instead of 2.5 s), so compare timings within a run.

- 20/20 scanned; Electron version found for 20/20.
- 18/20 under 60 s on this machine. Over: Signal Desktop 124 s and Insomnia 69 s
  (80 s and 41 s on week 4's machine). Signal's time is REA's own parsing:
  about 2,100 files and 12.9 MB of source across 4 parallel batches. Splitting
  batches into separate folders was 30% faster but lost 231 of 434 modules
  because imports could no longer be resolved, so it was not adopted.
- Facts and findings are identical to week 4 for the 12 apps whose source did not
  change. The 8 that changed upstream moved as their code did; for example,
  Etcher upgraded to Electron 44.9.1, so it no longer gets the out-of-support finding.
- Every scan now also writes `card.png` and `badge.svg`.

| App | Electron | Seconds | Addresses | High/Med/Low | Findings |
| --- | --- | --- | --- | --- | --- |
| electron-quick-start | 44.7.2 | 3.8 | 0 | 0/0/0 | — |
| joplin | 42.3.0 | 39.1 | 11 | 2/1/1 | nodeIntegration: true; contextIsolation: false; Electron 42.3.0 no longer receives security fixes; IPC handlers do not check the sender |
| signal-desktop | 44.9.1 | 124.2 | 636 | 0/0/0 | — |
| element-desktop | 41.0.2 | 7.8 | 19 | 0/1/1 | Electron 41.0.2 no longer receives security fixes; IPC handlers do not check the sender |
| github-desktop | 44.9.1 | 48.3 | 23 | 2/0/1 | nodeIntegration: true; contextIsolation: false; IPC handlers do not check the sender |
| bitwarden-desktop | 43.5.0 | 35.9 | 17 | 0/0/1 | IPC handlers do not check the sender |
| mattermost-desktop | 43.3.0 | 35.6 | 12 | 0/0/0 | — |
| insomnia | 43.2.0 | 68.5 | 132 | 2/0/0 | nodeIntegration: true; contextIsolation: false |
| etcher | 44.9.1 | 11.4 | 24 | 2/0/1 | nodeIntegration: true; contextIsolation: false; IPC handlers do not check the sender |
| stretchly | 44.5.1 | 22.2 | 90 | 0/1/1 | sandbox: false; IPC handlers do not check the sender |
| marktext | 42.1.0 | 32.9 | 30 | 0/1/1 | Electron 42.1.0 no longer receives security fixes; IPC handlers do not check the sender |
| standard-notes | 35.2.0 | 11.8 | 0 | 1/0/1 | Electron 35.2.0 no longer receives security fixes; IPC handlers do not check the sender |
| jitsi-meet-electron | 43.8.3 | 15.5 | 1 | 0/0/0 | — |
| ferdium | 44.2.0 | 44.8 | 68 | 0/0/1 | IPC handlers do not check the sender |
| freetube | 44.7.2 | 24.3 | 37 | 0/0/0 | — |
| zettlr | 44.7.0 | 31.9 | 29 | 0/1/1 | sandbox: false; IPC handlers do not check the sender |
| youtube-music | 42.5.0 | 32.6 | 83 | 0/1/1 | Electron 42.5.0 no longer receives security fixes; IPC handlers do not check the sender |
| webtorrent-desktop | 27.3.11 | 11.1 | 0 | 3/0/1 | Electron 27.3.11 no longer receives security fixes; nodeIntegration: true; contextIsolation: false; IPC handlers do not check the sender |
| hyper | 22.3.25 | 15.9 | 4 | 1/0/1 | Electron 22.3.25 no longer receives security fixes; IPC handlers do not check the sender |
| beekeeper-studio | 44.3.0 | 45.3 | 17 | 0/1/1 | sandbox: false; IPC handlers do not check the sender |
