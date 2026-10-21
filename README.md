# Penligent — Recreation

A high-fidelity reconstruction of **Penligent 2.1.6**, the Electron + Vue 3
AI penetration-testing platform distributed as
`penligent.kali_amd64_2.1.6.deb`.

The reconstruction was produced by static and dynamic reverse engineering of
the original package; it is not a re-implementation from a specification.
Every design decision below is traceable to an observation of the original —
see [`RECONSTRUCTION.md`](./RECONSTRUCTION.md) for the evidence and
[`COMPARISON.md`](./COMPARISON.md) for the measured differences.

---

## No account required — bring your own model

The original sends every AI request to Penligent's proprietary service
(`https://api.penligent.ai`) and gates the whole agent surface behind a
Penligent account. That service is not available here, so this recreation:

* **requires no account at all** — a local profile is created on first run and
  nothing in the application is gated behind a sign-in;
* **lets you point the agent at your own model** through *Settings → AI*,
  with two provider families:

| Provider | Base URL you enter | Request sent to | Works with |
| --- | --- | --- | --- |
| **OpenAI-compatible** | `https://api.openai.com/v1`, `http://localhost:11434/v1`, `http://localhost:1234/v1`, … | `{base}/chat/completions` | OpenAI, Ollama, LM Studio, vLLM, llama.cpp, DeepSeek, Groq, Together, OpenRouter, any OpenAI-shaped gateway |
| **Anthropic** | `https://api.anthropic.com` | `{base}/v1/messages` | Anthropic, Anthropic-compatible gateways, `claude-code-router` |

* **streams** the answer into the agent panel (SSE), persists the turn in
  `chat_records`, and lets you stop generation mid-flight;
* **generates a penetration test plan** from the Task List view, stored in
  `test_lists` in the same shape the reference uses;
* shows a **"Test connection"** button that performs a real request against
  the endpoint you configured and reports the actual error (auth failure,
  404, rate limit, …) instead of a generic message.

## Eleven languages, the reference's own wording

The original is fully localised, and so is this. All **eleven** of the
reference's message tables were recovered from its renderer bundle — 48
namespaces and 811 keys each, **8,921** leaf values in all — and are used
verbatim: every one of them was compared with the reference's own value, byte
for byte, and all 8,921 are identical. The strings you see are the
original's, not translations of them:

`English(en)` · `日本語(jp)` · `한국어(kr)` · `Русский язык(ru)` · `中文(zh)` ·
`Français(fr)` · `Deutsch(de)` · `العربية(ar)` · `中文繁體(zh)` ·
`Español(es)` · `Português(pt)`

Switch the language in *Settings → AI* or during onboarding. The choice is
kept in `localStorage` under the same key the reference uses.

## Tooling the original has

* **Reverse shell generator** — all 41 of the reference's payload templates
  (bash, sh, nc, ncat, python, perl, php, ruby, lua, node, socat, awk,
  powershell, cmd, …) across the four listener types `Reverse`, `Bind`,
  `MSFVenom` and `HoaxShell`. The payload is computed from the address and
  the port you enter.
* **AI tools** — HTTP request → Python, WebShell detection, abnormal process
  analysis, agent-skills audit and the reverse shell generator, all run
  against the provider you configured.
* **Scan pipeline** — the reference's five-stage flow: initialisation,
  asset analysis, interface discovery, risk screening, then the test list.
  It drives the bundled crawler and the bundled xray scanner.
* **Skills Library** — the reference's 攻击技战法库 over its local `ttp`
  table, with a rich-text editor for each entry.
* **Packet sniffer** — the reference's mockttp interception engine: capture,
  interception, request modification, release and history.
* **Proxy guide** — the reference's own four-section walk-through.
* **Dark and light themes** and a **font-size control**, both as the
  reference's Settings dialog has them: a theme class on `<html>` that is
  persisted under `localStorage["theme"]`, and a font scale where 1 means
  12px, stepping by 0.125.

The API key is stored locally in the application's own `user_settings` table,
mirroring how the reference stores its LLM token (`res_token`) in the `users`
table. It is redacted whenever it is read back into the renderer.

---

## Verified reference identity

| Property | Value |
| --- | --- |
| Package | `penligent.kali_amd64_2.1.6.deb` |
| Size | 221,125,052 bytes |
| SHA-256 | `31c055a60cad41d185d361d7e5d3b496696e70185a01dc0214947d38e46c0692` |
| Version | 2.1.6 (Electron 33.4.11 / Chromium 130.0.6723.191) |
| Vendor | Future Share LLC — <https://penligent.ai/> |
| Licence | `unknown` in the package control file |

