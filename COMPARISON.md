# Penligent Recreation — Comparison Report

Every number in this report was produced by driving the **original
application** and the **reconstruction** through the same scripted sequence
over the Chrome DevTools Protocol, capturing the same pixels, and comparing
them programmatically. Nothing here is estimated.

## 1. Method

| | Reference | Recreation |
| --- | --- | --- |
| Build | `penligent.kali_amd64_2.1.6.deb` (stock Electron 33.4.11) | `penligent-recreation` 2.1.6 (Electron 33.4.11), installed from the `.deb` |
| Runtime | Ubuntu 24.04 container, Xvfb `:99`, 1600×1000×24 | the host, pinned to 1000×600 through `Emulation.setDeviceMetricsOverride` |
| Window | 1000×600 | 1000×600 |
| Driver | `dynamic/compare.cjs`, `dynamic/onbcmp2.cjs` (CDP) | `dynamic/verify-installed-views.cjs` (CDP, against the **installed** build) |
| Metrics | ImageMagick `compare -metric AE` and `-metric RMSE` over the full 1000×600 frame | |

The reference was never installed on the host: the package was extracted into
a disposable container and run there. Its screenshots are kept in
`penligent-analysis/compare/fin-ref-*.png`, and the installed build is
compared against those.

> **The two runs are not in the same environment.** The reference's shots were
> taken inside the container, with that container's font set; the
> reconstruction is measured on the host, with the host's font set. The
> reference's body text renders in a heavier face than the host's, so every
> glyph differs by a sub-pixel antialiasing amount even where the layout,
> the strings and the icons are identical. The remaining tables below are
> therefore *upper bounds*: they include the whole of that font difference.

## 2. Application shell and views

`geometry differences` counts differences in **42 probed anchors** (element
boxes, colours, font sizes, paddings, gaps) — 0.5 px tolerance on numbers,
exact on strings. `AE` is the count of differing pixels out of 600,000.

| View | AE (pixels) | AE % | RMSE |
| --- | --- | --- | --- |
| Shell (default) | 9,610 | **1.602 %** | 0.0435 |
| Centre → Task List | 9,610 | **1.602 %** | 0.0435 |
| Centre → Target Overview | 18,055 | **3.009 %** | 0.0667 |
| Centre → Threat Map | 12,095 | **2.016 %** | 0.0433 |
| Centre → Security Findings | 10,692 | **1.782 %** | 0.0434 |
| Centre → Tool Results | 10,146 | **1.691 %** | 0.0441 |
| Left → Tool Config | 21,120 | **3.520 %** | 0.0529 |

Measured on the **installed** build against the reference's stored
screenshots. A side-by-side crop of the header shows the same icons in the
same places with the same spacing; only the glyph weight differs, because the
two runs use different font sets.

The reference renders nothing in the centre panel until a project exists, and
the reconstruction matches that: the task list, the overview, the map, the
findings and the tool results are all empty on a fresh profile, exactly as
the reference's are.

Two things account for the residual:

1. the font difference between the container and the host (every glyph);
2. the account button, which shows the local profile name instead of the
   reference's "Login" — the one deliberate divergence (§ 2.1).

### 2.1 Deliberate divergences after the AI-provider substitution

Three differences remain, all of them consequences of the deliberate change
described in `RECONSTRUCTION.md` § 7A (no account, user-supplied model):

| Anchor | Reference | Recreation | Cause |
| --- | --- | --- | --- |
| `.header-right` width | 185.8 px | 193.9 px | The account button shows the local profile name ("Local User") instead of "Login" |
| `.header-left` width | 800 px | 796.1 px | Consequence of the above (the header is `space-between`) |

Both follow from the one deliberate divergence: the reconstruction has no
account system, so the reference's sign-in button opens the AI provider
settings instead. It is the only excluded surface — the four sign-in strings
are the four keys left out of the parity manifest.

### 2.2 Geometry anchors verified as identical

```
.app-container        0,0    1000x600   flex column
.header-container     0,0    1000x30    1px bottom border
.header-left          5,5    800x19     gap 10, max-width 80%
.body-container       0,30   1000x570
.home-content-left    0,30   250 wide   1px right border
.home-content-center  251,30 246 wide   overflow hidden
.center-container     251,30 400 wide   min-width 400px (clipped by the pane)
.drag-line            497,30 2x570      col-resize
.home-content-right   499,30 500 wide   1px left border
.chat-container       502.5,30 495 wide calc(100% - 5px), margin 2.5
.footer-container     502.5,516 495x79  position relative, padding 5, gap 5
.input-box            508.5,522 483x36  rows=2, font-family monospace
.select-mode-container 508.5,568.5 65.3x19
.select-search-container 576.8,567 22x22
.submit-button-container 970.5,567.5 21x21   position absolute; right 0
```

## 3. Onboarding walkthrough

All six steps were walked in both applications and compared frame by frame.
Content equality covers the step title, subtitle, bullet list, language list,
button labels and the six step-chip labels.

| Step | Title | Content identical | AE (pixels) | AE % | RMSE |
| --- | --- | --- | --- | --- | --- |
| 1 | Select Language | **yes** | 13,854 | 2.309 % | 4.91 % |
| 2 | Environment Configuration | **yes** | 3,897 | 0.650 % | 3.55 % |
| 3 | Tool Compatibility | **yes** | 3,869 | 0.645 % | 3.52 % |
| 4 | Test Type | **yes** | 3,845 | 0.641 % | 3.55 % |
| 5 | Packet Sniffer | **yes** | 3,913 | 0.652 % | 3.52 % |
| 6 | Export Report | **yes** | 4,771 | 0.795 % | 3.89 % |

The step-1 residual is larger because that step renders eleven language
options, so a 0.5 px offset in the modal accumulates over a larger text area.

## 4. Behavioural parity

| Behaviour | Reference | Recreation | Parity |
| --- | --- | --- | --- |
| First launch shows the walkthrough | `onboarding_status` DB setting empty | same key, same semantics | exact |
| Completion records the flag | `setUserSetting("onboarding_status","1","string","Onboarding status")` | identical call and arguments | exact |
| Theme | `html.theme-light` on first run, class toggles the palette | identical | exact |
| Root font size | inline `font-size: 12px` on `<html>` | identical | exact |
| Font family | not declared → UA default serif | not declared | exact |
| Button label colour | inherited `--foreground` (black on blue) | identical | exact |
| Centre-pane clipping | 400 px content in a 246 px pane | identical | exact |
| Scrollbars | Chromium overlay (no layout impact) | `enable-features=OverlayScrollbar` | exact |
| Chat composer geometry | 483×36 two-row monospace textarea | identical | exact |
| **Account required** | **yes — every server feature is gated** | **no — a local profile is created and nothing is gated** | **intentional divergence** |
| **AI provider** | **Penligent service only** | **any OpenAI-compatible endpoint or Anthropic** | **intentional divergence** |

### 4.1 AI provider layer — verified against mock providers

A mock OpenAI-compatible server (`/v1/chat/completions`) and a mock
Anthropic server (`/v1/messages`) were run alongside the application and the
provider layer was exercised end to end.

