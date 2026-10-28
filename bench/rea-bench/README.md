# REA-Bench

REA-Bench asks coding agents factual questions about real open-source Electron apps,
each pinned to a commit, and checks the answers against App X-Ray's report for the
same commit. Running it twice per model, once with [REA](https://github.com/morluto/rea)'s
tools and once without, shows how much the tools help.

The questions are about how each app is put together: its Electron version, whether
that version still gets security fixes, its window security settings, how many windows
it creates, the IPC channels its main process handles, and its preload scripts. No
answer is written by hand, so the set can be rebuilt whenever the gallery rescans.

## Task sets

| Folder | Apps | Tasks | Reference reports |
| --- | --- | --- | --- |
| [`2026-10-28/`](2026-10-28/) | 20 | 54 (9 per template) | gallery scan of 2026-10-22, `rea-agents` 6.7.0 |

Each folder holds `tasks.json`, which is what the agent sees, and `answers.json`, which
is only for grading. Every task names its repository, commit and app folder.

| Template | Answer | Scoring |
| --- | --- | --- |
| `electron-version` | version text | exact match (a leading `v` is ignored) |
| `electron-supported` | yes / no | exact match |
| `node-integration` | yes / no | exact match |
| `window-count` | number | exact match |
| `ipc-main-channels` | list | F1 over channel names |
| `preload-scripts` | list | F1 over paths |

## Running an agent

1. For each task, check out `repo` at `commit` and give the agent the folder `path`
   inside it. Run the agent with network access turned off, so it cannot look up
   the gallery or this repository.
2. Give it this prompt, once per task:

   > You are looking at the source code of the open-source app in the current folder.
   > Answer the question from the code alone. Reply with the answer only, in the format
   > the question asks for, and nothing else.
   >
   > Question: `<question>`

   For a run "with REA", also give the agent REA's tools (`npx rea-agents@6.7.0`
   as an MCP server or command line). For a run without REA, leave them out and keep
   everything else the same.
3. Collect the answers in one JSON object keyed by task id:
   `{"electron-version/hyper": "22.3.25", ...}`. A missing task scores 0.
4. Grade and update the leaderboard:

```sh
npm run build
node dist/bench/cli.js grade bench/rea-bench/2026-10-28 responses.json \
  --agent claude-code --model <model> --with-rea --out bench/rea-bench/results
node dist/bench/cli.js board bench/rea-bench/results --out site/bench
```

## Building a new task set

```sh
npm run bench                                    # scans the corpus into bench-out/
node dist/bench/cli.js build bench-out --out bench/rea-bench/<date> --seed <date>
```

The seed decides which apps each template asks about, so the same corpus and seed
always give the same tasks.

## What a score means

The reference answers come from static analysis, so a score measures agreement with
App X-Ray, not ground truth. App X-Ray can miss things, such as windows created
through a helper or channel names built at runtime, which is why templates leave out
apps where the report has nothing to say, and lists longer than 40 items. If an agent
disagrees with an answer and the code shows the agent is right, please open an issue:
that is a bug in App X-Ray.

## 中文說明

REA-Bench 用 gallery 裡 20 個真實開源 Electron App 出題（固定在某個 commit），題目包括 Electron 版本、該版本是否仍有安全更新、nodeIntegration 設定、視窗數量、主程序的 IPC 頻道與 preload 腳本。標準答案自動取自同一個 commit 的 App X-Ray 報告，不需要人工出題。同一個模型分別在「有 REA 工具」與「沒有 REA 工具」下各跑一次，就能看出 REA 帶來的差距。分數代表與 App X-Ray 靜態分析結果的一致程度。