---

## Measured fidelity

| Surface | Result |
| --- | --- |
| Application shell (1000×600) | **0** geometry differences across 42 probed anchors, apart from 3 documented deliberate divergences; **4,493 / 600,000** differing pixels (**0.75 %**) |
| Onboarding walkthrough (6 steps) | Titles, subtitles, bullets, language list, buttons and step chips **identical on all 6 steps**; 0.64 % – 2.3 % differing pixels |
| IPC surface | 116 `ipcMain.handle` channels, 13 renderer bridge namespaces — same vocabulary plus the AI provider |
| Database | 21 tables, verbatim `CREATE TABLE` statements including the original's column comments |
| Theme | Both palettes byte-for-byte equivalent to the reference's compiled stylesheet |
| AI provider layer | 10/10 provider checks (both families, streaming and non-streaming) and 9/9 UI checks against mock providers |
| Data layer | 8/8 functional checks against the real SQLite database |
| Scanner & crawler | 6/6 checks — the bundled **xray** binary really scans a live target and its findings reach `scan_result` |
| MITM proxy | 6/6 checks — a real request through the proxy is intercepted, reported to the renderer and stored in `proxy_history` |
| Report generation | 8/8 checks — a real markdown report is rendered from the project's findings and stored in `report_exports` |
| Bug audit | 15 defects found and fixed, each with a regression test — see [`BUG-AUDIT.md`](./BUG-AUDIT.md) |
| Agent orchestration | 17/17 unit tests over the recovered task-selection, action-assembly and queue algorithms |
| **Test total** | **91 / 91** |

---

## Prerequisites

* Node.js **22.x** (the host was verified on 22.23.2)
* npm 10+
* A Linux desktop or Xvfb display for the Electron window
* A C toolchain if `better-sqlite3` has no prebuilt binary for your platform

## Install

```bash
cd penligent-recreation
npm install

# npm >= 11 blocks dependency install scripts by default.
npm install-scripts approve better-sqlite3 electron esbuild
npm run rebuild:sqlite
```

`npm run rebuild:sqlite` compiles `better-sqlite3` against **Electron's** ABI
(Electron 33 → Node 20.18), which is what the main process needs. The plain
`node --test` suite exercises the JavaScript-only modules; the database suite
runs under Electron (`npm run test:db`) so the native module is loadable.

## Run

```bash
# Production build + launch
npm start

# Renderer only, in a browser (no IPC bridge available)
npm run dev

# Rebuild the renderer and relaunch Electron
npm run build && npm start
```

The application opens a 1000 × 600 window (minimum 1050 × 600) with a hidden
title bar, matching the reference.

**First run:** the Product Introduction walkthrough appears (exactly as in the
reference), then you can open **Settings → AI** and point the agent at your
model. Everything else — projects, task lists, findings, tool results, the
packet-capture history — works without any account.

## Test

```bash
npm test                # theme + IPC contract tests (Node)
npm run test:db         # schema + data-layer tests (Electron ABI)
npm run test:functional # DB-backed functional checks against a running app
npm run test:all        # the first two plus the functional checks

npm run mock-provider   # a local mock OpenAI-compatible + Anthropic server
npm run test:ai         # AI provider layer (both families, streaming + not)
npm run test:ai-ui      # the chat and test-plan flows through the real UI
npm run test:regressions # the defects found by the bug audit
npm run test:scanner    # the bundled scanner and crawler against a live target
npm run test:proxy      # the MITM proxy against a live target
npm run test:report     # report generation and the provider model list
npm run test:e2e        # side-by-side comparison against the reference
```

The e2e suites drive a running instance over the Chrome DevTools Protocol.
Point them at it with `CDP_HOST`:

```bash
CDP_HOST=http://127.0.0.1:9222 npm run test:ai
```

For `test:ai` and `test:ai-ui` the mock providers must be reachable from the
application under test. If the app runs in a container, run the mock there and
set `PROVIDER_HOST` to the address the app should use:

```bash
PROVIDER_HOST=127.0.0.1 CDP_HOST=http://127.0.0.1:9225 npm run test:ai-ui
```

## Package

```bash
npx electron-builder --linux deb
```