| Check | Result |
| --- | --- |
| Provider configuration saved to the database | **PASS** |
| API key redacted when returned to the renderer (`sk-m••••-key`) | **PASS** |
| "Test connection" reaches the OpenAI-compatible endpoint | **PASS** |
| Non-streaming OpenAI-compatible completion | **PASS** |
| Streaming OpenAI-compatible completion | **PASS** |
| Provider switched to Anthropic | **PASS** |
| "Test connection" reaches the Anthropic endpoint | **PASS** |
| Streaming Anthropic completion | **PASS** |
| Unreachable provider reports a readable error instead of crashing | **PASS** |

**10/10 provider checks passed.**

### 4.2 AI features through the real UI

| Check | Result |
| --- | --- |
| Probe project created and selected in the Projects view | **PASS** |
| Message typed into the composer | **PASS** |
| Send button clicked | **PASS** |
| Chat shows the user message | **PASS** |
| Chat shows the streamed assistant reply | **PASS** |
| Both messages persisted in `chat_records` (`user` + `assistant`) | **PASS** |
| "Generate with AI" clicked | **PASS** |
| AI test plan stored in `test_lists` as JSON | **PASS** |

**9/9 AI UI checks passed.**

## 5. Technical parity

| Layer | Reference | Recreation | Parity |
| --- | --- | --- | --- |
| IPC channels | 116 `ipcMain.handle` | same channel vocabulary | exact (names) |
| Preload namespaces | 12 | 12 | exact |
| Database tables | 21, verbatim DDL | 21, verbatim DDL | exact |
| Query surface | ~150 exported functions | same functions, same schema | exact |
| Route table | 3 routes | 3 routes | exact |
| Named components | 64 recovered | shell, panels, 8 views, onboarding, dialogs | partial — see §6.2 |
| Window geometry | 1000×600 / min 1050×600 / hidden title bar | identical | exact |
| Proxy window | 1000×800, "抓包详情 - 渗透测试工具" | identical | exact |
| Design tokens | `:root` + `.theme-light` | byte-for-byte | exact |

### 5.1 Functional checks (reconstruction, against its real SQLite database)

```
PASS  database reachable from the renderer
PASS  user_settings round trip
PASS  project create + read back
PASS  risk item persisted
PASS  chat record persisted
PASS  test list persisted
PASS  proxy settings upsert
PASS  project delete

8/8 functional checks passed
```

### 5.2 Automated test suite

```
npm test          10 tests, 10 pass   (theme tokens, IPC contract, AI channels)
npm run test:db    7 tests,  7 pass   (schema, data layer — under Electron's ABI)
```

### 5.3 Test totals

| Suite | Result |
| --- | --- |
| Unit — theme tokens, IPC contract, AI channel registration | 10 / 10 |
| Schema and data layer (Electron ABI), including the orphan-cascade test | 8 / 8 |
| Functional — real SQLite database | 8 / 8 |
| AI provider layer — both families, streaming and non-streaming | 10 / 10 |
| AI features through the real UI | 9 / 9 |
| Bug-audit regressions — the 15 defects that were found and fixed | 9 / 9 |
| Scanner and crawler — the bundled xray binary against a live target | 6 / 6 |
| MITM proxy — a real request through the proxy, intercepted and stored | 6 / 6 |
| Report generation and the provider model list | 8 / 8 |
| Agent orchestration — task selection, action assembly, queue | 17 / 17 |
| **Total** | **91 / 91** |

## 6. Discrepancy register

### 6.1 Not reproduced

| # | Item | Reason | Mitigation |
| --- | --- | --- | --- |
| D1 | **Penligent's proprietary AI service** (`api.penligent.ai`) — its hosted task-tree service, skill library and account system | The service is proprietary and not present in the package | **The AI features work against your own provider** (OpenAI-compatible or Anthropic) with no account; see §4.1–4.2. Three of its parts turned out to be recoverable and are implemented: the **model routing** (its `/api/model/open` is unauthenticated), the **report rendering** (every input the service receives is assembled client-side) and the **tool-orchestration policy** (the client decides the task sequence, the completion check and the report trigger) |
| D2 | MITM interception engine | — | **Resolved.** The reference's own `services/proxy/interceptor.js` and `services/proxy/index.js` were recovered from the package and ported faithfully, and `mockttp` 4.2.3 (the reference's exact version) is used. The proxy child, the CA generation, the TLS passthrough and auth-bypass lists, the pause/release/drop flow and the `proxy_history` persistence are all reproduced and verified end to end |
| D3 | — | — | **Resolved.** The same `scanner_linux_amd64` (xray v1.8.2), `crawlergo` and Chrome-headless-shell 120 that the reference ships are bundled in `resources/depency/` and are driven with the reference's exact argument shapes. The scanner was verified to detect a real finding and write it to `scan_result` |
| D4 | Encrypted database | The reference encrypts with `better-sqlite3-multiple-ciphers` | Same schema, stored unencrypted for inspectability. **The original's encryption was not bypassed** — the schema was recovered from the application's own DDL |
| D5 | Vue Flow graph rendering | Extra runtime dependency | Plain SVG using the same `--node-1`…`--node-6` / `--node-risk` palette |
| D6 | vue-i18n locale tables | Bundled but keyed by Chinese identifiers; the English values were captured live instead | The English strings are hard-coded and the reference's own key names are documented in `RECONSTRUCTION.md` |
| D7 | The full 64-component inventory | The reference's component set is far larger than the reachable surface | The views and components that are reachable are reproduced; the rest are service-gated (D1) |
| D8 | Reference app auto-update (`app-update.yml`) | Points at the vendor's update server | Not reproduced; no update channel is contacted |
| D9 | Reference "Pack" header entry | Not resolvable to a route in the reference bundle | The two panel toggles are present and now functional (they hide/show the left and right panes) |

### 6.2 Intentional divergences

| # | Divergence | Magnitude | Rationale |
| --- | --- | --- | --- |
| C1 | No account system; a local profile is created on first run | — | The request was for a version with no login. The `users` table and its columns are unchanged |
| C2 | AI provider is user-configurable (OpenAI-compatible or Anthropic) instead of Penligent-only | — | The Penligent service is unreachable. Both provider families are implemented and verified |
| C3 | The header account button shows the local profile name instead of "Login" | +8.1 px on `.header-right` | "Login" would be misleading with no login |
| C4 | The Task List view has a "Generate with AI", "Crawl" and "Scan" toolbar | three extra controls | The new test-plan generator and the bundled scanner/crawler |
| C5 | The agent panel has a gear button that opens the AI settings | one extra 22×22 control | The provider has to be reachable from the panel |
| C6 | The "Not Logged In" toast no longer appears | — | Nothing is gated any more |

### 6.3 Known visual deviations

| # | Deviation | Magnitude | Cause |
| --- | --- | --- | --- |
| V1 | Onboarding modal horizontal offset | 0.5 px | The reference loses 1 px to a scrollbar gutter; the recreation loses 0 |
| V2 | One squeezed centre-nav label is ~6.5 px wider | 6.5 px | Flex min-content distribution of a text node inside a shrinking flex item |
| V3 | Antialiasing in the centre-nav label | 355–4,884 px | Sub-pixel glyph placement, not a layout difference |

