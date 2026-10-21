# Bug Audit

A systematic pass over the reconstruction looking for defects in the AI
provider layer, the data layer, the IPC surface, the renderer components and
the Electron main process. Every defect below was **reproduced**, **fixed**,
and is now covered by a **regression test** that fails against the old code.

Run the audit's tests with:

```bash
npm run test:regressions   # the provider-layer defects
npm run test:db            # includes the orphaned-rows defect
```

---

## 1. Defects found and fixed

### B1 — Saving the AI settings erased the stored API key

**Severity: high (data loss)**

`writeConfig` wrote `apiKey: config.apiKey ?? ""`. The settings dialog only
sends a key when the user actually retypes it, so every save of an unrelated
field (model, temperature, system prompt) replaced the stored key with an
empty string — while the dialog was telling the user *"A key is already
saved. Leave this empty to keep it."*

**Fix** — an absent key (`undefined`) now means "unchanged"; only an explicit
empty string clears it:

```js
apiKey: config.apiKey === undefined ? existingKey : config.apiKey
```

**Test** — `B1: saving without a new key keeps the stored key` and
`B1: the retained key still authenticates` (a real request, not a flag).

### B2 — "Test connection" ignored the saved key

**Severity: high (feature broken)**

`ai-test` merged the caller's overrides with a spread. The dialog passes
`apiKey: undefined` when the key was not retyped, and a spread copies
explicitly-`undefined` properties — so the saved key was shadowed and the
probe went out unauthenticated, producing a spurious 401.

**Fix** — only overrides that were actually supplied are applied.

**Test** — `B2: an undefined override does not shadow the stored key` plus
`B2: the request carried the stored key`, which reads the mock's recorded
request and asserts the `Authorization` header.

### B3 — Every request carried the user's message twice

**Severity: medium (cost, and confusing replies)**

`send()` persisted the user message, refreshed the store, then built the
request as `[...historyForRequest(), { role: "user", content: text }]`. The
history already contained the message that had just been persisted, so it was
sent twice on every turn.

**Fix** — the history drops the trailing user message when it is the one
being sent.

**Test** — `B3: the request contains the user message exactly once`, counted
from the mock's recorded request.

### B4 — Command output arrived as a Buffer object, not text

**Severity: medium (feature broken)**

`ipc/command.cjs` forwarded `chunk` straight from `stdout`. A Buffer does
not survive the IPC serialiser as text — it arrives as
`{ type: "Buffer", data: [...] }` — so the command output could not be
displayed.

**Fix** — the chunk is converted with `chunk.toString("utf8")`.

**Test** — `B4: command output arrives as a string`, which runs
`echo audit-output` and checks the type of the received chunk.

### B5 — A provider that answers with JSON instead of SSE produced no reply

**Severity: medium**

The streaming path assumed Server-Sent Events and split the body on
`\n\n`. Several OpenAI-compatible servers ignore `stream: true` and answer
with a single JSON document; the reply was then silently empty.

**Fix** — the response's content type is checked, and a non-SSE body is
parsed and emitted as a single delta.

**Test** — `B5: a non-SSE provider response still yields a reply`, using a
mock model (`mock-nostream`) that deliberately ignores the stream flag.

### B6 — Base URLs were concatenated naively

**Severity: medium**

`buildRequest` appended a fixed suffix, so:

| Base URL entered | Endpoint actually called |
| --- | --- |
| `https://api.anthropic.com/v1` | `…/v1/v1/messages` ✗ |
| `https://api.openai.com` | `…/chat/completions` ✗ (missing `/v1`) |
| `http://localhost:11434/v1` | `…/v1/chat/completions` ✓ |

**Fix** — `resolveEndpoint()` normalises every shape, and the resolved
endpoint is returned to the renderer so the settings dialog shows exactly
what will be called.

**Test** — `B6: every base-URL shape resolves to the right endpoint` covers
seven base-URL/provider combinations.

### B7 — A DevTools listener leaked on every message sent

**Severity: low (slow leak)**

`ChatPanel` registered a new `ai-stream-data` listener on each send and only
disposed it on an explicit stop — the normal completion path dropped the
reference without disposing it, so the listener count grew with every
message.

**Fix** — one listener is registered for the component's lifetime and
dispatches to the stream that owns the event.