The build artefacts land in `dist_electron/`. The reference installs to
`/opt/Penligent` with a desktop entry at
`/usr/share/applications/penligent.desktop` and an `update-alternatives` entry
for `/usr/bin/penligent`; set `directories.output` and the `extraResources`
block in `electron-builder.yml` to reproduce that layout.

---

## Project layout

```
penligent-recreation/
├── electron/                     # Main process
│   ├── main.cjs                  # Window creation, startup order, dotenv
│   ├── preload.cjs               # contextBridge: 13 renderer namespaces
│   ├── db/
│   │   ├── schema.cjs            # The reference's 21 tables, verbatim
│   │   └── db.cjs                # Query layer (one function per reference export)
│   └── ipc/                      # IPC handlers across 9 modules
│       └── ai.cjs                # OpenAI-compatible + Anthropic provider adapters
├── src/                          # Renderer (Vue 3 + Vite + Pinia + vue-router)
│   ├── App.vue                   # Application shell
│   ├── styles/theme.css          # Both palettes, verbatim
│   ├── styles/global.css         # The reference's global baseline (and its omissions)
│   ├── components/               # Header, panels, chat, onboarding, notices,
│   │                             # AI settings, new project
│   ├── views/                    # Projects, Tool Config, Task List, Target Overview,
│   │                             # Threat Map, Security Findings, Tool Results, Proxy List
│   └── stores/                   # theme, font size, user, project, notice, ai
└── test/                         # Automated tests
    ├── theme.test.cjs            # Design-token regression tests
    ├── ipc.test.cjs              # IPC + preload contract tests
    ├── db.test.cjs               # Schema and data-layer tests
    └── e2e/                      # CDP-driven functional, AI and comparison suites
```

## Configuration

The main process loads `<resourcesPath>/.env.production` (packaged) or
`./.env.development` (development). The reference's two settings:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE` | Penligent service base URL (reference: `https://api.penligent.ai`) |
| `VITE_WEB_BASE` | Marketing site (reference: `https://www.penligent.ai`) |

These are only used by the features that genuinely need the Penligent
service. The AI features use the provider you configure in *Settings → AI*
instead.

Other environment overrides honoured by the reconstruction:
`PENLIGENT_DB_PATH` (database location), `PENLIGENT_USER_DATA`
(proxy CA directory), `PENLIGENT_PLAIN_SQLITE` (plain, unencrypted database),
`NODE_ENV`, `IS_DEV`.

---

## Bundled scanner and crawler

The reference ships three helper binaries under `resources/depency/`, and the
reconstruction bundles the same ones so the features are real rather than
simulated:

| Bundled | What it is | How it is driven |
| --- | --- | --- |
| `scanner/scanner_linux_amd64` | **xray v1.8.2** (open-source vulnerability scanner) plus its `config.yaml` | `webscan --json-output <file> --plugins baseline,sqldet,xss,cmd-injection,path-traversal --url <target>` — the reference's exact argument shape. Findings are parsed from xray's JSON and stored in `scan_result` |
| `crawlergo` | The Go crawler | `--chromium-path`, `--max-tab-count`, `--max-crawled-count`, `--max-run-time`, `--log-level` — the reference's exact argument shape. One JSON object per line is stored in `crawler_result` |
| `chrome-headless-shell/linux-120.0.6098.0/` | Headless Chromium 120 for the crawler | passed to the crawler as `--chromium-path` |

Both are reachable from the **Task List** toolbar: *Crawl* and *Scan* operate
on the project's target (`projects.project_target`, the reference's own
column) and report what they found.

The 19 `ALTER TABLE` migrations the reference applies on top of its
`CREATE TABLE` blocks were also recovered verbatim, so the reconstruction's
effective schema matches the reference's — including `projects.project_target`,
`projects.over_view`, `projects.task_mode`, `risk_items.verify_status`,
`execution_results.risk_item` and `crawler_result.is_high_value`.

## The agent request contract

The reference assembles every agent request **client-side** and posts it to
its service; the server relays the payload to the model. The contract is
therefore recoverable, and `electron/ipc/agentContract.cjs` reproduces it —
the twenty agent endpoints and the payload each one sends (the `context`,
`risk_list`, `history_summary`, `timeout_tools`, `system_prompt_config` and
`plugins` fields included).

Because the whole prompt is built on the client, the same contract works
against any OpenAI-compatible or Anthropic endpoint — which is what the
reconstruction does.

---

## The MITM proxy