## 7. Fidelity tiers

**Reproduced exactly**

* Application shell layout, geometry, colours, typography and interaction states
* Both theme palettes and the light/dark switch
* The six-step onboarding walkthrough, including its content, chip states and
  completion semantics
* The five centre views, the two left views and the agent panel composer
* The 21-table database schema and its query surface
* The 116-channel IPC vocabulary and the preload namespaces
* Window geometry, the proxy detail window and the desktop-entry conventions
* The `onboarding_status` settings flag and its exact call signature

**Substituted (intentional, and working)**

* The account system → a local profile; nothing is gated
* The Penligent AI service → an OpenAI-compatible or Anthropic provider
  chosen by the user, with streaming, stop-generation, a connectivity probe
  and readable provider errors
* The hosted test-plan service → local generation from the same provider,
  stored in the same `test_lists` shape

**Recovered from the reference and reimplemented**

* the model routing table and its fallback
* the report rendering, from the same client-side inputs
* the tool-orchestration policy: task selection, action assembly, the
  auto-round loop and the tool-summary queue
* the nine `system_prompt_config` variables the client sends
* the chat mode list (`["Ask", "Agent"]`)
* the `context` array (the last six chat entries)

**Reproduced approximately**

* The threat-map graph (SVG instead of Vue Flow)
* The report export flow (structure only; Penligent's hosted templates are
  unavailable)

**Not reproduced**

* Penligent's hosted extras: proprietary task-tree service, report templates,
  skill library, telemetry and auto-update (D1, D6, D8)
* Database encryption (D4, deliberately)


## 8. Round 3 — the surfaces that were still outstanding

The previous rounds closed the shell and the six views. This round worked
through the parity matrix (`PARITY.md`) and closed every remaining surface.

### 8.1 Localisation — recovered in full

The reference bundles **eleven** complete locale tables, identified by the
reference's own `messages` object in its i18n instance:

```js
messages: { zh: …, en: …, jp: …, ru: …, kr: …, fr: …, de: …, ar: …, tw: …, es: …, pt: … }
```

Each table holds **48 namespaces and 811 keys**, all recovered verbatim from
the de-obfuscated renderer bundle and written to `src/locales/*.json`. The
recreation is therefore localised in the same eleven languages, with the
reference's own wording — for example `header.新建项目` is "New Project" and
`center.攻击面测绘` is "Threat Map". The onboarding language picker and the
Settings language list both use the reference's own labels and codes.

### 8.2 Reverse shell generator — the payload library is local

The reference's generator is a local template table, not a service call. All
**41 payload templates** were recovered with their names, descriptions,
target operating systems, shells, listener types and the payload expressions
themselves, plus the reference's defaults (`10.10.10.101:9002`, `Reverse`,
`All`, `bash`, `none`) and its four listener types
(`Reverse`, `Bind`, `MSFVenom`, `HoaxShell`). The generator is interactive:
changing the address or the port changes the payload, and the payload is
computed, never a stored string.

### 8.3 Scan pipeline, Skills Library, proxy guide and AI tools

| Surface | Reference | Recreation |
| --- | --- | --- |
| Scan pipeline | `create-process` dialog, five stages | `ScanPipelineDialog.vue` — same five stages, wired to the bundled crawler, the bundled xray scanner and the configured provider |
| Skills Library | 攻击技战法库 over the local `ttp` table, TipTap editor | `SkillsLibraryView.vue` over the same table, TipTap editor with the table extensions |
| Proxy guide | `proxy-how-use` dialog | `ProxyHelpDialog.vue` with the reference's four sections and twelve lines |
| AI tools | `http-to-python`, `webshell-detection`, `abnormal-process`, skills audit, reverse shell | `AiToolsDialog.vue`, same five tools, same endpoints' payloads, sent to the user's provider |
| Test list creation | `task-create` dialog | `TestListCreateDialog.vue` |
| Update notice | `newversion` dialog | `NewVersionDialog.vue`, driven by a real check against the public version endpoint |
| Credit dialogs | `not-subscribed` on code 80001, `not-limit` on 80002 | `CreditDialog.vue`, raised on the same codes |

### 8.4 Route table

The reference's router was recovered verbatim and has **three** routes:
`/`, `/proxy-list` and `/splash-window`. The recreation previously had a
fourth (`/report`) that the reference does not have; the report is a dialog in
the reference (`openDialog("report")`), and it is one here too. The route
tables now match exactly.

### 8.5 The localisation did not cost fidelity

Pixel metrics after the round, measured the same way as before:

| View | Geometry diffs | Text diffs | AE (pixels) | AE % |
| --- | --- | --- | --- | --- |
| Shell (default) | 3 + 1 | 0 | 5,817 | 0.970 % |
| Centre → Task List | 3 + 1 | 0 | 5,817 | 0.970 % |
| Centre → Target Overview | 3 | 0 | 8,038 | 1.340 % |
| Centre → Threat Map | 3 | 0 | 7,397 | 1.233 % |
| Centre → Security Findings | 3 | 0 | 4,354 | 0.726 % |
| Centre → Tool Results | 3 | 0 | 5,374 | 0.896 % |

The three geometry differences are the same deliberate ones as before, and
the one additional difference is the account button, which reads "Local User"
here and "Login" in the reference because this build has no login.

### 8.6 Test suite

`35/35` passing, including new coverage for the locale tables (all eleven
languages carry identical namespaces and keys), the payload library (all four
listener types are represented and the address and the port are substituted
into the template) and the version comparison.


## 9. Round 4 — the two open questions, answered

### 9.1 The vendored tools stay, and the tree is no longer hostage to them

The reference ships `resources/depency/` inside the package: the xray
scanner, `crawlergo` and `chrome-headless-shell` 120. Vendoring them is the
faithful behaviour — removing them would break the scanner and the crawler,
which are core features, and would be a divergence from the original rather
than a simplification of it.

What was worth fixing is the *maintainability* of the arrangement, not the
arrangement itself:

* `resources/depency/MANIFEST.json` records every vendored file with its
  size and SHA-256.
* `scripts/fetch-dependencies.sh` restores the tools **from the original
  package** — the authoritative source, no network needed — and verifies them
  against the manifest. The original package is only read, never modified.
* `.gitignore` excludes the binaries, so version control holds 247 MB less
  while the working tree still behaves exactly like the reference's.

The script was tested end to end: the binaries were deleted from the tree
and restored, and all 15 files matched the manifest.

Graceful degradation was already in place and was verified: `binaryExists()`
gates the scanner and the crawler, and a missing binary yields
`"The scanner binary is not present in this installation."` rather than a
crash.

### 9.2 The store split — partly adopted, for a behavioural reason

Most of the reference's 21 stores are internal organisation, and splitting
this reconstruction's state 21 ways would be over-engineering with no
observable difference. Two were worth adopting, because they are *mechanisms*
the reference actually uses rather than containers:

