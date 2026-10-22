# Corpus results, week 4 (2026-10-22)

Same 20 apps, same filtering and rules as week 3. New: apps with 400 or more
source files are analyzed in parallel batches (one per core) and merged. 4-core
Linux container, rea-agents 6.7.0.

- 20/20 scanned; Electron version found for 20/20.
- 19/20 finished under 60 s (week 3: 17/20). Signal Desktop 144 s → 80 s,
  Insomnia 87 s → 41 s, GitHub Desktop 71 s → 34 s, Joplin 45 s → 22 s.
- 7 apps ran batched. Findings are identical to week 3 for all 20 apps. No count
  went down; three batched apps gained facts that a single run dropped at REA's
  result budget:

| App | Endpoints | Modules | IPC channels | Storage calls |
| --- | --- | --- | --- | --- |
| signal-desktop | 187 → 636 | 352 → 434 | 72 → 132 | 0 → 5 |
| insomnia | 115 → 132 | 1317 → 1591 | 68 → 68 | 63 → 85 |
| github-desktop | 23 → 23 | 1466 → 1485 | 0 → 0 | 32 → 32 |

Every scan now also writes `card.svg`, a 1200×630 summary image.

| App | Electron | Seconds | Addresses | High/Med/Low | Findings |
| --- | --- | --- | --- | --- | --- |
| electron-quick-start | 44.7.2 | 2.5 | 0 | 0/0/0 | — |
| joplin | 42.3.0 | 21.6 | 11 | 2/1/1 | nodeIntegration: true; contextIsolation: false; Electron 42.3.0 no longer receives security fixes; IPC handlers do not check the sender |
| signal-desktop | 44.9.1 | 79.6 | 636 | 0/0/0 | — |
| element-desktop | 41.0.2 | 5.1 | 19 | 0/1/1 | Electron 41.0.2 no longer receives security fixes; IPC handlers do not check the sender |
| github-desktop | 44.9.1 | 34.3 | 23 | 2/0/1 | nodeIntegration: true; contextIsolation: false; IPC handlers do not check the sender |
| bitwarden-desktop | 43.5.0 | 24.5 | 17 | 0/0/1 | IPC handlers do not check the sender |
| mattermost-desktop | 43.3.0 | 23.1 | 12 | 0/0/0 | — |
| insomnia | 43.2.0 | 41 | 132 | 2/0/0 | nodeIntegration: true; contextIsolation: false |
| etcher | 37.2.4 | 7.7 | 23 | 3/0/1 | Electron 37.2.4 no longer receives security fixes; nodeIntegration: true; contextIsolation: false; IPC handlers do not check the sender |
| stretchly | 44.5.1 | 13.8 | 90 | 0/1/1 | sandbox: false; IPC handlers do not check the sender |
| marktext | 42.1.0 | 20.9 | 30 | 0/1/1 | Electron 42.1.0 no longer receives security fixes; IPC handlers do not check the sender |
| standard-notes | 35.2.0 | 6.6 | 0 | 1/0/1 | Electron 35.2.0 no longer receives security fixes; IPC handlers do not check the sender |
| jitsi-meet-electron | 43.8.3 | 7 | 1 | 0/0/0 | — |
| ferdium | 44.2.0 | 25.5 | 68 | 0/0/1 | IPC handlers do not check the sender |
| freetube | 44.5.1 | 11.8 | 37 | 0/0/0 | — |
| zettlr | 44.7.0 | 18.8 | 29 | 0/1/1 | sandbox: false; IPC handlers do not check the sender |
| youtube-music | 42.5.0 | 19.1 | 83 | 0/1/1 | Electron 42.5.0 no longer receives security fixes; IPC handlers do not check the sender |
| webtorrent-desktop | 27.3.11 | 7.9 | 0 | 3/0/1 | Electron 27.3.11 no longer receives security fixes; nodeIntegration: true; contextIsolation: false; IPC handlers do not check the sender |
| hyper | 22.3.25 | 8.7 | 4 | 1/0/1 | Electron 22.3.25 no longer receives security fixes; IPC handlers do not check the sender |
| beekeeper-studio | 44.3.0 | 24 | 17 | 0/1/1 | sandbox: false; IPC handlers do not check the sender |