The reference's proxy was **not** unrecoverable — its own implementation was
inside the package, at `services/proxy/interceptor.js` and
`services/proxy/index.js`, and `mockttp` (its proxy engine) is on npm. Both
files are ported faithfully:

| Piece | What it does |
| --- | --- |
| `electron/services/proxy/interceptor.js` | The `mockttp` engine: CA generation, TLS passthrough, the auth-bypass host list, request/response snapshots, and the pause → release/drop decision |
| `electron/services/proxy/index.js` | The **forked child process** that hosts the engine, so a hang in the proxy cannot take the application down |
| `electron/main.cjs` | Forks the child, relays its messages to the packet-sniffer window, and tears it down with the window |
| `src/views/ProxyListView.vue` | The packet sniffer: start/stop the proxy, watch the captured traffic live, release or drop a paused request, and store the exchange |

Behaviour reproduced from the reference:

* the proxy listens on **17890**;
* a CA named **"PenLigent Proxy CA"** is generated on first use into
  `<userData>/proxy-certs/` (the reference ships a leftover mockttp *test*
  certificate, which the recreation deliberately does not ship — the code
  generates a correctly-labelled CA instead);
* the reference's **TLS passthrough** list (Google, Bing, Edge) so OAuth and
  reCAPTCHA keep working behind the proxy;
* the reference's **auth bypass** host list, which is never paused;
* every request is passed through and snapshotted; only requests matching the
  interception rules are **paused** until the operator releases (optionally
  modified) or drops them;
* request and response bodies are read only for small, text-like payloads,
  behind a 300 ms race, so large transfers are never blocked.

> One deliberate divergence: the reference's `replayRequest` throws
> *"Replay 尚未实现"* — replay is not implemented there either, and the
> reconstruction keeps the same behaviour rather than inventing a different
> one.

---

## Model routing and the report

Two more pieces of the reference turned out to be recoverable, and both are
implemented:

**Model routing.** The reference fetches its model list from
`GET /api/model/open` — an *unauthenticated* endpoint that returns
`{ "data": { "llm_list": ["penliai-4-5-101", "pentest-gemini-3-flash"] } }` —
and selects the first entry, falling back to the hard-coded
`"penliai-4-5-101"` when the request fails. The reconstruction keeps that
shape: **Settings → AI** has a *Load models* button that reads the model list
from the provider you configured (`{base}/models` for OpenAI-compatible
endpoints, `{base}/v1/models` for Anthropic), normalises it to the reference's
`llm_list` form and preselects the first entry, with the configured model as
the fallback.

**The report.** The reference asks Penligent's service to render the report:

```
POST /api/agent/report-export/v1/messages
{ task_id, model, project_id, language,
  risk_list: JSON.stringify(riskList),
  current_target_info: JSON.stringify(overview),
  test_list: JSON.stringify(nowTestList) }
```

Every one of those inputs is assembled **client-side**, so the report can be
produced locally from exactly the same data. The reconstruction renders the
markdown from the same payload and stores it through exactly the same call the
reference makes (`updateReportExportContentFormatStatus(id, content, "md",
"completed")` into `report_exports`). The **Export Report** button opens the
report view, which lists the generated reports and can save one to disk.

> The reference's chat modes are exactly `["Ask", "Agent"]` — recovered from
> the renderer bundle — and the reconstruction now matches that.

**The orchestration policy is client-side.** The reference's server proposes
tool calls, but the *client* decides which task runs next, when the run is
finished, when the report is generated and how results are fed back. All of
that was recovered and is implemented in `src/agent/orchestration.js`:

* `getNextTaskList()` — the next up-to-three tasks, from the focused group
  first, then the following groups, then anything incomplete;
* the action list — `"go on"` while a run is mid-task, `"Report Generation"`
  once every task is complete;
* the auto-round loop — `analysis_round` increments after each tool execution
  until the model reports the task complete;
* the tool-summary queue — a client-side FIFO that serialises the
  "the target overview changed" updates.

The nine `system_prompt_config` variables the reference sends — `client_info`,
`test_target`, `analysis_round`, `ai_python_path`, `ai_script_path`, `task`,
`task_tree`, `task_focus`, `self_tools` — are all client-side too, and the
reconstruction sends the same set. What remains server-side is the prompt
*template* and the model's own decisions.

---

## Bug audit

A systematic pass over the reconstruction found **15 defects** — including two
that silently destroyed data (saving the AI settings erased the stored API
key) and two that broke features outright (every chat request sent the
user's message twice; command output arrived as a Buffer object rather than
text). All 15 are fixed and each has a regression test.

