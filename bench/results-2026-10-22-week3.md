# Corpus results, week 3 (2026-10-22)

Same 20 apps as `results-2026-10-22.md`, scanned with source-checkout filtering
(tests, stories, build tooling and minified/generated files left out) and the
10-rule set. 4-core Linux container, rea-agents 6.7.0.

- 20/20 scanned; Electron version found for 20/20.
- 17/20 finished under 60 s (week 2: 14/20). Still over: Signal Desktop 144 s
  (about 2,300 source files after filtering), Insomnia 87 s, GitHub Desktop 71 s.
- `dynamic-ipc-channels` matched 18/20 apps (not yet checked how many are benign),
  so it reports as info and is left out of the table.

| App | Electron | Seconds | Addresses | High/Med/Low | Findings |
| --- | --- | --- | --- | --- | --- |
| electron-quick-start | 44.7.2 | 2.5 | 0 | 0/0/0 | — |
| joplin | 42.3.0 | 44.8 | 11 | 2/1/1 | nodeIntegration: true; contextIsolation: false; Electron 42.3.0 no longer receives security fixes; IPC handlers do not check the sender |
| signal-desktop | 44.9.1 | 143.6 | 187 | 0/0/0 | — |
| element-desktop | 41.0.2 | 4.9 | 19 | 0/1/1 | Electron 41.0.2 no longer receives security fixes; IPC handlers do not check the sender |
| github-desktop | 44.9.1 | 70.7 | 23 | 2/0/1 | nodeIntegration: true; contextIsolation: false; IPC handlers do not check the sender |
| bitwarden-desktop | 43.5.0 | 23.7 | 17 | 0/0/1 | IPC handlers do not check the sender |
| mattermost-desktop | 43.3.0 | 23.7 | 12 | 0/0/0 | — |
| insomnia | 43.2.0 | 87.4 | 115 | 2/0/0 | nodeIntegration: true; contextIsolation: false |
| etcher | 37.2.4 | 7.8 | 23 | 3/0/1 | Electron 37.2.4 no longer receives security fixes; nodeIntegration: true; contextIsolation: false; IPC handlers do not check the sender |
| stretchly | 44.5.1 | 13.8 | 90 | 0/1/1 | sandbox: false; IPC handlers do not check the sender |
| marktext | 42.1.0 | 42.5 | 30 | 0/1/1 | Electron 42.1.0 no longer receives security fixes; IPC handlers do not check the sender |
| standard-notes | 35.2.0 | 7.4 | 0 | 1/0/1 | Electron 35.2.0 no longer receives security fixes; IPC handlers do not check the sender |
| jitsi-meet-electron | 43.8.3 | 7.2 | 1 | 0/0/0 | — |
| ferdium | 44.2.0 | 25.8 | 68 | 0/0/1 | IPC handlers do not check the sender |
| freetube | 44.5.1 | 13.5 | 37 | 0/0/0 | — |
| zettlr | 44.7.0 | 33.8 | 29 | 0/1/1 | sandbox: false; IPC handlers do not check the sender |
| youtube-music | 42.5.0 | 19.2 | 83 | 0/1/1 | Electron 42.5.0 no longer receives security fixes; IPC handlers do not check the sender |
| webtorrent-desktop | 27.3.11 | 8 | 0 | 3/0/1 | Electron 27.3.11 no longer receives security fixes; nodeIntegration: true; contextIsolation: false; IPC handlers do not check the sender |
| hyper | 22.3.25 | 8.5 | 4 | 1/0/1 | Electron 22.3.25 no longer receives security fixes; IPC handlers do not check the sender |
| beekeeper-studio | 44.3.0 | 49.4 | 17 | 0/1/1 | sandbox: false; IPC handlers do not check the sender |