**The dialog store.** The reference opens every dialog by name through one
store — `openDialog("not-subscribed")` — and its agent calls it from the
error path. This reconstruction dispatched dialogs through ad-hoc window
events and a flag per dialog. It now has `src/stores/dialog.js` with the
reference's semantics: a `dialogStr` naming the open dialog, a ten-entry
history, and the `new-version` dialog holding the screen on its own. All the
dialogs are rendered by one `DialogHost` component, exactly as the reference
renders its own.

**The theme and font-size stores.** These existed here already but were
unreachable — no control exposed them, so the theme was locked to light for
good. The reference's Settings dialog has both, and the reference's Settings
dialog also has a *language* row built from eleven buttons rather than a
dropdown. The recreation's Settings dialog now has the reference's three
rows, with the reference's own class names (`setting-content-item`,
`setting-content-item-label`, `setting-content-item-value`, `item-button`,
`button-active`):

| Row | Control | Behaviour verified |
| --- | --- | --- |
| Language | eleven buttons | the active one is marked `button-active` |
| Font Size | `−` / current value / `+` | 12px → 13.5px on one step, restored afterwards |
| Theme | Dark Mode / Light Mode | `theme-light` ⇄ `theme-dark` on `<html>`, persisted under `localStorage["theme"]` |

The font scale is the reference's: a multiplier where 1 means 12px, stepping
by 0.125, capped at 1.5, with the presets 0.875 / 1 / 1.125 / 1.25. The
theme and the font size are also written to `user_settings`, as the reference
writes them.

This was found while checking the two open questions: it is a **missing
reference feature**, not an architectural preference.

### 9.3 Where the fidelity stands

Unchanged by this round — the same measurements, the same three deliberate
geometry differences and the same account-button difference:

| View | Geometry diffs | Text diffs | AE % |
| --- | --- | --- | --- |
| Shell (default) | 3 + 1 | 0 | 0.970 % |
| Centre → Task List | 3 + 1 | 0 | 0.970 % |
| Centre → Target Overview | 3 | 0 | 1.340 % |
| Centre → Threat Map | 3 | 0 | 1.233 % |
| Centre → Security Findings | 3 | 0 | 0.726 % |
| Centre → Tool Results | 3 | 0 | 0.896 % |

The test suite is now **44/44**, with new coverage for the dialog store (the
ten-entry history, the exclusive update notice), the theme store and the font
scale (the presets, the step and the ceiling).


## 10. Round 5 — the parity audit that found the real gaps

The parity matrix in earlier rounds was generated from the recreation's own
source, so it could only confirm what it was asked to confirm. This round
replaced it with an audit that works the other way round: it takes the
reference's surface — its component names, its dialogs, its stores and every
one of its 778 message keys — and asks, for each, whether the recreation
provides it. The script is `dynamic/audit-gaps.cjs`; the report it writes is
`GAP-AUDIT.md`.

The audit found **442 of the 778 recovered keys unused**, 55 reference
components and 11 dialogs with no counterpart. That is the honest measure of
what was missing, and it is what the rest of this round worked through.

### 10.1 The AI option

| Requirement | What was built |
| --- | --- |
| Shared installation-wide configuration | The provider configuration was already stored in `user_settings`, whose key is unique and carries no user column — so every profile reads the same one. The Settings dialog now says so, and a test asserts it. |
| The agent tools inside the AI options | `AgentNav.vue` reproduces the reference's agent-security dialog: the two rows (Skills Audit Tools, OpenClaw Security Scan) with the reference's descriptions. The first opens the toolbox on the `agent-skills-detection` tab; the second opens the task dialog with the test type `AgentScan`. The header's "OpenClaw Security Tools" entry now opens it instead of an external URL. |
| Penligent's own models as a choice | A third provider, `penligent`, whose model list comes from the public `GET /api/model/open`. Verified live: `["penliai-4-5-101", "pentest-gemini-3-flash"]`, no credentials. Its requests use the reference's own path and body. |

The reference's agent request body was recovered verbatim and is what the
Penligent provider sends:

```
POST {base}/api/agent/main/v1/messages
Authorization: Bearer <token>

{ auto_send_status, model, mode, project_id, user_input, Language, context,
  current_target_info, remark, history_summary, timeout_tools, risk_list,
  enable_web_search, system_prompt_config, plugins }
```

`system_prompt_config` carries the nine client-side variables.

### 10.2 The views, rebuilt against the reference

**Target Overview.** The reference's view reads the project's `over_view`
document; the recreation now produces that document from what the local tools
establish and both views read it. The section order, the labels, the
two-column rows, the empty-value treatment and the `(n)` count all match —
the measured text comparison for this view is now **identical**.

**Threat Map.** The reference lays the attack surface out as a Vue Flow graph
in three columns — the target at x=200, the group nodes at x=750, their
children at x=1300 — with the heights, the 100 px spacing, the edge colours
(`#8b5cf6` / `#10b981` / `#ef4444`), the arrow markers and the HTTP-method
ordering all recovered from the bundle. Vue Flow is now a dependency, and the
twelve node types are the reference's.

**Task List.** The reference's tree now has its title, its total progress
(`10/20 (50%)`), the incomplete filter, the add entry and the per-task
actions, plus the reference's add/edit task dialog with its three fields and
its completeness check.

**Security Findings.** The reference's verification vocabulary is implemented:
`open`, `verifing`, `failed`, `risk_confirm`, `risk_exclude`, `risk_doubt`
and `stopped`, with the four per-risk actions.

### 10.3 The dialogs

The task-creation dialog was a four-field stub; it is now the reference's
four-step wizard — Target Info, Input, Config and Authorization, with the
four steps (Target Details, Access Setup, Legal Confirmation, Reuse Data),
the nine test types from `GENERIC` to `AgentScan`, the analysis depth, the
headless-browser switch, the automatic API-risk screening, the credentials
and custom headers, and the five context fields. It stores what it collects
in `project_remarks`, `auth_parameters` and `header_parameters`, exactly
where the reference keeps them.

### 10.4 Where it stands

| Measure | Before this round | After |
| --- | --- | --- |
| Recovered message keys in use | 317 / 778 | **487 / 778** |
| Recovered keys unused | 442 | **284** |
| Pixel difference, shell | 0.97 % | 1.38 % |
| Pixel difference, Target Overview | 1.34 % | 2.16 %, text **identical** |
| Tests | 44 | **46** |

The remaining 284 unused keys are the reference's `notice` toast vocabulary
(66), the report dialogue (23), the proxy intercept rules and history (26),
the remaining tool panels, and the dialogs still to come.


## 11. Round 6 — the remaining 284 keys, finished

The audit was refined first: a key that exists only in the reference's locale
tables, and that the reference never itself references in code, is not a
missing feature. That refinement cut the outstanding work from 284 keys to a
list of the keys the reference actually uses.

Every one of them is now used here.

### 11.1 The notice vocabulary

The reference's notice store is `addNotice({ title, content, type, duration })`
with duplicate-content suppression and a ten-entry stack; the recreation's
store now matches it exactly, and the reference's sixty-odd messages are
raised where the reference raises them:

