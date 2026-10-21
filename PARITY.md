# Feature parity matrix

Generated from the reference's de-obfuscated renderer bundle:
**93** named components, **30** dialogs,
**21** Pinia stores, **48** i18n namespaces,
**3** routes
('/', '/proxy-list', '/splash-window').

Every one of the reference's **30** dialog names now resolves in the
reconstruction's dialog host, including the twelve that were missing:
`task-set`, `tool-set-add`, `chat-model`, `auto-target-info`,
`auto-target-scan`, `test-list-add`, `test-task-add`, `test-list-generate`,
`test-phase-edit`, `test-phase-delete`, `create` and
`create-agent-scan-task`.

Each entry below is checked against this reconstruction's own source. The
recovered locale files are excluded from the check, because a recovered
string proves the wording exists, not that the feature is implemented.

| Reference feature | Status |
| --- | --- |
| HomeView | implemented |
| OverView | implemented |
| Risk | implemented |
| Task | implemented |
| ToolSet | implemented |
| Chat | implemented |
| Onboarding | implemented |
| Notice | implemented |
| Setting | implemented |
| Report | implemented |
| ProxyList | implemented |
| Splash | implemented |
| Logo | implemented |
| tooladd | implemented |
| taskcreate | implemented |
| authadd | implemented |
| envpath | implemented |
| headeradd | implemented |
| complianceconfirm | implemented |
| notsubscribed | implemented |
| notlimit | implemented |
| newversion | implemented |
| feed-back | implemented |
| ai-tools | implemented |
| abnormal-process | implemented |
| xray_info_format | implemented |
| auto-target-scan | implemented |
| scan pipeline (create-process) | implemented |
| proxy how-to guide | implemented |
| reverse shell generator | implemented |
| AI tools panel | implemented |
| test list create dialog | implemented |
| reportdownload | implemented |
| TacticsLibrary | implemented |
| AiTools | implemented |
| CreateProcess | implemented |
| AutoTargetScan | implemented |
| WebshellDetection | implemented |
| Http2Python | implemented |
| ReverseShell | implemented |
| HowUse | implemented |
| fun-string thinking message | implemented |
| Skills | implemented |
| PluginManager | implemented |
| dialog store (openDialog) | implemented |
| dialog host | implemented |
| theme control (dark/light) | implemented |
| font size control | implemented |
| dependency manifest + fetch script | implemented |
| overview store (over_view document) | implemented |
| threat map on vue flow | implemented |
| agent security nav dialog | implemented |
| security toolbox tabs | implemented |
| test task add/edit dialog | implemented |
| risk verification workflow | implemented |
| penligent provider | implemented |
| SSE | implemented |
| vue-i18n | implemented |
| i18n locales (11 languages) | implemented |
| i18n locale wiring | implemented |
| onboarding language picker | implemented |
| agent orchestration | implemented |
| system_prompt_config | implemented |
| report generator | implemented |
| model list / routing | implemented |
| vue-flow | implemented |
| tiptap (rich text editor) | implemented |
| skills library (ttp table) | implemented |
| proxy guide (proxy-how-use) | implemented |
| gsap | implemented |

Coverage: **70/70**

The reference's eleven locale tables hold **811** leaf values each — **8,921**
in total — and every one of them is byte-identical to the reconstruction's.
Of the **459** keys the reference itself addresses with `$t(...)`, all but
the four sign-in strings are present and in use.

The reference splits its state across **21** Pinia stores
(chat, credits, dialog, intercept, layout, main, mapping, notice, overview, plugin, proxy, repeater, report, result, risk, scan, setting, task, theme, toolset, version). This reconstruction uses fewer, larger
stores that hold the same state — the split is an internal organisation
choice, not a behavioural difference, and the data still lands in the same
tables.