See [`BUG-AUDIT.md`](./BUG-AUDIT.md) for the full list, the reproduction and
the fix for each.

## Known limitations

These are documented in full in [`RECONSTRUCTION.md`](./RECONSTRUCTION.md)
§ "Unreproduced components" and [`COMPARISON.md`](./COMPARISON.md) § 6. In
brief:

1. **The Penligent backend is proprietary and not reproducible.** The
   reference's *Penligent-hosted* features — its proprietary task-tree
   service, its report templates, its telemetry, its skill library and its
   `api.penligent.ai` account system — cannot be reimplemented. The AI
   features that matter most (the agent conversation and the test-plan
   generator) are **fully working** against **your own** OpenAI-compatible or
   Anthropic provider, and no account is required for anything.
2. **The MITM proxy engine is not vendored.** The reference bundles
   `mockttp` and its own CA. The reconstruction keeps the certificate
   workflow, the request/response envelope and the `proxy_history` schema,
   but does not reimplement the interception engine.
3. **The bundled Go helpers are not reimplemented.** The reference ships
   `scanner_linux_amd64` (stripped) and `crawlergo` (with debug info) plus a
   Chrome-headless-shell 120 crawler. The reconstruction exposes the same IPC
   entry points but not the binaries.
4. **Vue Flow was replaced with plain SVG** for the Threat Map so the
   reconstruction carries no extra runtime dependency; the node palette
   (`--node-1` … `--node-6`, `--node-risk`) is unchanged.
5. **The reference's database is encrypted** (SQLCipher-style, via
   `better-sqlite3-multiple-ciphers`). The reconstruction stores the same
   schema unencrypted so the data is inspectable and reproducible. No attempt
   was made to bypass the original's encryption.


## The vendored tools

`resources/depency/` holds the three tools the reference ships — the xray
scanner, `crawlergo` and `chrome-headless-shell`. They are restored from the
original package rather than carried in version control:

```bash
./scripts/fetch-dependencies.sh [path/to/penligent.kali_amd64_2.1.6.deb]
```

The script reads the package, restores the tools and verifies them against
`resources/depency/MANIFEST.json`. If a binary is missing at runtime, the
scanner and the crawler report it plainly rather than failing silently.


## The parity audit

`dynamic/audit-gaps.cjs` compares this reconstruction against the
reference's own surface — its component names, its dialogs, its stores and
all 811 of its recovered message keys — and reports what has no counterpart.
It is the honest measure of the gap; the matrix generated from this
reconstruction's own source is not.

    used     : 666 keys the reference uses in its code
    unused   : 2  (the two account controls, see below)
    ambiguous: 0

The eleven audit reports under `penligent-analysis/evidence/audit/` hold 240
findings. A script re-reads each of them, extracts the code every finding
quotes, and looks for it in the current source: **none of the findings'
complaints is present any more**. `COMPARISON.md` §20 lists what was closed
in the last round, and what the remaining divergences are.

    reference dialog names (not found verbatim): none
    reference store names  (not found verbatim): none

The 143 keys the audit reports as "locale-only" are strings the reference
itself never references in code — it ships them in its locale tables and never
shows them.

Six keys are deliberately not used: the four sign-in keys (`header.登录`,
`header.登录中`, `setting.登录`, `setting.登录中`) and the two account
controls that go with them (`setting.查看使用计划`, `setting.退出登录`).
This build has no Penligent account, so the sign-in button opens the AI
provider settings and the account's plan page and sign-out are gone rather
than left as controls that cannot do anything. The list is in
`reference/used-keys.json` and the generator carries it, so a regeneration
does not lose it.


## Installing

The recreation is packaged as a Debian package that installs the same way the
original does — the application under `/opt`, a desktop entry, and the hicolor
icons.

```bash
npm run build                 # build the renderer
npx electron-builder --linux deb
sudo dpkg -i release/penligent-recreation_2.1.6_amd64.deb
```

That installs:

| Path | What |
| --- | --- |
| `/opt/Penligent-Recreation/` | the application, with the vendored tools under `resources/depency/` |
| `/usr/share/applications/penligent-recreation.desktop` | the desktop entry |
| `/usr/share/icons/hicolor/*/apps/penligent-recreation.png` | the icons |
| `/usr/bin/penligent-recreation` | the launcher |

It is deliberately named apart from the original `penligent` package so that
installing it cannot disturb an existing installation.