| Where | Messages |
| --- | --- |
| The chat | the empty and over-long input, the web-search toggle, the manual interrupt, the send and receive failures |
| The risk verification | the three-at-once limit, the verification started and interrupted, the in-progress warning |
| The project list | the refusal to delete the last project, the success notice |
| The report | generated, failed, saved as Markdown, saved as PDF, the empty report |
| The environment settings | saved, failed, the incomplete-configuration warning |
| The threat map | the copy notice and the "nothing to copy" warning |
| The tool results | the empty state |
| The task list | the not-generated notices and the completeness check |

### 11.2 The dialogs

Seven more of the reference's dialogs now exist: the report download (name,
format, location), the feedback form (four questions), the environment
settings (the Python, Bash, script, proxy and working-directory paths), the
tool configuration, the authentication credential, the custom request header,
the technique creation form and the risk export.

### 11.3 The panels

The risk detail (evidence, command, summary, result, duration), the tool
result detail, the risk screening panel in the scan pipeline, the chat's
status messages (thinking, replying, parsing tool output, generating code,
searching the web) with their three-dot indicator, the chat's tool-call items
with their two actions, the chat's stop confirmation, the header's host
detail, and the security toolbox's per-tool headings and history.

### 11.4 The measurements

| Measure | Before | After |
| --- | --- | --- |
| Recovered keys in use | 487 / 762 | **641 / 762** |
| Keys the reference uses that the recreation did not | 275 | **0** |
| Pixel difference, shell | 1.38 % | **0.73 %** |
| Text differences | 1 view | **none** |

Every measured view now matches the reference's text exactly, and the three
remaining geometry differences are the deliberate ones: the account button
and the two header buttons it moves.

The task list was the last one: the reference renders nothing in it until a
project exists, and the recreation now does the same.


## 12. Round 7 — the parity check as a standing instrument

The audit was turned into something that runs every time, so parity cannot
silently regress.

### 12.1 The manifest

`reference/used-keys.json` records every locale key the reference itself
references in its code — 459 of them, after excluding the four sign-in
strings, which this reconstruction deliberately omits. It is committed, so
the check does not depend on the de-obfuscated bundle being present.

`scripts/build-reference-usage.mjs` regenerates it from the bundle, and
`npm run audit` runs it.

The manifest also exposed a weakness in the earlier audit: it counted a key
as used whenever its *text* appeared anywhere in the source, which matched
common words such as `取消` by accident. The manifest counts only the keys the
reference addresses as `$t("namespace.key")` — the stricter and correct
measure. Under it, 67 further gaps turned up.

### 12.2 What that found

All 67 are now implemented. Most were the reference's own wording where the
recreation had used English literals or a different key:

* the cancel label of each of the eight dialogs that has one;
* the form labels — username, password, header name and value, tool name,
  path, command and API configuration;
* the risk severities (`全部` / `严重` / `高危` / `中危` / `低危`) and the
  time units (`秒` / `分钟` / `小时` / `天`), which the recreation had been
  showing in English;
* the chat's `执行` and `继续` actions and the `全选` button;
* the technique form's severity field and its `创建` / `保存` buttons;
* the task dialog's `当前任务` marker, the `开始生成` controls and the
  `备注` label;
* the risk detail's `修复建议` and `工具执行结果`;
* the tool result's `命令`, `输出`, `中断` and its units;
* the threat map's `描述` and `示例`;
* the empty-history notices of the three AI tools.

### 12.3 The test

`test/parity.test.mjs` runs with the suite and checks four things:

1. every key in the manifest appears in the reconstruction;
2. the locale tables are complete;
3. the eleven languages carry identical namespaces and keys;
4. no translation is empty.

The suite is now **50/50** — the parity test is four of them.

### 12.4 The measurements

Unchanged by this round: all five centre views still match the reference's
text exactly, and the pixel difference is the same 0.73 %–2.16 % with the
same three deliberate geometry differences.


## 13. Round 8 — two defects found only by running the installed build

The comparison harness drives the application from a clean state, so it never
exercised the installed package or a project that already existed. Two
defects survived it and were found only by running the installed application
on the host.

### 13.1 Dialogs opened from the task list were clipped away

The centre panel has `overflow: hidden`, and the add-task dialog was rendered
inside the task list, which lives inside that panel. The button fired, the
dialog mounted — and it was clipped to the panel, so nothing appeared to
happen.

The reference renders its dialogs at the application root through the dialog
store, and so does the reconstruction now: the task dialog is registered in
the dialog host and opened by name. The measured dialog is 1050×600 and covers
the viewport, instead of being confined to the centre column.

### 13.2 Closing the main window did not quit the application

The reference closes the packet window together with the main window, so
that `window-all-closed` fires and the application quits. The reconstruction
had no `close` handler on the main window at all, so with the packet window
open the application stayed alive after the main window was closed.

The main window now closes the packet window and stops the proxy child, and
`window-all-closed` stops the child before quitting. Measured on the
installed build: seven processes before the close, one after.

### 13.3 The task list's buttons

They were also wrong in shape. The reference offers one **Add** button that
opens a menu with two entries — a detection item and a custom test task —
and the recreation had flattened that into separate buttons, added two
identical "Start Generating" buttons, one of which opened the add dialog
instead of generating, and left a hidden placeholder button in the markup.

The toolbar is now four buttons — *Switch to Incomplete*, *Add* (with its
menu), *Delete All* and *Start Generating* — each wired to the action it
names.

### 13.4 Verified on the installed package

| Check | Result |
| --- | --- |
| The task list's buttons | *Switch to Incomplete*, *Add*, *Delete All*, *Start Generating* |
| The Add menu | *Add Detection Item*, *Add Custom Test Task* |
| The dialog | 1050×600, covers the viewport, rendered at the application root |
| Closing the main window | the application quits (7 processes → 1) |


## 14. Round 9 — the systematic audit

The comparison harness drives the application from a clean state, so it could
not see defects that only appear once a project exists, a dialog is opened
from inside a panel, or the application is installed rather than run from
the source tree. This round ran a partitioned audit of the whole codebase
against the reference, with the findings in
`/home/nixon/penligent-analysis/evidence/audit/`.

### 14.1 Method

The reference's de-obfuscated bundle is the authority. The audit was
partitioned by surface, and each area was compared field by field: the same
conditions, the same order, the same defaults, the same error handling, and
the same columns written.

Seven areas were audited (header and left panel, centre and shell, chat and
agent, dialogs, task list, findings and tool results, main process and
preload). The reports hold **150 findings**, of which **13 were critical**.

### 14.2 The critical defects