### B8 — Window listeners were never removed

**Severity: low (leak)**

`HomeView` registered eight `window` listeners and detached only two;
`LeftPanel` never detached its listener.

**Fix** — every listener is tracked and detached in `onBeforeUnmount`.

### B9 — `update-user-info` threw on a missing payload

**Severity: low**

The handler dereferenced `info.id` without a guard, so a malformed call
rejected with an unhandled `TypeError` in the main process.

**Fix** — the handler validates the payload and returns a structured error.

### B10 — Deleting a project left orphaned rows behind

**Severity: medium (visible defect)**

`DELETE FROM projects WHERE id = ?` removed only the project row. The
schema declares no foreign keys, so the project's test lists, chat records,
findings, executions, crawler results, scan results, report exports,
parameters, remarks and AI tools survived. A deleted project therefore kept
showing its test list — the Task List badge kept counting a test list that
belonged to a project that no longer existed.

**Fix** — `deleteProject` removes every project-scoped table inside a
transaction.

**Test** — `deleting a project removes its dependent rows` in
`test/db.test.cjs`.

### B11 — A provider error was wiped by the `end` event

**Severity: low (diagnosability)**

The stream protocol always sends `end` after `error`, and `finish()` cleared
`liveError` unconditionally — so the error message was removed as soon as it
appeared.

**Fix** — `finish()` takes a `failed` flag and keeps the error.

### B12 — `max_tokens` was rejected by newer OpenAI models

**Severity: low (compatibility)**

Reasoning models (`o1`, `o3`, `gpt-5…`) require `max_completion_tokens` and
reject `temperature`. They answered 400 and the request failed.

**Fix** — known model families use the modern field names, and a request
that is rejected with *"max_tokens is not supported"* is retried once with
`max_completion_tokens`. The retry is scoped to the OpenAI family so
Anthropic's legitimate *"max_tokens must be ≤ N"* value errors are not
retried.

### B13 — The overlay-scrollbar switch clobbered Electron's own features

**Severity: low (robustness)**

`app.commandLine.appendSwitch("enable-features", "OverlayScrollbar")`
replaces any value Electron had already set.

**Fix** — the existing value is read from `process.argv` and merged.

### B14 — Re-selecting the active provider wiped the configuration

**Severity: low (UX)**

Clicking the already-selected provider card in the settings dialog reset
the base URL and model to the defaults.

**Fix** — selecting the current provider is a no-op.

### B15 — There was no way to clear a stored key

**Severity: low (UX)**

`ai-clear-key` existed in the main process but nothing in the UI called it,
so a key could only be removed by saving an explicit empty value.

**Fix** — a "Clear saved key" action in the settings dialog.

---

## 2. Areas audited and found sound

| Area | Checked |
| --- | --- |
| Database layer | Parameterised statements throughout (no string interpolation of user data); `ON CONFLICT` upsert on `setting_key`; transactions for the bulk risk insert and the project cascade |
| IPC surface | Every handler is registered exactly once; no handler dereferences an unchecked payload |
| Provider adapters | Both payload shapes; auth headers; SSE and non-SSE bodies; `AbortSignal` timeouts on the non-streaming paths; abort on stop |
| Renderer | Vue escapes all interpolated model output (no `v-html`); no `localStorage` key holds a secret |
| Renderer | Listener lifecycles; `pendingText` guards the duplicate-message fix; the stream registry is cleared on unmount |
| Main process | Database initialisation happens before the window is created; the app still starts (and logs) if it fails |
| Error surfacing | Provider errors are shown verbatim in the chat panel and as a toast; the "Test connection" button reports the real status code and message |

## 3. Deliberately not changed

* **The API key is stored in plaintext** in the `user_settings` table. The
  reference stores its LLM token in an *encrypted* database; the
  reconstruction stores an unencrypted database so the data stays
  inspectable (see `COMPARISON.md` D4). The key is never written to
  `localStorage`, never sent anywhere except the configured provider, and is
  masked whenever it is read back into the renderer.
* **Arbitrary command execution** through `execute-command` is retained: it
  is the product's core function and the reference behaves identically.
* **Arbitrary file reads and writes** through `read-file` / `write-file` are
  retained for the same reason.