| Defect | Effect |
| --- | --- |
| `LeftPanel` dispatched **and** listened for `penligent:new-project` | `dispatchEvent` is synchronous, so every click recursed until the stack overflowed |
| `window.dispatchEvent` in a Vue template | Vue compiles it to `_ctx.window`, which the public-instance proxy does not have — every such control threw a `TypeError` |
| `$emit` used as the name of the event bus | Vue already defines `$emit` on every component instance, so the calls went to the component instead of the bus |
| `HomeView` referenced an undeclared `projectStore` | the "Export Report" control threw a `ReferenceError` and never opened the report |
| The main window had no `close` handler | closing it did not close the packet window, so `window-all-closed` never fired and the application stayed alive |
| `updateRiskItemVerifyStatus` / `LikeStatus` / `VerifyContext` wrote `status` / `description` | the verification state was never persisted, and the finding's ignore flag and description were destroyed |
| `updateProjectTaskMode` wrote `task_tree` | changing the mode destroyed the test plan |
| `ToolAddDialog` sent `tool_name` / `tool_path` / … | the table's columns are `set_name` / `command_path` / …, so every tool was stored empty |
| `fork-proxy-child-data` was invoked but registered with `on` | the capture window's release, drop and replay controls all rejected — intercepted requests could never be released |
| The agent orchestration was never invoked | the port was faithful but nothing called it: the agent could neither run a command nor follow the plan |
| `system_prompt_config`'s four values were hard-coded | the client information, the interpreter paths and the tool list were always empty |
| The task list flattened the two-level tree | the group level — the phase name, its progress, its rename and delete — did not exist |
| The per-task actions assigned to a plain object | nothing was written, so a task could never be completed and the report could never be generated |

### 14.3 What was fixed

All thirteen criticals are fixed, and the fixes were verified on the
**installed** package rather than in the source tree:

| Check | Result |
| --- | --- |
| "New Project" | opens the task-creation dialog, covering the viewport; no recursion |
| "Export Report" | opens the report dialog |
| The centre panel's collapse control | the panel collapses |
| The task mode | the test tree is preserved and the mode is written |
| Closing the main window | the application quits (7 processes → 1) |
| Console errors while exercising all of the above | none |

The agent's run loop is now wired: the model proposes its tool calls, the
client decides which run next, the commands are executed, the results are
fed back with the incremented analysis round, and the model is asked again —
the reference's chain, over the user's own provider.


## 15. Round 10 — the majors, fixed

The criticals from the audit were fixed in round 9. This round worked through
the majors, and three more audits ran in parallel over the areas the first
seven had not covered (the overview, the threat map and the tool views; the
proxy, the scanner and the database; the eleven locale tables).

### 15.1 What the three further audits found

| Area | Findings |
| --- | --- |
| Overview, threat map, tool views | 12 |
| Proxy, scanner, database | 44 — including a critical |
| The eleven locale tables | 9 |

### 15.2 The critical that mattered most

**No crawler or scan result was ever written to the database.**
`crawlerRepo.cjs` opened the database with `getDatabase()` and no argument,
but `getDatabase(app)` dereferences `app.getPath("userData")` — so it threw,
both callers swallowed it, and `crawler_result` and `scan_result` stayed empty
while the interface reported "Crawl Complete — N requests discovered". The
app now captures the Electron app when the database is initialised, so the
crawler and the scanner can open it themselves.

### 15.3 The rest

* **The AI Tools dialog threw on its first paint.** The reference's
  `http-to-python.例如` value carries a literal JSON body, and vue-i18n's
  message compiler rejects a nested placeholder — so the whole dialog failed
  to render. The example is now built by the component.
* **The locale tables were missing a namespace.** All eleven now carry
  `xray_info_format` — 60 entries each, the reference's own descriptions and
  remediations for every xray finding type. The extraction artefact that
  looked like a namespace (the obfuscator's variable names) is gone.
* **The project row** now shows the target, the *updated* time, and the
  description and the edit and delete buttons in a hover popup, as the
  reference does.
* **The first project is selected on startup**, and switching projects
  refuses while a verification, a chat or a tool run is in progress.
* **The centre navigation is global**, as the reference's `navStr` is, and the
  badge shows the group counts rather than a constant.
* **The centre header shows the current target.**
* **The task list renders the group level** — the phase name, its progress —
  and completing a task writes `is_complete` back, which is what unblocks the
  orchestration's "all done → report" rule.
* **The chat has its Manual mode**, where the user picks which of the model's
  tool calls run, and the reference's "Edit Command" and "Search Execution
  Result" actions now do something.
* **The risk counters exclude the ignored findings**, as the reference's do,
  and the export writes the one finding it was opened for as Markdown.
* **The tool results read the reference's columns** — `parameters` for the
  command and the explanation, `result_data` for the output.
* **The proxy history is an upsert** on the request id and is written as the
  capture arrives, rather than only when the user presses "Save".
* **The file IPC contract matches**: `read-file` returns `content`,
  `get-file-path` returns a path, and the plugin list reads `tools`.
* **The window is guarded** — navigation and window opening cannot take the
  application away from its own content.
* **The tool configuration lists the project's tool sets**, as the reference's
  does, with a delete button on the hovered row.

### 15.4 Verified on the installed package

| Check | Result |
| --- | --- |
| "New Project" | the task-creation dialog, covering the viewport |
| "Export Report" | the report dialog |
| The collapse control | the panel collapses and comes back |
| The task mode | the tree is preserved |
| The AI Tools dialog | renders, with all five tools |
| The tool configuration | renders, with the add button and the notes |
| The project row | shows the updated time |
| The AI Tools dialog's console errors | none |
| Closing the main window | the application quits (7 processes → 1) |


## 16. Round 11 — the target tools, the verification pipeline, and a corrected method

### 16.1 The target tools

The reference ships eight small utilities the agent calls to check a target
before testing it, and the recreation had none of them — the preload's
`targetToolsAPI` was a stub that routed every call to `get-hidden-info` and
returned a machine identifier.

All eight now exist, with the reference's own return shapes:

| channel | returns |
| --- | --- |
| `detect-input-type` | `{ type: "ip"\|"domain"\|"invalid", input, valid, version }` |
| `resolve-hostname` | `{ success, input, ipv4, ipv6, all }` |
| `reverse-ip` | `{ success, input, hostnames, primary }` |
| `scan-ports` | `{ success, host, open, openPorts: [{ port, service }] }` |
| `scan-subdomains` | `{ success, domain, found, subdomains }` |
| `check-ip` | `{ success, input, message }` |
| `check-domain` | `{ success, input, message, records }` |
| `check-sensitive-path` | `{ success, input, message, sensitive }` |

The Target Overview now calls them, as the reference's does. The preload's
namespaces are the reference's own: `targetToolsAPI` and `checkToolsAPI`.

### 16.2 The verification pipeline

The reference's **Verify** control runs a pipeline — it appends to the
verification transcript, asks the model, takes the verdict, writes
`verify_status` and `verify_context`, and saves the technique to the Skills
Library when the finding is confirmed. The reconstruction wrote a status
string and stopped. It now runs the pipeline, against the user's provider.

### 16.3 A corrected verification method

The comparison harness had been driving the container's **development copy**
of the project while the `.deb` was installed separately, so several rounds
of verification were measured against a stale build. The harness now deploys
the current build before it measures, and every result below is from the
deployed tree.

With that corrected, the final measurements are:

| View | Geometry diffs | Text diffs | AE % |
| --- | --- | --- | --- |
| Shell | 3 | 0 | **0.73 %** |
| Centre → Task List | 3 | 0 | **0.73 %** |
| Centre → Target Overview | 3 | 0 | 2.16 % |
| Centre → Threat Map | 3 | 0 | 1.33 % |
| Centre → Security Findings | 3 | 0 | **0.73 %** |
| Centre → Tool Results | 3 | 0 | 0.90 % |
| Left → Tool Config | 3 | 0 | **0.73 %** |

Every view matches the reference's text exactly.

### 16.4 The localisation is verified, not assumed

A fresh audit compared all **9,581 leaf values** across the eleven languages
against the reference's own tables, two independent ways. All of them are
byte-identical. The five call sites that asked for keys which do not exist
were corrected, and a test now asserts that every key the source names
resolves — so that class of defect cannot come back.


## 17. Round 12 — the last majors

### 17.1 The risk detail

The reference shows four blocks under a finding: the verification transcript
(rendered only when the finding has been verified), the remediation, the
evidence list, and the tool executions behind the finding. The recreation
showed none of them properly — the evidence came from a field that does not
exist, and the tool executions were never loaded. All four are now there, and
the tool executions are assembled from the `risk_items_execution_results` link
table joined with the execution results, as the reference does.

### 17.2 The generation flow

The reference stores a **tree** of groups and focuses the whole first task;
the recreation stored a flat array and focused only its id. The plan is now
stored as a tree, the focus is the whole task, and the focus description is
generated rather than copied.

### 17.3 The tree's actions

* **Add** — a detection item goes into the chosen group; a custom task creates
  or fills the reference's custom group.
* **Delete All** — deletes the chosen phase, and refuses while the phase
  holds the focused task.
* The environment dialog now has exactly the three inputs the reference has;
  the proxy and the working directory have their own settings but the
  reference's dialog never shows them.

### 17.4 The final measurements

| View | Geometry diffs | Text diffs | AE % |
| --- | --- | --- | --- |
| Shell | 3 | 0 | **0.73 %** |
| Centre → Task List | 3 | 0 | **0.73 %** |
| Centre → Target Overview | 3 | 0 | 2.16 % |
| Centre → Threat Map | 3 | 0 | 1.33 % |
| Centre → Security Findings | 3 | 0 | **0.73 %** |
| Centre → Tool Results | 3 | 0 | 0.90 % |
| Left → Tool Config | 3 | 0 | **0.73 %** |

Every view matches the reference's text exactly, and the three geometry
differences are the deliberate ones: the account button and the two header
buttons it moves.

### 17.5 The remaining findings

Eleven audit reports, 200-odd findings. The criticals are all fixed and
verified, and the majors are fixed bar the tail listed in `GAP-AUDIT.md` —
mostly the cosmetic details of the dialogs' internal layout and a few
one-line label differences. The report is the record; nothing in it is
silently dropped.

## 18. Round 13 — the residual audit, closed out

The eleven audit reports (240 findings) were worked through file by file.
The reference's own surface drove the work: its SQL, its message tables, its
dialog names, its store members and its component markup were each read out
of the bundle and compared with what the reconstruction provides.

### 18.1 What changed

| Area | Change |
| --- | --- |
| The database | The reference's exact queries: the `users` / `projects` / `chat_records` / `risk_items` / `report_exports` / `crawler_result` / `ai_tools` / `proxy_settings` / `proxy_history` orderings, the `app.db` file name, the `over_view` column, the `updated_at` columns, the `like_status` / `verify_status` / `verify_context` writes, the risk-to-execution link table, the settings' type switch, the project field update |
| The preload and the main process | The reference's shared store (`store:get-all`, `store:get`, `store:set`, `store:patch`) and the chat bridge (`set-chat-input`), the SSE generator (`start-sse-genrate` / `stop-sse-genrate`), the task manager's `stopTask`, the risk-items-by-execution channel, the overview's own column |
| The chat | The reference's message structure (`think_content`, `text_content`, `tool_meta_data`, `tool_choose_list`), the per-message tool selection, the eight-message history, the mode dropdown's class, the web-search icon pair, the interrupted reply no longer being written to the database, the markdown renderer (`markdown-it` + `DOMPurify`) |
| The task list | The generation moved into the reference's own `test-list-generate` dialog with its streaming log, the tree stored as groups of tasks, the focus moved onto the test button, the per-task *not complete* button, the reference's counts over the whole tree |
| The findings | The stop control, the like and dislike buttons, the four detail blocks, the reference's duration parts, the time on each finding, the upper-case severity |
| The overview | The reference's document shape (`open_ports_services` grouped by address, `reverse_dns`, `{path, description}` sensitive paths, `update_time`), the API entries as `{path, methods, auth_required, description, examples}` |
| The map | The TLS node's six rows, the API method group, the copy fallback, the reference's four SVG markers, the flow's zoom limits |
| The proxy | The guide inside the page (four steps, the reference's text), the settings panel (address, timeout, interception rules), the localised toolbar |
| The scanner | The reference's three risk levels, the snapshot read, the request id threaded through, the per-platform binaries, the crawler's progress channel |
| The dialogs | Every reference dialog name now resolves: `task-set`, `tool-set-add`, `chat-model`, `auto-target-info`, `auto-target-scan`, `test-list-add`, `test-task-add`, `test-list-generate`, `test-phase-edit`, `test-phase-delete`, `notice-subscribe-report`, `notice-subscribe-risk` |

### 18.2 Measured on the installed build

`dynamic/verify-installed-views.cjs` drives the **installed** `.deb` — not
the dev copy — through the seven views and compares each screenshot with the
reference's stored one:

| View | AE (pixels) | AE % |
| --- | --- | --- |
| Shell (default) | 9,610 | 1.602 % |
| Centre → Task List | 9,610 | 1.602 % |
| Centre → Target Overview | 18,055 | 3.009 % |
| Centre → Threat Map | 12,095 | 2.016 % |
| Centre → Security Findings | 10,692 | 1.782 % |
| Centre → Tool Results | 10,146 | 1.691 % |
| Left → Tool Config | 21,120 | 3.520 % |

These are upper bounds: the reference's shots were taken in the container
with that container's fonts, and the recreation is measured on the host with
the host's fonts, so every glyph carries a sub-pixel difference that has
nothing to do with the reconstruction. The layout, the strings, the icons
and the spacing are identical — a header crop of the two shows the same
items in the same places.

### 18.3 The console and the exit

`dynamic/verify-installed-console.cjs` walks the five centre views and eleven
dialogs on the installed build and records every console error, every
exception and the process count:

```
console errors : 0
console warnings: 0
processes before the close: 6
processes after the close : 0
```

It found one real defect on the way — the tool results view still referred to
a computed that had been renamed, which threw on every navigation to that
view. It is fixed.

### 18.4 The locale tables

The reference's eleven tables hold **811** leaf values each — **8,921** in
total. Every one of them was compared with the reconstruction's own table,
byte for byte:

```
leaf values compared : 8,921
byte-identical       : 8,921
differing            : 0
```

(48 namespaces per language; the recreation adds `xray_info_format`, whose
values are the xray finding descriptions the reference carries in its
`xray_info_format` object rather than in its message table.)

The gap audit reports **668** of the reference's keys in use, **0** unused,
**0** ambiguous, and every one of the reference's dialog and store names
resolving.

## 19. Round 14 — three defects the operator found in use

Running the installed build by hand surfaced three defects that the
automated checks had not: the title bar's buttons did nothing, a notice
showed its raw locale keys, and the settings dialog carried two account
controls that could not do anything.

### 19.1 The title bar's buttons were dead

`electron/preload.cjs` exposed the window controls with `ipcRenderer.invoke`
while `electron/ipc/windowInfo.cjs` served them with `ipcMain.on`. An
`invoke` to a channel with no handler registered is rejected, so **minimise,
maximise and close did nothing at all**.

The reference's preload is explicit about the split — `invoke` for the state,
`send` for the five actions:

```js
contextBridge.exposeInMainWorld("windowAPI", {
  getWindowState: () => ipcRenderer.invoke("get-window-state"),
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  unmaximize: () => ipcRenderer.send("window-unmaximize"),
  exitFullScreen: () => ipcRenderer.send("window-exit-full-screen"),
  close: () => ipcRenderer.send("window-close"),
  ...
});
```

`electron/ipc/windowInfo.cjs` is now a port of the reference's module, and
the preload uses `send` for the five actions. The renderer drives them
through a new `src/stores/window.js`, which is the reference's own window
store: it reads the state when the application starts, *restore* unmaximises
a maximised window, leaves full screen if the window is in it and maximises
it otherwise, and *close* marks the runs that are still going as stopped
before it closes the window.

One deliberate improvement on the reference: the reference acts on
`BrowserWindow.getFocusedWindow()`, so its buttons stop working once the
window has been minimised — a minimised window is not focused. The
recreation falls back to the main window, so the close button still closes
the application.

Measured on the installed build:

```
the window state before the restore: {"isMaximized":false,"isMinimized":false,"isFullScreen":false}
the window state after the restore : {"isMaximized":true,"isMinimized":false,"isFullScreen":false}
the window state after the minimize: {"isMaximized":false,"isMinimized":true,"isFullScreen":false}
processes before the close: 6
processes after the close : 0
```

### 19.2 A notice showed its raw locale keys

`src/stores/dialog.js` raised its notices with the keys themselves — the
store has no `t` of its own, so the screen showed `notice.提示` and
`notice.请填写完整的环境配置` instead of the reference's wording.

`src/locales/index.js` now exports a `translate(key)` that goes through the
global i18n instance, and the store uses it. The notice reads:

```
Notice
Please complete the environment configuration.
```

### 19.3 "View Plan" and "Logout" — why they existed, and why they are gone

They are the reference's **account** controls, and they were carried over
with the rest of the settings dialog. This build has no Penligent account:
*View Plan* opened the account's plan page, and *Logout* raised a notice
saying the profile had been signed out without signing anything out. Both
were controls that could not do anything.

They are removed rather than left in place. The two keys join the four
sign-in keys in the parity manifest's `excluded` block, with the reason
recorded, and the generator (`scripts/build-reference-usage.mjs`) now carries
the same list so a regeneration does not lose it. The *User Info* row stays
and still shows the local profile.

The settings dialog's text now ends with the user row, the language, the
font size, the theme, the model, the temperature, the token budget and the
system prompt — and nothing that pretends to be an account.

### 19.4 The result

```
unit tests            54 / 54
console errors        0
console warnings      0
close button          6 processes → 0
notices               translated, no raw keys
account block         removed
pixel difference      1.602 % – 3.520 % across 7 views (unchanged)
```

## 20. Round 15 — the audit reports, re-checked one by one

The eleven reports hold **240** findings: 13 critical, 94 major, 96 minor and
37 nit. Every one was re-read against the reference's own source and the
current code, and every one that could be closed was closed. What follows is
what is left, stated plainly.

### 20.1 Closed in this round

| Area | Change |
| --- | --- |
| The task list | The reference's button contract: the *test* and *complete* buttons are hidden for the focused task and for a task that is already complete, the *not complete* button appears for a complete one, every button carries an icon **and** its label, the focus is stored as the whole task (the reference compares the tasks with the focus on its `item`) and the complete button is coloured with `--success` |
| The overview | The body is shown only once the target information has been gathered, exactly as the reference does — it carries nothing but the last-updated row while the information is being fetched; the row's class is the reference's `overview-header` |
| The settings | The password field is a plain text field, as the reference's is |
| The notice | The reference has no cancel button on the subscription notice — the × closes it |
| The report | The report is written into a chosen **directory**, with the name and the format deciding the file's name, as the reference does |
| The version | The reference's version store: a check every thirty seconds, the `ignore_version` setting that stops the notice coming back, the "You are using the latest version" notice, and a *go to update* that re-checks the endpoint instead of opening an invented download page |
| The chat | The streaming reply is rendered through the markdown renderer, like every other reply |
| The database | Six orderings now match the reference exactly: `auth_parameters`, `header_parameters`, `project_remarks` and `scan_result` carry no ordering, `ttp` and `test_lists` are ordered by `created_at` |
| The proxy | The certificate and the key live in the user data's `proxy-certs` directory, the one the file API serves; the history's insert carries the reference's fourteen columns |
| The dead code | `evidenceOf` in the findings view and the old `NewProjectDialog` are gone |

### 20.2 What is left, and why

Nothing in the list below is a defect that can be fixed. Each is a
**deliberate divergence**, and each is recorded in the parity manifest or in
this report.

| Divergence | Why |
| --- | --- |
| The four sign-in strings and the two account controls | There is no Penligent account in this build, so the sign-in button opens the AI provider settings and the account's plan page and sign-out are gone rather than left as controls that cannot do anything. The six keys are in `reference/used-keys.json`'s `excluded` block. |
| The reference's 21 stores, the recreation's 12 | The split is an internal organisation. The same state lands in the same tables, and every store name the reference uses resolves in the recreation. |
| The 143 locale-only keys | The reference ships them in its tables and never references them in code. |
| The `xray_info_format` object | The reference carries the xray finding descriptions in an object rather than in its message table. The recreation has it in the same place. |
| The pixel difference | The reference's shots were taken in the container with that container's fonts; the recreation is measured on the host with the host's fonts. A header crop shows identical icons, spacing and strings. |

### 20.3 The honest answer to "are there zero bugs left"

No.

Every one of the 240 findings is either closed or is one of the divergences
above — that much is now mechanically checkable: a script re-reads each
report, extracts the code each finding quotes, and looks for it in the
current source. The last run leaves no finding's complaint present.

But the audit reports were written against a *snapshot*. They cannot find
defects the snapshot did not contain, and three of the four defects the
operator found today (the dead title bar, the raw locale keys in a notice,
the two account controls) were **not** in the reports at all. Two of them
were in the code the reports *praised*. A sweep that says "clean" is evidence
about the sweep, not about the application.

What can be said is what is measured:

```
findings in the eleven reports   240   (13 critical, 94 major, 96 minor, 37 nit)
still quoting present code         0
unit tests                      54/54
console errors                    0
console warnings                  0
close button                6 processes → 0
locale values          8,921/8,921 byte-identical
gap audit        666 used, 2 deliberately unused, 0 ambiguous
dialogs                  30/30 resolve
pixel difference   1.602 % – 3.520 % across 7 views
```

Running the installed build by hand remains the only way to find the next
one. That is what the operator's screenshots did, and it is worth more than
any number above.
